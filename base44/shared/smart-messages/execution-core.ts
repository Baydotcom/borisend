import { calculateNextTrigger, generateExecutionKey } from './trigger-calculator.ts';
import {
  checkSmartMessageCapacity,
  getCapacityStatus,
} from '../entitlements/entitlement-service.ts';

/**
 * RC20 — Shared Smart Message execution core.
 *
 * The canonical Smart Message execution logic, shared by:
 *   - executeSmartMessage  (manual / time / date triggers — user-initiated)
 *   - processGeofenceEvent (location arrival/departure — OS geofence transition)
 *
 * This guarantees ONE execution engine. Geofence events do NOT run a competing
 * pipeline; they feed the same ownership → capacity → idempotency → ledger →
 * Message creation path used by every other trigger.
 *
 * §28: Automatic occurrences default to status=pending (user-assisted
 * delivery). Explicit user-triggered occurrences may opt into status=approved
 * so the user lands directly in the send-ready flow. The content is the
 * already-stored fixed SmartMessage.content — NO LLM.
 *
 * Returns a Response object matching executeSmartMessage's historical shape.
 */
export async function executeOccurrence(
  sr: any,
  userId: string,
  smartMessage: any,
  occurrence: string,
  now: Date = new Date(),
  options: { initialStatus?: 'pending' | 'approved' } = {},
): Promise<Response> {
  // 1. Load eligible recipients (§5 — SmartMessageRecipient status=active)
  const recipients = await sr.entities.SmartMessageRecipient.filter({
    smart_message_id: smartMessage.id,
    status: 'active',
  });

  if (recipients.length === 0) {
    return Response.json({
      success: true,
      message: 'No active recipients for this Smart Message',
      idempotent: true,
      executed_count: 0,
      total_recipients: 0,
    });
  }

  // 2. Load Contact details for each recipient
  const contacts = await sr.entities.Contact.filter({ owner_user_id: userId });
  const contactMap = new Map(contacts.map((c: any) => [c.id, c]));

  // 3. Check idempotency — filter out recipients already executed for this occurrence
  const executionKeys = recipients.map((r: any) =>
    generateExecutionKey(userId, smartMessage.id, r.contact_id, occurrence),
  );

  let alreadyExecuted = new Set<string>();
  try {
    const existingEntries = await sr.entities.SmartMessageUsageLedger.filter({
      owner_user_id: userId,
      status: 'consumed',
    });
    const existingKeys = new Set(existingEntries.map((e: any) => e.execution_key));
    alreadyExecuted = new Set(executionKeys.filter(k => existingKeys.has(k)));
  } catch { /* ledger unavailable — proceed */ }

  const pendingRecipients = recipients.filter((r: any) =>
    !alreadyExecuted.has(generateExecutionKey(userId, smartMessage.id, r.contact_id, occurrence)),
  );

  if (pendingRecipients.length === 0) {
    // All recipients already executed for this occurrence — idempotent success
    return Response.json({
      success: true,
      message: 'Already executed for this occurrence',
      idempotent: true,
      executed_count: 0,
      total_recipients: recipients.length,
    });
  }

  // 4. Check capacity — ATOMIC for all pending recipients (§31)
  const capacityCheck = await checkSmartMessageCapacity(sr, userId, pendingRecipients.length);
  if (!capacityCheck.allowed) {
    // §31: BLOCK the entire occurrence — do not partially execute
    await createCapacityNotification(sr, userId, smartMessage, capacityCheck, now);

    await sr.entities.SmartMessage.update(smartMessage.id, {
      last_execution_status: 'blocked',
    });

    return Response.json({
      success: false,
      blocked: true,
      reason: 'capacity_exhausted',
      message: capacityCheck.reason,
      remaining: capacityCheck.remaining,
      required: capacityCheck.requiredUnits,
    }, { status: 402 });
  }

  // 5. Execute — create ledger entries + Message records
  const ent = await getCapacityStatus(sr, userId, now);
  const executed = [];

  for (const recipient of pendingRecipients) {
    const contact = contactMap.get(recipient.contact_id);
    const executionKey = generateExecutionKey(userId, smartMessage.id, recipient.contact_id, occurrence);

    // Create immutable ledger entry (§27 — consumption point)
    await sr.entities.SmartMessageUsageLedger.create({
      owner_user_id: userId,
      smart_message_id: smartMessage.id,
      execution_key: executionKey,
      recipient_contact_id: recipient.contact_id,
      trigger_occurrence: occurrence,
      trigger_type: smartMessage.trigger_type,
      consumed_at: now.toISOString(),
      period_start: ent.periodStart,
      period_end: ent.periodEnd,
      units_consumed: 1,
      status: 'consumed',
    });

    // Create Message record with fixed content (§28 — user-assisted delivery)
    const messageRecord = await sr.entities.Message.create({
      smart_message_id: smartMessage.id,
      campaign_id: null,
      user_id: userId,
      content: smartMessage.content,
      recipient_name: contact?.display_name || 'Unknown',
      recipient_phone: contact?.phone_number || null,
      status: options.initialStatus || 'pending',
      generation_key: `smart:${executionKey}`,
      occurrence: occurrence,
      communication_mode: 'shared',
    });

    executed.push({
      contact_id: recipient.contact_id,
      contact_name: contact?.display_name || 'Unknown',
      message_id: messageRecord.id,
    });
  }

  // Automatic Smart Message occurrences should surface immediately on native
  // devices. Manual Trigger Now passes initialStatus='approved' and navigates
  // directly to the created Message, so it deliberately does not send itself a
  // redundant push.
  if (!options.initialStatus && executed.length > 0) {
    const firstMessageId = executed[0].message_id;
    const title = executed.length === 1 ? 'Smart Message ready' : `${executed.length} Smart Messages ready`;
    const body = executed.length === 1
      ? `"${smartMessage.name}" is ready for review and sending.`
      : `"${smartMessage.name}" prepared ${executed.length} messages for review and sending.`;
    try {
      await sr.entities.Notification.create({
        user_id: userId,
        created_by_id: userId,
        title,
        body,
        type: 'message_ready',
        priority: 'high',
        action_label: 'Open',
        action_url: `/messages/${firstMessageId}`,
        message_id: firstMessageId,
        is_read: false,
        status: 'active',
      });
      const deviceTokens = await sr.entities.DeviceToken.filter({ created_by_id: userId, is_active: true }).catch(() => []);
      if (deviceTokens.length > 0) {
        await sr.integrations.Core.SendPushNotification({
          user_id: userId,
          title,
          content: body,
          action_label: 'Open',
          action_url: `borisend://message/${firstMessageId}`,
        }).catch((pushErr: any) => console.warn('[SmartMessage] Push notification failed:', pushErr.message));
      }
    } catch { /* best-effort; execution remains authoritative */ }
  }

  // 6. Update Smart Message metadata
  const nextTriggerAt = calculateNextTrigger(smartMessage.trigger_type, smartMessage.trigger_config, null, now);
  await sr.entities.SmartMessage.update(smartMessage.id, {
    last_triggered_at: now.toISOString(),
    next_trigger_at: nextTriggerAt,
    last_execution_status: 'success',
  });

  return Response.json({
    success: true,
    executed_count: executed.length,
    total_recipients: recipients.length,
    idempotent_count: alreadyExecuted.size,
    executed,
    smart_message_remaining: capacityCheck.remaining - executed.length,
  });
}

/**
 * §50/§51: Create a deduplicated notification for capacity exhaustion.
 */
async function createCapacityNotification(sr, userId, smartMessage, capacityCheck, now) {
  try {
    const existing = await sr.entities.Notification.filter({
      user_id: userId,
      type: 'quota_warning',
      status: 'active',
    });
    const recent = existing.find(n =>
      n.title?.includes('Smart Message') &&
      n.created_date &&
      new Date(n.created_date) > new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );
    if (recent) return;

    await sr.entities.Notification.create({
      user_id: userId,
      created_by_id: userId,
      title: 'Smart Message blocked',
      body: `"${smartMessage.name}" could not be sent — you've used your Smart Messages for this period (${capacityCheck.used}/${capacityCheck.effective}).`,
      type: 'quota_warning',
      priority: 'medium',
      is_read: false,
      status: 'active',
    });
  } catch { /* non-blocking */ }
}