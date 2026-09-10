import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { checkSubscriptionAccess } from '../../shared/subscriptionGuard.ts';
import { computeNextDueTime } from '../../shared/scheduling.ts';
import { getCapacityStatus, checkMessageCapacity, acquireCapacityLock, releaseCapacityLock } from '../../shared/entitlements/entitlement-service.ts';
import { buildGenerationKey, deriveRecipientId, normalizeOccurrence } from '../../shared/message-engine/generation-key.ts';
import {
  checkUnresolvedForCampaign,
  checkUnresolvedPerPlanRecipient,
  buildReminderNotification,
} from '../../shared/message-engine/pending-resolution.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    console.info(`[SCHEDULER] Running at ${now.toISOString()}`);

    const nowIso = now.toISOString();

    // ── RC9 due-time filtering ──
    const dueCampaigns = await base44.asServiceRole.entities.Campaign.filter({
      status: 'active',
      next_scheduled: { $lte: nowIso },
    });
    const legacyCampaigns = await base44.asServiceRole.entities.Campaign.filter({
      status: 'active',
      next_scheduled: null,
    });
    const campaigns = [...dueCampaigns, ...legacyCampaigns];
    console.info(`[SCHEDULER] Due: ${dueCampaigns.length}, legacy(backfill): ${legacyCampaigns.length}, total: ${campaigns.length}`);

    let generated = 0;
    let skipped = 0;
    let reminders = 0;
    let blocked = 0;
    let retried = 0;
    // RC12: per-user capacity cache (computed once per scheduler run per user).
    const capacityCache = {};

    for (const campaign of campaigns) {
      try {
        const campaignOwnerId = campaign.user_id || campaign.created_by_id;
        if (!campaignOwnerId) {
          console.warn(`[SCHEDULER] Campaign ${campaign.id} has no owner — skipping`);
          skipped++;
          continue;
        }

        // ── RC16.2 §6: Scheduler kill-switch — lifecycle eligibility ──
        // The dueCampaigns filter already excludes non-active plans, but this
        // defensive check prevents any race where a plan was archived between
        // the filter and this iteration. A deleted/archived plan must NEVER
        // generate, regardless of next_scheduled.
        if (campaign.status !== 'active') {
          console.info(`[SCHEDULER] Campaign ${campaign.id} is ${campaign.status} (not active) — skipping (lifecycle kill-switch)`);
          skipped++;
          continue;
        }

        const users = await base44.asServiceRole.entities.User.filter({ id: campaignOwnerId });
        const user = users[0];
        const userTimezone = user?.timezone || 'UTC';
        const userPrefs = user || {};

        const localParts = getLocalTimeParts(userTimezone, now);

        // ── Backfill next_scheduled for legacy plans ──
        if (!campaign.next_scheduled) {
          const backfillNext = computeNextDueTime(campaign, userTimezone, now, false);
          await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: backfillNext });
          console.info(`[SCHEDULER] Backfilled next_scheduled for campaign ${campaign.id} (${campaign.schedule_type}, tz: ${userTimezone}, next: ${backfillNext})`);
          skipped++;
          continue;
        }

        if (!shouldGenerateNow(campaign, localParts, now)) {
          skipped++;
          continue;
        }

        // ── Shared subscription guard ──
        const guard = await checkSubscriptionAccess(base44.asServiceRole, campaignOwnerId);
        if (!guard.allowed) {
          console.info(`[SCHEDULER] User ${campaignOwnerId} is paused/expired — skipping campaign ${campaign.id}`);
          skipped++;
          continue;
        }

        // ── RC12: scheduler entitlement protection ──
        if (!capacityCache[campaignOwnerId]) {
          capacityCache[campaignOwnerId] = await getCapacityStatus(base44.asServiceRole, campaignOwnerId);
        }
        const capStatus = capacityCache[campaignOwnerId];
        if (capStatus.plan.isOverCapacity) {
          if (!capStatus._entitledPlanIds) {
            const activeByUser = await base44.asServiceRole.entities.Campaign.filter({ user_id: campaignOwnerId, status: 'active' });
            const activeByCreator = await base44.asServiceRole.entities.Campaign.filter({ created_by_id: campaignOwnerId, status: 'active' });
            const allActive = [...new Map([...activeByUser, ...activeByCreator].map(c => [c.id, c])).values()]
              .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
            capStatus._entitledPlanIds = new Set(allActive.slice(0, capStatus.plan.effective).map(c => c.id));
          }
          if (!capStatus._entitledPlanIds.has(campaign.id)) {
            console.info(`[SCHEDULER] Campaign ${campaign.id} beyond entitled Plan capacity (${capStatus.plan.used}/${capStatus.plan.effective}) — skipping generation`);
            skipped++;
            continue;
          }
        }

        // RC16.2 §55: Removed legacy monthly_message_limit enforcement.
        // Authoritative message capacity is EntitlementService + checkMessageCapacity.

        // ── RC15.1: Scoped failed-message retry (ownership: campaign + owner) ──
        // Only retry failed messages owned by this campaign's user, scoped to
        // this campaign. No global cross-user mutation; service-role RLS is not
        // trusted here. 24h age limit is preserved.
        try {
          const failedForCampaign = await base44.asServiceRole.entities.Message.filter({
            campaign_id: campaign.id,
            status: 'failed',
            user_id: campaignOwnerId,
          });
          for (const msg of failedForCampaign) {
            const failAge = now.getTime() - new Date(msg.updated_date || msg.created_date).getTime();
            if (failAge < 24 * 60 * 60 * 1000) {
              await base44.asServiceRole.entities.Message.update(msg.id, { status: 'approved' });
              retried++;
            }
          }
        } catch (retryErr) {
          console.warn(`[SCHEDULER] Scoped failed-retry error for campaign ${campaign.id}:`, retryErr.message);
        }

        const sentMessages = await base44.asServiceRole.entities.Message.filter(
          { campaign_id: campaign.id, status: 'sent' },
          '-created_date', 10
        );
        const recentSent = sentMessages.map(m => m.content);

        // ── Use intended delivery time as source of truth ──
        const deliveryTimeUtc = campaign.schedule_type === 'random_daily'
          ? (campaign.next_scheduled || now.toISOString())
          : now.toISOString();

        const occurrenceNorm = normalizeOccurrence(deliveryTimeUtc);
        const isPersonalised = campaign.message_mode === 'personalised';
        const campaignRecipients = campaign.recipients || [{ name: 'Friend' }];

        // ── RC15.1: Pending message resolution (authoritative PlanRecipient scoping) ──
        if (isPersonalised) {
          // ── PERSONALISED: load authoritative PlanRecipients ──
          const planRecipients = await base44.asServiceRole.entities.PlanRecipient.filter({
            owner_user_id: campaignOwnerId,
            campaign_id: campaign.id,
            status: 'active',
          });

          let recipientInstances;
          if (planRecipients.length > 0) {
            // Resolve Contact name/phone per PlanRecipient (User → Campaign →
            // PlanRecipient → Message). plan_recipient_id is authoritative and
            // is never derived from name/phone/array position.
            const contacts = await base44.asServiceRole.entities.Contact.filter({
              owner_user_id: campaignOwnerId,
            });
            const contactMap = new Map(contacts.map(c => [c.id, c]));
            recipientInstances = planRecipients.map(pr => {
              const contact = contactMap.get(pr.contact_id);
              return {
                plan_recipient_id: pr.id,
                name: contact?.display_name || contact?.first_name || 'Friend',
                phone: contact?.phone_number || '',
              };
            });
          } else {
            // Legacy fallback: no PlanRecipients synced for this plan yet.
            // Use campaign.recipients with name/phone identity (compatibility).
            recipientInstances = campaignRecipients.map(r => ({
              plan_recipient_id: null,
              name: r.name || 'Friend',
              phone: r.phone || '',
            }));
          }

          const recipientChecks = await checkUnresolvedPerPlanRecipient(
            base44, campaign.id, recipientInstances
          );

          const eligibleRecipients = recipientInstances.filter(r => {
            const rKey = r.plan_recipient_id || deriveRecipientId(r);
            return !recipientChecks[rKey]?.hasUnresolved;
          });

          if (eligibleRecipients.length === 0) {
            // All recipients blocked — send reminders and advance
            console.info(`[SCHEDULER] All recipients have unresolved messages for campaign ${campaign.id} — reminders only`);

            // Create one reminder per blocked recipient (deterministic, no LLM)
            for (const r of recipientInstances) {
              const rKey = r.plan_recipient_id || deriveRecipientId(r);
              const check = recipientChecks[rKey];
              if (check?.hasUnresolved && check.unresolvedMessageIds[0]) {
                await createReminder(base44, {
                  campaignId: campaign.id,
                  campaignName: campaign.name,
                  recipientName: r.name,
                  messageId: check.unresolvedMessageIds[0],
                  userId: campaignOwnerId,
                });
                reminders++;
              }
            }

            // Advance next_scheduled — do NOT backfill missed occurrences
            const nextScheduled = computeNextDueTime(campaign, userTimezone, now, true);
            await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: nextScheduled });

            try {
              await base44.analytics.track({
                eventName: 'pending_message_blocked_generation',
                properties: { campaign_id: campaign.id, mode: 'personalised', all_blocked: true },
              });
            } catch { /* non-blocking */ }

            blocked++;
            continue;
          }

          // ── RC16.1 §10/§11: Multi-recipient atomic capacity check (BEFORE LLM) ──
          // requiredUnits = eligible recipients with NO existing reusable version
          // for this occurrence. Reusable recipients consume 0 units (§15 reuse).
          // If required > remaining, block the ENTIRE occurrence — no partial
          // generation (§10). Pending recipients were already excluded above (§11).
          const campaignMsgs = await base44.asServiceRole.entities.Message.filter({ campaign_id: campaign.id });
          const reusableKeys = new Set(campaignMsgs
            .filter((m: any) => ['pending', 'approved'].includes(m.status) && !m.expired_at)
            .map((m: any) => m.generation_key));
          const requiredUnits = eligibleRecipients.filter((r: any) => {
            const rId = r.plan_recipient_id || deriveRecipientId(r);
            const key = buildGenerationKey({ user_id: campaignOwnerId, campaign_id: campaign.id, recipient_id: rId, occurrence: occurrenceNorm });
            return !reusableKeys.has(key);
          }).length;

          const msgCap = await checkMessageCapacity(base44.asServiceRole, campaignOwnerId, requiredUnits);
          if (!msgCap.allowed) {
            console.info(`[SCHEDULER] MESSAGE CAPACITY BLOCKED — campaign ${campaign.id}: required ${requiredUnits}, remaining ${msgCap.remaining}/${msgCap.effective} (trial=${msgCap.isTrial})`);
            await createCapacityExhaustedNotification(base44, campaign.id, campaignOwnerId, now);
            const nextScheduled = computeNextDueTime(campaign, userTimezone, now, true);
            await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: nextScheduled });
            try {
              await base44.analytics.track({ eventName: 'message_capacity_blocked', properties: { campaign_id: campaign.id, required: requiredUnits, remaining: msgCap.remaining, effective: msgCap.effective, mode: 'personalised' } });
            } catch { /* non-blocking */ }
            blocked++;
            continue;
          }

          // Generate individually for each eligible recipient (no cloning)
          let generatedForCampaign = 0;
          for (const recipient of eligibleRecipients) {
            try {
              const aiResult = await base44.asServiceRole.functions.invoke('generateMessage', {
                campaign,
                recipient: { name: recipient.name, phone: recipient.phone || '' },
                plan_recipient_id: recipient.plan_recipient_id || undefined,
                occurrence: deliveryTimeUtc,
                generation_type: 'original',
                recent_messages: recentSent,
                signature: userPrefs.signature || '',
                user_id: campaignOwnerId,
                delivery_time_utc: deliveryTimeUtc,
                user_timezone: userTimezone,
              });
              const data = aiResult?.data || aiResult;

              if (data.reused || data.blocked || data.preparing) {
                console.info(`[SCHEDULER] REUSE/BLOCKED/PREPARING for recipient ${recipient.name} in campaign ${campaign.id}`);
                continue;
              }

              const generatedMessage = data.message;
              if (!generatedMessage?.content) {
                throw new Error('Message generation returned empty content');
              }
              generatedForCampaign++;
            } catch (llmError) {
              console.error(`[SCHEDULER] Personalised generation failed for campaign ${campaign.id}, recipient ${recipient.name}:`, llmError.message);
              await createFailNotification(base44, campaign, campaignOwnerId, now);
              break; // Stop generating for this campaign on failure
            }
          }

          // Reminder for blocked recipients
          for (const r of recipientInstances) {
            const rKey = r.plan_recipient_id || deriveRecipientId(r);
            if (recipientChecks[rKey]?.hasUnresolved) {
              await createReminder(base44, {
                campaignId: campaign.id,
                campaignName: campaign.name,
                recipientName: r.name,
                messageId: recipientChecks[rKey].unresolvedMessageIds[0],
                userId: campaignOwnerId,
              });
              reminders++;
            }
          }

          generated += generatedForCampaign;

          // Advance next_scheduled
          const nextScheduled = computeNextDueTime(campaign, userTimezone, now, true);
          await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: nextScheduled });

          if (generatedForCampaign > 0) {
            try {
              await base44.analytics.track({
                eventName: 'generation_resumed',
                properties: { campaign_id: campaign.id, count: generatedForCampaign },
              });
            } catch { /* non-blocking */ }
          }

          console.info(`[SCHEDULER] Personalised campaign "${campaign.name}": generated ${generatedForCampaign}, reminders ${recipientInstances.length - eligibleRecipients.length}`);
          continue;
        }

        // ── SHARED mode: campaign-level blocking ──
        const unresolvedCheck = await checkUnresolvedForCampaign(base44, campaign.id);

        if (unresolvedCheck.hasUnresolved) {
          console.info(`[SCHEDULER] Campaign ${campaign.id} has ${unresolvedCheck.unresolvedCount} unresolved message(s) — reminder only, no generation`);

          // Create reminder for the first unresolved message
          const recipient = campaignRecipients[0] || { name: 'Friend' };
          await createReminder(base44, {
            campaignId: campaign.id,
            campaignName: campaign.name,
            recipientName: recipient.name,
            messageId: unresolvedCheck.unresolvedMessageIds[0],
            userId: campaignOwnerId,
          });
          reminders++;

          // Advance next_scheduled — do NOT backfill missed occurrences
          const nextScheduled = computeNextDueTime(campaign, userTimezone, now, true);
          await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: nextScheduled });

          try {
            await base44.analytics.track({
              eventName: 'pending_message_blocked_generation',
              properties: { campaign_id: campaign.id, mode: 'shared' },
            });
          } catch { /* non-blocking */ }

          blocked++;
          continue;
        }

        // ── No unresolved messages — proceed with generation ──
        const recipient = campaignRecipients[0] || { name: 'Friend' };

        // ── RC16.1 §10: Shared-mode atomic capacity check (BEFORE LLM) ──
        // Shared mode prepares one communication per recipient (distinct keys),
        // so requiredUnits = recipients with no reusable version for this occurrence.
        const sharedCampaignMsgs = await base44.asServiceRole.entities.Message.filter({ campaign_id: campaign.id });
        const sharedReusableKeys = new Set(sharedCampaignMsgs
          .filter((m: any) => ['pending', 'approved'].includes(m.status) && !m.expired_at)
          .map((m: any) => m.generation_key));
        const sharedRequired = campaignRecipients.filter((r: any) => {
          const rId = deriveRecipientId(r);
          const key = buildGenerationKey({ user_id: campaignOwnerId, campaign_id: campaign.id, recipient_id: rId, occurrence: occurrenceNorm });
          return !sharedReusableKeys.has(key);
        }).length;
        const sharedMsgCap = await checkMessageCapacity(base44.asServiceRole, campaignOwnerId, sharedRequired);
        if (!sharedMsgCap.allowed) {
          console.info(`[SCHEDULER] MESSAGE CAPACITY BLOCKED (shared) — campaign ${campaign.id}: required ${sharedRequired}, remaining ${sharedMsgCap.remaining}/${sharedMsgCap.effective}`);
          await createCapacityExhaustedNotification(base44, campaign.id, campaignOwnerId, now);
          const nextScheduled = computeNextDueTime(campaign, userTimezone, now, true);
          await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: nextScheduled });
          try {
            await base44.analytics.track({ eventName: 'message_capacity_blocked', properties: { campaign_id: campaign.id, required: sharedRequired, remaining: sharedMsgCap.remaining, effective: sharedMsgCap.effective, mode: 'shared' } });
          } catch { /* non-blocking */ }
          blocked++;
          continue;
        }

        // ── RC16.2 §51: Shared-mode capacity lock ──
        // Hold the per-user capacity lock through generation + copy creation
        // so a concurrent manual generation cannot spend the same remaining
        // units before the shared copy set is established.
        const sharedCapLock = await acquireCapacityLock(base44.asServiceRole, campaignOwnerId, `scheduler-shared-${campaign.id}`, 120000);
        if (!sharedCapLock.acquired) {
          console.info(`[SCHEDULER] Shared capacity lock busy for campaign ${campaign.id} — skipping`);
          const retryLock = computeNextDueTime(campaign, userTimezone, now, true);
          await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: retryLock });
          skipped++;
          continue;
        }

        let generatedMessage = null;
        let resultMeta = null;
        try {
          const aiResult = await base44.asServiceRole.functions.invoke('generateMessage', {
            campaign,
            recipient,
            occurrence: deliveryTimeUtc,
            generation_type: 'original',
            recent_messages: recentSent,
            signature: userPrefs.signature || '',
            user_id: campaignOwnerId,
            delivery_time_utc: deliveryTimeUtc,
            user_timezone: userTimezone,
            skip_capacity_check: true,
          });
          const data = aiResult?.data || aiResult;

          if (data.reused) {
            console.info(`[SCHEDULER] REUSE — message ${data.message?.id} already exists for campaign ${campaign.id}`);
            await releaseCapacityLock(base44.asServiceRole, sharedCapLock.lockId);
            const nextScheduled = computeNextDueTime(campaign, userTimezone, now, true);
            await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: nextScheduled });
            skipped++;
            continue;
          }

          if (data.blocked) {
            console.info(`[SCHEDULER] BLOCKED — ${data.reason} for campaign ${campaign.id}`);
            await releaseCapacityLock(base44.asServiceRole, sharedCapLock.lockId);
            skipped++;
            continue;
          }

          if (data.preparing) {
            console.info(`[SCHEDULER] PREPARING — lock held for campaign ${campaign.id}`);
            await releaseCapacityLock(base44.asServiceRole, sharedCapLock.lockId);
            skipped++;
            continue;
          }

          generatedMessage = data.message;
          resultMeta = data;
          if (!generatedMessage || !generatedMessage.content) {
            throw new Error('Message generation returned empty content');
          }
        } catch (llmError) {
          const isPermanent = llmError.message?.includes('403') || llmError.message?.includes('quota') ||
                              llmError.message?.includes('review the communication plan');
          console.error(`[SCHEDULER] Generation failed for campaign ${campaign.id}:`, llmError.message);

          await releaseCapacityLock(base44.asServiceRole, sharedCapLock.lockId);

          const retryNext = isPermanent
            ? computeNextDueTime(campaign, userTimezone, now, true)
            : new Date(now.getTime() + 60 * 60 * 1000).toISOString();

          await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: retryNext });

          await createFailNotification(base44, campaign, campaignOwnerId, now);

          skipped++;
          continue;
        }

        // ── Shared mode: one generation, distribute to additional recipients ──
        // generateMessage created the message for recipient[0]. For shared mode
        // with multiple recipients, create copies for the remaining recipients
        // (same content — intentionally shared).
        const additionalRecipients = campaignRecipients.slice(1);
        for (const r of additionalRecipients) {
          const rId = deriveRecipientId(r);
          const genKey = buildGenerationKey({
            user_id: campaignOwnerId,
            campaign_id: campaign.id,
            recipient_id: rId,
            occurrence: occurrenceNorm,
          });
          await base44.asServiceRole.entities.Message.create({
            campaign_id: campaign.id,
            content: generatedMessage.content,
            recipient_name: r.name,
            recipient_phone: r.phone || '',
            status: generatedMessage.status,
            scheduled_for: deliveryTimeUtc,
            generation_key: genKey,
            version_number: 1,
            version_type: 'original',
            generation_type: 'original',
            occurrence: occurrenceNorm,
            user_id: campaignOwnerId,
            created_by_id: campaignOwnerId,
            communication_mode: 'shared',
          });
        }

        // RC16.2 §51: Release the shared capacity lock — copy set is established
        await releaseCapacityLock(base44.asServiceRole, sharedCapLock.lockId);

        const nextScheduled = computeNextDueTime(campaign, userTimezone, now, true);
        await base44.asServiceRole.entities.Campaign.update(campaign.id, { next_scheduled: nextScheduled });

        generated++;
        console.info(`[SCHEDULER] Generated message for campaign "${campaign.name}" (id: ${campaign.id}, user: ${campaignOwnerId}, schedule_type: ${campaign.schedule_type}, tz: ${userTimezone}, delivery_utc: ${deliveryTimeUtc}, approval: ${campaign.approval_mode}, msg_status: ${generatedMessage.status}, fallback: ${resultMeta?.used_fallback || false})`);
      } catch (campaignError) {
        console.error(`[SCHEDULER] Error processing campaign ${campaign.id}:`, campaignError.message);
      }
    }

    console.info(`[SCHEDULER] Done — generated: ${generated}, skipped: ${skipped}, reminders: ${reminders}, blocked: ${blocked}, retried: ${retried}`);

    return Response.json({
      success: true,
      timestamp: now.toISOString(),
      campaignsProcessed: campaigns.length,
      messagesGenerated: generated,
      campaignsSkipped: skipped,
      remindersSent: reminders,
      blockedByPending: blocked,
      messagesRetried: retried,
    });
  } catch (error) {
    console.error('[SCHEDULER] Fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Helper: create a deterministic reminder notification ──
async function createReminder(base44: any, params: {
  campaignId: string;
  campaignName: string;
  recipientName: string;
  messageId: string;
  userId: string;
}) {
  const { title, body } = buildReminderNotification(params.recipientName, params.campaignName);
  try {
    await base44.asServiceRole.entities.Notification.create({
      title,
      body,
      type: 'awaiting_approval',
      priority: 'medium',
      action_label: 'Review',
      action_url: `/messages/${params.messageId}`,
      campaign_id: params.campaignId,
      message_id: params.messageId,
      user_id: params.userId,
      created_by_id: params.userId,
    });

    try {
      await base44.analytics.track({
        eventName: 'pending_message_reminder_sent',
        properties: { campaign_id: params.campaignId },
      });
    } catch { /* non-blocking */ }
  } catch (err) {
    console.warn(`[SCHEDULER] Reminder creation failed for campaign ${params.campaignId}:`, err.message);
  }
}

// ── RC16.1 §16/§29: Capacity-exhausted notification (deduped, one per campaign per 24h) ──
async function createCapacityExhaustedNotification(base44: any, campaignId: string, userId: string, now: Date) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const existing = await base44.asServiceRole.entities.Notification.filter({
    campaign_id: campaignId,
    type: 'quota_warning',
    created_date: { $gte: cutoff },
  }).catch(() => []);
  if (existing.length > 0) return; // dedup — at most one per campaign per 24h
  try {
    await base44.asServiceRole.entities.Notification.create({
      title: 'Scheduled messages paused',
      body: `Your scheduled messages weren't prepared because you've used your available messages. Add more messages to continue.`,
      type: 'quota_warning',
      priority: 'high',
      action_label: 'Add Messages',
      action_url: '/subscription?addon=messages',
      campaign_id: campaignId,
      user_id: userId,
      created_by_id: userId,
    });
  } catch (err) {
    console.warn(`[SCHEDULER] Capacity notification failed for campaign ${campaignId}:`, err.message);
  }
}

// ── Helper: create a failure notification (rate-limited) ──
async function createFailNotification(base44: any, campaign: any, campaignOwnerId: string, now: Date) {
  const recentNotifCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const recentFailNotifs = await base44.asServiceRole.entities.Notification.filter({
    campaign_id: campaign.id,
    type: 'ai_generation_failed',
    created_date: { $gte: recentNotifCutoff },
  });

  if (recentFailNotifs.length === 0) {
    await base44.asServiceRole.entities.Notification.create({
      title: 'Message Preparation Delayed',
      body: `BoriSend could not prepare the message for "${campaign.name}" yet. We will try again shortly.`,
      type: 'ai_generation_failed',
      priority: 'high',
      action_label: 'View',
      action_url: `/campaigns/${campaign.id}`,
      campaign_id: campaign.id,
      user_id: campaignOwnerId,
      created_by_id: campaignOwnerId,
    });
  }
}

function getLocalTimeParts(timezone: string, now: Date) {
  try {
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      weekday: 'short',
      day: 'numeric',
      hour12: false,
    });
    const parts = timeFormatter.formatToParts(now);
    const hourVal = parts.find(p => p.type === 'hour')?.value || '0';
    const weekday = parts.find(p => p.type === 'weekday')?.value || 'Sun';
    const dayOfMonth = parseInt(parts.find(p => p.type === 'day')?.value || '1', 10);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let hour = parseInt(hourVal, 10);
    if (hour === 24) hour = 0;

    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateStr = dateFormatter.format(now);

    return { hour, day: dayMap[weekday], date: dayOfMonth, dateStr };
  } catch {
    return {
      hour: now.getUTCHours(),
      day: now.getUTCDay(),
      date: now.getUTCDate(),
      dateStr: now.toISOString().split('T')[0],
    };
  }
}

function shouldGenerateNow(campaign: any, localParts: any, now: Date): boolean {
  const scheduleTime = campaign.schedule_time;
  const scheduleHour = scheduleTime ? parseInt(scheduleTime.split(':')[0], 10) : 9;
  const { hour: currentHour, day: currentDay, date: currentDate, dateStr } = localParts;

  switch (campaign.schedule_type) {
    case 'specific_daily':
      return currentHour === scheduleHour;
    case 'random_daily': {
      if (!campaign.next_scheduled) return false;
      return new Date(campaign.next_scheduled) <= now;
    }
    case 'twice_daily':
      return currentHour === scheduleHour || currentHour === (scheduleHour + 12) % 24;
    case 'weekly':
      return currentDay === 1 && currentHour === scheduleHour;
    case 'every_friday':
      return currentDay === 5 && currentHour === scheduleHour;
    case 'monthly':
      return currentDate === 1 && currentHour === scheduleHour;
    case 'selected_weekdays': {
      const days = campaign.schedule_days || [];
      return days.includes(currentDay) && currentHour === scheduleHour;
    }
    case 'specific_dates': {
      const dates = campaign.schedule_dates || [];
      return dates.includes(dateStr) && currentHour === scheduleHour;
    }
    case 'custom':
    default:
      return false;
  }
}