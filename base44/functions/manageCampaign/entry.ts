import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { checkSubscriptionAccess } from '../../shared/subscriptionGuard.ts';
import { computeNextDueTime } from '../../shared/scheduling.ts';
import { canActivatePlan, canActivateRecipients, acquireCapacityLock, releaseCapacityLock } from '../../shared/entitlements/entitlement-service.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;
    const body = await req.json();
    const { action, campaign_id, data } = body;

    // ── CREATE ──
    if (action === 'create') {
      const guard = await checkSubscriptionAccess(sr, user.id);
      if (!guard.allowed) {
        return Response.json({ error: guard.error, paused: guard.isPaused }, { status: 403 });
      }

      // ── RC12 entitlement capacity check (plan units + recipient units) ──
      const cleanRecipientCount = (data.recipients || []).filter(r => r && r.name && r.name.trim()).length;
      const lockReq = crypto.randomUUID();
      const capLock = await acquireCapacityLock(sr, user.id, lockReq);
      if (!capLock.acquired) {
        return Response.json({ error: capLock.reason, capacity_locked: true }, { status: 409 });
      }
      try {
        const planCheck = await canActivatePlan(sr, user.id, 1);
        if (!planCheck.allowed) {
          return Response.json({
            error: planCheck.reason, capacity_reached: true, capacity_type: 'plan',
            used: planCheck.consumption, effective: planCheck.effective, over_capacity: planCheck.overCapacity,
          }, { status: 403 });
        }
        if (cleanRecipientCount > 0) {
          const recCheck = await canActivateRecipients(sr, user.id, cleanRecipientCount);
          if (!recCheck.allowed) {
            return Response.json({
              error: recCheck.reason, capacity_reached: true, capacity_type: 'recipient',
              used: recCheck.consumption, effective: recCheck.effective, over_capacity: recCheck.overCapacity,
              requested: cleanRecipientCount,
            }, { status: 403 });
          }
        }

      // Compute initial next_scheduled for ALL schedule types so the scheduler
      // can server-side filter by next_scheduled <= now instead of loading
      // every active plan. (Authoritative due-time — see computeNextDueTime.)
      let campaignData = { ...data, name: String(data.name || '').trim(), user_id: user.id, created_by_id: user.id };
      if (!campaignData.name) {
        return Response.json({ error: 'Communication Plan name is required' }, { status: 400 });
      }
      if (!campaignData.next_scheduled) {
        const userTimezone = user?.timezone || 'UTC';
        campaignData.next_scheduled = computeNextDueTime(data, userTimezone, new Date(), false);
        console.info(`[manageCampaign] Set initial next_scheduled for ${data.schedule_type || 'specific_daily'} campaign: ${campaignData.next_scheduled} (tz: ${userTimezone})`);
      }
      const campaign = await sr.entities.Campaign.create(campaignData);
      const recSync = await syncPlanRecipients(sr, user.id, campaign.id, data.recipients || [], {
        relationship_type_id: data.relationship_type_id,
        relationship_state_id: data.relationship_state_id,
        relationship_goal_id: data.relationship_goal_id,
        recipient_context: data.purpose || '',
      });
      if (recSync.capacity_error) {
        return Response.json({
          error: recSync.capacity_reason, capacity_reached: true, capacity_type: 'recipient',
          used: recSync.used, effective: recSync.effective, requested: recSync.requested, campaign_id: campaign.id,
        }, { status: 403 });
      }

      // RC16.2 §40: Store relationship context answers as PlanRecipient-scoped
      // RelationshipMemory. Each answer becomes a durable, per-recipient fact
      // that provides factual grounding for message preparation (anti-fabrication).
      if (data.relationship_context_answers?.length > 0 && recSync.createdPRs?.length > 0) {
        for (const pr of recSync.createdPRs) {
          for (const ans of data.relationship_context_answers) {
            if (!ans.content?.trim()) continue;
            try {
              await sr.entities.RelationshipMemory.create({
                owner_user_id: user.id,
                campaign_id: campaign.id,
                plan_recipient_id: pr.id,
                memory_type: ans.memory_type || 'fact',
                content: ans.content.trim(),
                related_date: ans.related_date || undefined,
                is_active: true,
              });
            } catch (e) {
              console.warn('[manageCampaign] Memory creation failed:', e.message);
            }
          }
        }
      }

      return Response.json({ success: true, campaign });
      } finally {
        await releaseCapacityLock(sr, capLock.lockId);
      }
    }

    // ── UPDATE ──
    if (action === 'update') {
      if (!campaign_id) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

      let campaign;
      try {
        campaign = await sr.entities.Campaign.get(campaign_id);
      } catch (_) {
        return Response.json({ error: 'Campaign not found' }, { status: 404 });
      }

      if (campaign.created_by_id !== user.id && campaign.user_id !== user.id) {
        return Response.json({ error: 'Forbidden: you do not own this campaign' }, { status: 403 });
      }

      const guard = await checkSubscriptionAccess(sr, user.id);
      if (!guard.allowed) {
        return Response.json({ error: guard.error, paused: guard.isPaused }, { status: 403 });
      }

      // RC18.3.1 §12: Reactivation via update — if status is being changed to
      // 'active' from a non-reserving state (draft/completed/archived), check
      // Plan + Recipient capacity atomically BEFORE applying the status change.
      let updateData = { ...data };
      if ('name' in updateData) {
        updateData.name = String(updateData.name || '').trim();
        if (!updateData.name) {
          return Response.json({ error: 'Communication Plan name is required' }, { status: 400 });
        }
      }
      const isReactivation = data.status === 'active'
        && campaign.status !== 'active'
        && campaign.status !== 'paused';
      if (isReactivation) {
        const guard = await checkSubscriptionAccess(sr, user.id);
        if (!guard.allowed) {
          return Response.json({ error: guard.error, paused: guard.isPaused }, { status: 403 });
        }
        const lockReq = crypto.randomUUID();
        const capLock = await acquireCapacityLock(sr, user.id, lockReq);
        if (!capLock.acquired) {
          return Response.json({ error: capLock.reason, capacity_locked: true }, { status: 409 });
        }
        try {
          const planCheck = await canActivatePlan(sr, user.id, 1);
          if (!planCheck.allowed) {
            return Response.json({
              error: planCheck.reason, capacity_reached: true, capacity_type: 'plan',
              used: planCheck.consumption, effective: planCheck.effective, over_capacity: planCheck.overCapacity,
            }, { status: 403 });
          }
          const existingPRs = await sr.entities.PlanRecipient.filter({ owner_user_id: user.id, campaign_id, status: 'active' });
          if (existingPRs.length > 0) {
            const recCheck = await canActivateRecipients(sr, user.id, existingPRs.length);
            if (!recCheck.allowed) {
              return Response.json({
                error: recCheck.reason, capacity_reached: true, capacity_type: 'recipient',
                used: recCheck.consumption, effective: recCheck.effective, over_capacity: recCheck.overCapacity,
                requested: existingPRs.length,
              }, { status: 403 });
            }
          }
        } finally {
          await releaseCapacityLock(sr, capLock.lockId);
        }
      }

      // Recompute next_scheduled if any schedule field changed, so the
      // scheduler's due-time filter stays accurate for all schedule types.
      const scheduleChanged =
        'schedule_type' in data || 'schedule_time' in data || 'schedule_days' in data || 'schedule_dates' in data;
      if (scheduleChanged) {
        const userTimezone = user?.timezone || 'UTC';
        const merged = { ...campaign, ...data };
        updateData.next_scheduled = computeNextDueTime(merged, userTimezone, new Date(), false);
        console.info(`[manageCampaign] Recomputed next_scheduled after schedule update: ${updateData.next_scheduled}`);
      }
      const updated = await sr.entities.Campaign.update(campaign_id, updateData);
      if (Array.isArray(data.recipients)) {
        await syncPlanRecipients(sr, user.id, campaign_id, data.recipients, {
          relationship_type_id: data.relationship_type_id,
          relationship_state_id: data.relationship_state_id,
          relationship_goal_id: data.relationship_goal_id,
          recipient_context: data.purpose || '',
        });
      }
      return Response.json({ success: true, campaign: updated });
    }

    // ── TOGGLE STATUS ──
    if (action === 'toggleStatus') {
      if (!campaign_id) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

      let campaign;
      try {
        campaign = await sr.entities.Campaign.get(campaign_id);
      } catch (_) {
        return Response.json({ error: 'Campaign not found' }, { status: 404 });
      }

      if (campaign.created_by_id !== user.id && campaign.user_id !== user.id) {
        return Response.json({ error: 'Forbidden: you do not own this campaign' }, { status: 403 });
      }

      const newStatus = campaign.status === 'active' ? 'paused' : 'active';

      // RC18.3.1 §11/§12: Capacity is checked only when reactivating from a
      // NON-reserving state (draft, completed, archived). Paused plans already
      // reserve Plan + Recipient capacity (MODEL A), so paused→active needs no
      // additional capacity check — the capacity was never released.
      if (newStatus === 'active' && campaign.status !== 'paused') {
        const guard = await checkSubscriptionAccess(sr, user.id);
        if (!guard.allowed) {
          return Response.json({ error: guard.error, paused: guard.isPaused }, { status: 403 });
        }
        // ── RC12/§12: Reactivating a draft/completed/archived plan requires free Plan + Recipient capacity ──
        const lockReq = crypto.randomUUID();
        const capLock = await acquireCapacityLock(sr, user.id, lockReq);
        if (!capLock.acquired) {
          return Response.json({ error: capLock.reason, capacity_locked: true }, { status: 409 });
        }
        try {
          const planCheck = await canActivatePlan(sr, user.id, 1);
          if (!planCheck.allowed) {
            return Response.json({
              error: planCheck.reason, capacity_reached: true, capacity_type: 'plan',
              used: planCheck.consumption, effective: planCheck.effective, over_capacity: planCheck.overCapacity,
            }, { status: 403 });
          }
          // Check Recipient capacity for the plan's existing active PRs
          const existingPRs = await sr.entities.PlanRecipient.filter({ owner_user_id: user.id, campaign_id, status: 'active' });
          if (existingPRs.length > 0) {
            const recCheck = await canActivateRecipients(sr, user.id, existingPRs.length);
            if (!recCheck.allowed) {
              return Response.json({
                error: recCheck.reason, capacity_reached: true, capacity_type: 'recipient',
                used: recCheck.consumption, effective: recCheck.effective, over_capacity: recCheck.overCapacity,
                requested: existingPRs.length,
              }, { status: 403 });
            }
          }
          const userTimezone = user?.timezone || 'UTC';
          const nextScheduled = computeNextDueTime(campaign, userTimezone, new Date(), false);
          await sr.entities.Campaign.update(campaign_id, { status: newStatus, next_scheduled: nextScheduled });
          return Response.json({ success: true, status: newStatus, next_scheduled: nextScheduled });
        } finally {
          await releaseCapacityLock(sr, capLock.lockId);
        }
      }

      await sr.entities.Campaign.update(campaign_id, { status: newStatus });
      return Response.json({ success: true, status: newStatus });
    }

    // ── DUPLICATE ──
    if (action === 'duplicate') {
      if (!campaign_id) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

      let campaign;
      try {
        campaign = await sr.entities.Campaign.get(campaign_id);
      } catch (_) {
        return Response.json({ error: 'Campaign not found' }, { status: 404 });
      }

      if (campaign.created_by_id !== user.id && campaign.user_id !== user.id) {
        return Response.json({ error: 'Forbidden: you do not own this campaign' }, { status: 403 });
      }

      const guard = await checkSubscriptionAccess(sr, user.id);
      if (!guard.allowed) {
        return Response.json({ error: guard.error, paused: guard.isPaused }, { status: 403 });
      }

      // Duplicating creates a DRAFT plan, which does not consume active Plan Unit
      // capacity (RC12 §18). No capacity check required until the user activates it.
      const { id: _id, created_date, updated_date, created_by_id, ...rest } = campaign;
      const duplicated = await sr.entities.Campaign.create({
        ...rest,
        name: `${rest.name} (copy)`,
        status: 'draft',
        messages_sent: 0,
        user_id: user.id,
        created_by_id: user.id,
      });
      return Response.json({ success: true, campaign: duplicated });
    }

    // ── DELETE (RC16.2: archive, not hard-delete — preserves history) ──
    if (action === 'delete') {
      if (!campaign_id) return Response.json({ error: 'campaign_id is required' }, { status: 400 });

      let campaign;
      try {
        campaign = await sr.entities.Campaign.get(campaign_id);
      } catch (_) {
        return Response.json({ error: 'Campaign not found' }, { status: 404 });
      }

      if (campaign.created_by_id !== user.id && campaign.user_id !== user.id) {
        return Response.json({ error: 'Forbidden: you do not own this campaign' }, { status: 403 });
      }

      const nowIso = new Date().toISOString();

      // 1. Archive the campaign (terminal lifecycle state — never generates)
      await sr.entities.Campaign.update(campaign_id, {
        status: 'archived',
        next_scheduled: null,
      });

      // 2. Deactivate all active PlanRecipients (frees Recipient Units per RC12)
      const activePRs = await sr.entities.PlanRecipient.filter({
        owner_user_id: user.id,
        campaign_id: campaign_id,
        status: 'active',
      });
      for (const pr of activePRs) {
        await sr.entities.PlanRecipient.update(pr.id, {
          status: 'deactivated',
          deactivated_at: nowIso,
        });
      }

      // 3. Cancel pending/approved messages (sent messages are preserved)
      const pendingMsgs = await sr.entities.Message.filter({
        campaign_id: campaign_id,
        user_id: user.id,
        status: 'pending',
      }).catch(() => []);
      const approvedMsgs = await sr.entities.Message.filter({
        campaign_id: campaign_id,
        user_id: user.id,
        status: 'approved',
      }).catch(() => []);
      for (const msg of [...pendingMsgs, ...approvedMsgs]) {
        await sr.entities.Message.update(msg.id, { status: 'cancelled' });
      }

      console.info(`[manageCampaign] Archived campaign ${campaign_id}: ${activePRs.length} PlanRecipients deactivated, ${pendingMsgs.length + approvedMsgs.length} messages cancelled`);

      return Response.json({ success: true, archived: true });
    }

    return Response.json({ error: 'Unknown action. Use: create, update, toggleStatus, duplicate, delete' }, { status: 400 });
  } catch (error) {
    console.error('[manageCampaign] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Contact / PlanRecipient sync ──
// For each recipient {name, phone}: resolve-or-create an owner-scoped Contact
// (dedup by phone), then ensure a PlanRecipient links it to this plan with the
// plan-level relationship defaults. Recipients removed from the list are
// deactivated (the master Contact is never deleted). This is the bridge from
// the legacy `recipients` snapshot to the RC10 Contact / PlanRecipient model.
async function syncPlanRecipients(sr, ownerUserId, campaignId, recipients, opts = {}) {
  const { relationship_type_id, relationship_state_id, relationship_goal_id, recipient_context } = opts;
  // Phone is optional — a recipient with just a name is still a relationship (RC16).
  const clean = (recipients || []).filter(r => r && r.name && r.name.trim());
  if (clean.length === 0) {
    // No recipients supplied — deactivate all active PlanRecipients for this plan.
    const all = await sr.entities.PlanRecipient.filter({ owner_user_id: ownerUserId, campaign_id: campaignId, status: 'active' });
    for (const pr of all) {
      await sr.entities.PlanRecipient.update(pr.id, { status: 'deactivated', deactivated_at: new Date().toISOString() });
    }
    return { created: 0, deactivated: all.length, capacity_error: false };
  }

  const contactIds = [];
  for (const r of clean) {
    const phone = (r.phone || '').trim();
    // Dedup by phone when available; otherwise by display name (phone is optional).
    const existing = phone
      ? await sr.entities.Contact.filter({ owner_user_id: ownerUserId, phone_number: phone })
      : await sr.entities.Contact.filter({ owner_user_id: ownerUserId, display_name: r.name.trim() });
    let contact = existing[0];
    if (!contact) {
      const contactData = {
        owner_user_id: ownerUserId,
        display_name: r.name.trim(),
        first_name: r.name.trim(),
        is_active: true,
      };
      if (phone) contactData.phone_number = phone;
      contact = await sr.entities.Contact.create(contactData);
    }
    contactIds.push(contact.id);
  }

  const existingPRs = await sr.entities.PlanRecipient.filter({ owner_user_id: ownerUserId, campaign_id: campaignId, status: 'active' });
  let deactivated = 0;
  for (const pr of existingPRs) {
    if (!contactIds.includes(pr.contact_id)) {
      await sr.entities.PlanRecipient.update(pr.id, { status: 'deactivated', deactivated_at: new Date().toISOString() });
      deactivated++;
    }
  }

  // Net-new recipients (not already active in this plan).
  const netNewContactIds = contactIds.filter(cid => !existingPRs.some(pr => pr.contact_id === cid && pr.status === 'active'));

  // RC12: enforce Recipient Unit capacity before activating net-new recipients.
  // Never silently activate a partial set — block the whole net-new batch with a
  // clear capacity error so the user can purchase capacity or deactivate others.
  if (netNewContactIds.length > 0) {
    const recCheck = await canActivateRecipients(sr, ownerUserId, netNewContactIds.length);
    if (!recCheck.allowed) {
      return {
        created: 0, deactivated,
        capacity_error: true,
        capacity_reason: recCheck.reason,
        used: recCheck.consumption,
        effective: recCheck.effective,
        requested: netNewContactIds.length,
      };
    }
  }

  const createdPRs: any[] = [];
  for (const contactId of netNewContactIds) {
    const pr = await sr.entities.PlanRecipient.create({
      owner_user_id: ownerUserId,
      campaign_id: campaignId,
      contact_id: contactId,
      relationship_type_id: relationship_type_id || null,
      relationship_state_id: relationship_state_id || null,
      relationship_goal_id: relationship_goal_id || null,
      recipient_context: recipient_context || '',
      status: 'active',
      joined_at: new Date().toISOString(),
    });
    createdPRs.push(pr);
  }
  return { created: createdPRs.length, deactivated, createdPRs };
}