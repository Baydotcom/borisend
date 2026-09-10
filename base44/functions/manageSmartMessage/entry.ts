import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { calculateNextTrigger } from '../../shared/smart-messages/trigger-calculator.ts';

/**
 * RC20.1: validateLocationTrigger — server-side guard.
 * A location Smart Message must NOT be activatable without a valid configured
 * location (lat, lng, radius 50–1000m). Returns an error message or null.
 * Ownership, capacity, and execution idempotency remain authoritative in
 * processGeofenceEvent / execution-core.
 */
function isLocationTrigger(trigger_type) {
  return trigger_type === 'location_arrival' || trigger_type === 'location_departure';
}

function withCanonicalGeofenceId(trigger_type, trigger_config, smartMessageId) {
  if (!isLocationTrigger(trigger_type)) return trigger_config || {};
  return {
    ...(trigger_config || {}),
    geofence_id: `borisend_sm_${smartMessageId}`,
  };
}

function validateLocationTrigger(trigger_type, trigger_config) {
  if (!isLocationTrigger(trigger_type)) return null;
  const cfg = trigger_config || {};
  const lat = Number(cfg.location_latitude);
  const lng = Number(cfg.location_longitude);
  const radius = Number(cfg.location_radius_meters);
  if (!isFinite(lat) || lat < -90 || lat > 90) return 'A valid location is required to activate this Smart Message';
  if (!isFinite(lng) || lng < -180 || lng > 180) return 'A valid location is required to activate this Smart Message';
  if (!isFinite(radius) || radius < 50 || radius > 1000) return 'Detection radius must be between 50 and 1000 metres';
  return null;
}

/**
 * RC18.1 — manageSmartMessage
 *
 * CRUD operations for Smart Messages and their recipients.
 *
 * Actions:
 *   create        — Create a Smart Message + link recipients
 *   update        — Update Smart Message fields + sync recipients
 *   delete        — Delete Smart Message + recipient linkages (does NOT refund usage)
 *   toggle        — Activate/pause Smart Message
 *   getRecipients — Get recipient contacts for a Smart Message
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'create':
        return await handleCreate(base44, user, body);
      case 'update':
        return await handleUpdate(base44, user, body);
      case 'delete':
        return await handleDelete(base44, user, body);
      case 'toggle':
        return await handleToggle(base44, user, body);
      case 'getRecipients':
        return await handleGetRecipients(base44, user, body);
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[manageSmartMessage] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function handleCreate(base44, user, body) {
  const { name, description, content, trigger_type, trigger_config, message_language, contact_ids, status } = body;

  if (!name || !content || !trigger_type) {
    return Response.json({ error: 'name, content, and trigger_type are required' }, { status: 400 });
  }
  if (!contact_ids || contact_ids.length === 0) {
    return Response.json({ error: 'At least one recipient is required' }, { status: 400 });
  }

  // Verify all contacts belong to the user
  const contacts = await base44.entities.Contact.filter({ owner_user_id: user.id, is_active: true });
  const validContactIds = new Set(contacts.map(c => c.id));
  const invalidIds = contact_ids.filter(id => !validContactIds.has(id));
  if (invalidIds.length > 0) {
    return Response.json({ error: 'One or more contacts not found or not owned by you' }, { status: 403 });
  }

  // RC20.1: location Smart Messages require a valid configured location to activate.
  if ((status || 'inactive') === 'active') {
    const locErr = validateLocationTrigger(trigger_type, trigger_config);
    if (locErr) return Response.json({ error: locErr }, { status: 400 });
  }

  const now = new Date();
  const nextTriggerAt = calculateNextTrigger(trigger_type, trigger_config, null, now);

  // Create the Smart Message (use service role to set owner_user_id authoritatively)
  const sr = base44.asServiceRole;
  let smartMessage = await sr.entities.SmartMessage.create({
    owner_user_id: user.id,
    name,
    description: description || null,
    content,
    trigger_type,
    trigger_config: trigger_config || {},
    message_language: message_language || null,
    status: status || 'inactive',
    next_trigger_at: nextTriggerAt,
    last_triggered_at: null,
    last_execution_status: null,
  });

  // Persist the canonical native geofence identifier server-side after the
  // Smart Message ID exists. Native registration and backend event validation
  // use this same deterministic value.
  if (isLocationTrigger(trigger_type)) {
    const canonicalConfig = withCanonicalGeofenceId(trigger_type, trigger_config, smartMessage.id);
    smartMessage = await sr.entities.SmartMessage.update(smartMessage.id, { trigger_config: canonicalConfig });
  }

  // Create SmartMessageRecipient linkages
  const recipients = await sr.entities.SmartMessageRecipient.bulkCreate(
    contact_ids.map(contact_id => ({
      owner_user_id: user.id,
      smart_message_id: smartMessage.id,
      contact_id,
      status: 'active',
      joined_at: now.toISOString(),
    })),
  );

  return Response.json({
    success: true,
    smart_message: smartMessage,
    recipient_count: recipients.length,
    next_trigger_at: nextTriggerAt,
  });
}

async function handleUpdate(base44, user, body) {
  const { smart_message_id, name, description, content, trigger_type, trigger_config, message_language, contact_ids, status } = body;

  if (!smart_message_id) {
    return Response.json({ error: 'smart_message_id is required' }, { status: 400 });
  }

  const sr = base44.asServiceRole;
  const sm = await sr.entities.SmartMessage.get(smart_message_id).catch(() => null);
  if (!sm) return Response.json({ error: 'Smart Message not found' }, { status: 404 });
  if (sm.owner_user_id !== user.id) return Response.json({ error: 'Not authorized' }, { status: 403 });

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (content !== undefined) updates.content = content;
  if (trigger_type !== undefined) updates.trigger_type = trigger_type;
  if (trigger_config !== undefined) {
    const effectiveTypeForConfig = trigger_type || sm.trigger_type;
    updates.trigger_config = withCanonicalGeofenceId(effectiveTypeForConfig, trigger_config, smart_message_id);
    // Recalculate next trigger if trigger changed
    updates.next_trigger_at = calculateNextTrigger(effectiveTypeForConfig, updates.trigger_config, null, new Date());
  }
  if (message_language !== undefined) updates.message_language = message_language;
  if (status !== undefined) updates.status = status;

  // RC20.1: validate location config if the Smart Message will be active after this update.
  const effectiveTriggerType = trigger_type !== undefined ? trigger_type : sm.trigger_type;
  const effectiveConfig = trigger_config !== undefined
    ? withCanonicalGeofenceId(effectiveTriggerType, trigger_config, smart_message_id)
    : withCanonicalGeofenceId(effectiveTriggerType, sm.trigger_config, smart_message_id);
  if (isLocationTrigger(effectiveTriggerType) && trigger_config === undefined) {
    updates.trigger_config = effectiveConfig;
  }
  const effectiveStatus = status !== undefined ? status : sm.status;
  if (effectiveStatus === 'active') {
    const locErr = validateLocationTrigger(effectiveTriggerType, effectiveConfig);
    if (locErr) return Response.json({ error: locErr }, { status: 400 });
  }

  const updated = await sr.entities.SmartMessage.update(smart_message_id, updates);

  // Sync recipients if contact_ids provided
  if (contact_ids !== undefined) {
    // Verify contacts belong to user
    const contacts = await base44.entities.Contact.filter({ owner_user_id: user.id, is_active: true });
    const validContactIds = new Set(contacts.map(c => c.id));
    const invalidIds = contact_ids.filter(id => !validContactIds.has(id));
    if (invalidIds.length > 0) {
      return Response.json({ error: 'One or more contacts not found or not owned by you' }, { status: 403 });
    }

    // Get existing recipients
    const existing = await sr.entities.SmartMessageRecipient.filter({ smart_message_id: smart_message_id });
    const existingIds = new Set(existing.map(r => r.contact_id));
    const newIds = new Set(contact_ids);

    // Delete removed recipients
    const toDelete = existing.filter(r => !newIds.has(r.contact_id));
    for (const r of toDelete) {
      await sr.entities.SmartMessageRecipient.delete(r.id);
    }

    // Add new recipients
    const toAdd = contact_ids.filter(id => !existingIds.has(id));
    if (toAdd.length > 0) {
      const now = new Date().toISOString();
      await sr.entities.SmartMessageRecipient.bulkCreate(
        toAdd.map(contact_id => ({
          owner_user_id: user.id,
          smart_message_id: smart_message_id,
          contact_id,
          status: 'active',
          joined_at: now,
        })),
      );
    }
  }

  return Response.json({ success: true, smart_message: updated });
}

async function handleDelete(base44, user, body) {
  const { smart_message_id } = body;
  if (!smart_message_id) {
    return Response.json({ error: 'smart_message_id is required' }, { status: 400 });
  }

  const sr = base44.asServiceRole;
  const sm = await sr.entities.SmartMessage.get(smart_message_id).catch(() => null);
  if (!sm) return Response.json({ error: 'Smart Message not found' }, { status: 404 });
  if (sm.owner_user_id !== user.id) return Response.json({ error: 'Not authorized' }, { status: 403 });

  // §36: Deleting a Smart Message stops future occurrences but does NOT refund
  // previously consumed Smart Message Units. Historical commercial ledger remains.
  // Do not hard-delete usage records.

  // Delete recipient linkages
  const recipients = await sr.entities.SmartMessageRecipient.filter({ smart_message_id: smart_message_id });
  for (const r of recipients) {
    await sr.entities.SmartMessageRecipient.delete(r.id);
  }

  // Delete the Smart Message itself
  await sr.entities.SmartMessage.delete(smart_message_id);

  return Response.json({ success: true, deleted: true });
}

async function handleToggle(base44, user, body) {
  const { smart_message_id, status } = body;
  if (!smart_message_id || !status) {
    return Response.json({ error: 'smart_message_id and status are required' }, { status: 400 });
  }
  if (status !== 'active' && status !== 'inactive') {
    return Response.json({ error: 'status must be active or inactive' }, { status: 400 });
  }

  const sr = base44.asServiceRole;
  const sm = await sr.entities.SmartMessage.get(smart_message_id).catch(() => null);
  if (!sm) return Response.json({ error: 'Smart Message not found' }, { status: 404 });
  if (sm.owner_user_id !== user.id) return Response.json({ error: 'Not authorized' }, { status: 403 });

  // RC20.1: activating a location Smart Message requires a valid configured location.
  if (status === 'active') {
    const locErr = validateLocationTrigger(sm.trigger_type, sm.trigger_config);
    if (locErr) return Response.json({ error: locErr }, { status: 400 });
  }

  const updates: any = { status };
  if (status === 'active') {
    updates.next_trigger_at = calculateNextTrigger(sm.trigger_type, sm.trigger_config, null, new Date());
  }

  const updated = await sr.entities.SmartMessage.update(smart_message_id, updates);
  return Response.json({ success: true, smart_message: updated });
}

async function handleGetRecipients(base44, user, body) {
  const { smart_message_id } = body;
  if (!smart_message_id) {
    return Response.json({ error: 'smart_message_id is required' }, { status: 400 });
  }

  const sr = base44.asServiceRole;
  const sm = await sr.entities.SmartMessage.get(smart_message_id).catch(() => null);
  if (!sm) return Response.json({ error: 'Smart Message not found' }, { status: 404 });
  if (sm.owner_user_id !== user.id) return Response.json({ error: 'Not authorized' }, { status: 403 });

  const recipients = await sr.entities.SmartMessageRecipient.filter({ smart_message_id: smart_message_id });

  // Load contact details
  const contacts = await base44.entities.Contact.filter({ owner_user_id: user.id });
  const contactMap = new Map(contacts.map(c => [c.id, c]));

  const result = recipients.map(r => {
    const contact = contactMap.get(r.contact_id);
    return {
      id: r.id,
      contact_id: r.contact_id,
      status: r.status,
      joined_at: r.joined_at,
      display_name: contact?.display_name || 'Unknown',
      phone_number: contact?.phone_number || null,
    };
  });

  return Response.json({ success: true, recipients: result });
}