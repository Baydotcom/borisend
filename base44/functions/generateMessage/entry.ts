import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { checkSubscriptionAccess } from '../../shared/subscriptionGuard.ts';
import { generateMessage as generateViaEngine } from '../../shared/message-engine/generation-service.ts';
import {
  buildGenerationKey, deriveRecipientId, normalizeOccurrence,
} from '../../shared/message-engine/generation-key.ts';
import { findReusableVersion, getActiveVersions } from '../../shared/message-engine/reuse-service.ts';
import { getNextVersionType } from '../../shared/message-engine/versioning-service.ts';
import { isLockActive, shouldWaitForLock, calculateLockExpiry } from '../../shared/message-engine/lock-service.ts';
import { checkEligibility } from '../../shared/message-engine/eligibility-service.ts';
import { checkMessageCapacity, acquireCapacityLock, releaseCapacityLock } from '../../shared/entitlements/entitlement-service.ts';
import { DEFAULT_LIMITS, mergeLimits } from '../../shared/message-engine/generation-config.ts';
import { resolvePreferences, updateProfileFromFeedback } from '../../shared/message-engine/preference-service.ts';
import { evaluateFeedback } from '../../shared/message-engine/feedback-service.ts';
import { createLedgerEntry, isUserRequested } from '../../shared/message-engine/usage-ledger-service.ts';
import { buildImprovementInstruction } from '../../shared/message-engine/improvement-service.ts';
import { loadIntelligenceContext } from '../../shared/relationship-intelligence/context-loader.ts';
import { resolveMessageLanguage } from '../../shared/message-engine/language-resolver.ts';

Deno.serve(async (req) => {
  const startedAt = new Date();
  const requestId = `req-${startedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const base44 = createClientFromRequest(req);

    // Authenticate
    let actor = 'system';
    let authedUserId = null;
    try {
      const user = await base44.auth.me();
      if (user) { actor = user.id; authedUserId = user.id; }
    } catch { /* system call */ }

    const body = await req.json().catch(() => ({}));
    const { campaign, recent_messages, language } = body;

    if (!campaign?.id) {
      return Response.json({ error: 'campaign is required' }, { status: 400 });
    }

    const effectiveUserId = body.user_id || authedUserId || campaign.user_id || campaign.created_by_id;
    if (!effectiveUserId) {
      return Response.json({ error: 'User identification required' }, { status: 400 });
    }

    // User message defaults are real generation inputs, not display-only settings.
    // New plans inherit tone/length/nickname in the UI; signature is applied
    // deterministically here so scheduled and manual generation behave the same.
    let userMessageDefaults: any = {};
    try {
      const users = await base44.asServiceRole.entities.User.filter({ id: effectiveUserId });
      userMessageDefaults = users[0] || {};
    } catch { /* continue with plan values */ }
    const campaignForGeneration = {
      ...campaign,
      tone: campaign.tone || userMessageDefaults.default_tone || 'warm',
      message_length: campaign.message_length || userMessageDefaults.default_length || 'medium',
      pet_name: campaign.pet_name || userMessageDefaults.default_nickname || '',
    };
    const userSignature = String(body.signature || userMessageDefaults.signature || '').trim();

    // ── Resolve recipient ──
    const recipient = body.recipient || campaign.recipients?.[0] || { name: 'Friend' };
    // RC15.1: PlanRecipient.id is the authoritative recipient identity for
    // personalised messages. Fall back to name/phone-derived id for legacy /
    // shared-mode generation where no PlanRecipient is supplied.
    const planRecipientId = body.plan_recipient_id || null;
    const recipientId = planRecipientId || deriveRecipientId(recipient);

    // ── Resolve occurrence (the intended delivery time) ──
    const occurrence = normalizeOccurrence(body.occurrence || body.delivery_time_utc || new Date().toISOString());

    // ── Build GenerationKey ──
    const generationKey = buildGenerationKey({
      user_id: effectiveUserId,
      campaign_id: campaign.id,
      recipient_id: recipientId,
      occurrence,
    });

    // ── RC16.8: Resolve message language (authoritative hierarchy) ──
    // Priority: PlanRecipient override → Campaign message_language →
    // User default (BoriSendProfile) → English fallback.
    // This replaces the broken body.language passthrough (§6).
    const resolvedLang = await resolveMessageLanguage(base44.asServiceRole, {
      campaign,
      planRecipientId,
      userId: effectiveUserId,
    });

    // ── Load admin config from AppSettings ──
    let limits = DEFAULT_LIMITS;
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({});
      const settingsMap: Record<string, string> = {};
      for (const s of settings) {
        if (s.setting_key?.startsWith('generation_')) {
          settingsMap[s.setting_key] = s.setting_value;
        }
      }
      limits = mergeLimits(DEFAULT_LIMITS, settingsMap);
    } catch { /* use defaults */ }

    // ── 1. Check for existing reusable message (REUSE) ──
    const existingMessages = await base44.asServiceRole.entities.Message.filter({
      generation_key: generationKey,
    });

    const generationType = body.generation_type || 'original';

    // For original generation: if a reusable version exists, return it immediately
    if (generationType === 'original') {
      const reusable = findReusableVersion(existingMessages, generationKey);
      if (reusable) {
        console.info(`[generateMessage] REUSE — returning existing message ${reusable.id} for key ${generationKey}`);
        return Response.json({
          reused: true,
          message: reusable,
          versions: getActiveVersions(existingMessages, generationKey),
        });
      }
    }

    // ── 2. Check version limits ──
    const versionCheck = getNextVersionType(existingMessages, generationKey, limits);
    const effectiveVersionType = generationType === 'improvement' ? 'improvement' : versionCheck.version_type;

    if (!versionCheck.allowed && generationType !== 'improvement') {
      return Response.json({
        blocked: true,
        reason: versionCheck.reason,
        versions: getActiveVersions(existingMessages, generationKey),
      });
    }

    // For improvement, check separately
    if (generationType === 'improvement') {
      const hasAlt = existingMessages.some(
        (m: any) => m.generation_key === generationKey && !m.expired_at &&
        (m.version_type === 'alternative' || m.version_type === 'improvement')
      );
      if (hasAlt) {
        return Response.json({
          blocked: true,
          reason: 'You already have two prepared versions for this scheduled message. You can edit either version or choose one to send.',
          versions: getActiveVersions(existingMessages, generationKey),
        });
      }
    }

    // ── 3. Check for active lock from a different request ──
    const activeLocks = await base44.asServiceRole.entities.GenerationLock.filter({
      generation_key: generationKey,
      status: 'active',
    });
    const activeLock = activeLocks.find((l: any) => isLockActive(l));
    if (activeLock && shouldWaitForLock(activeLock, requestId)) {
      console.info(`[generateMessage] LOCK ACTIVE — request ${requestId} waiting for lock ${activeLock.id}`);
      return Response.json({
        preparing: true,
        message: null,
        reason: 'BoriSend is already preparing this message. Please wait a moment.',
      });
    }

    // ── 4. Acquire lock ──
    const lock = await base44.asServiceRole.entities.GenerationLock.create({
      generation_key: generationKey,
      status: 'active',
      locked_at: startedAt.toISOString(),
      locked_until: calculateLockExpiry(limits.lock_timeout_ms, startedAt),
      request_id: requestId,
      owner_user_id: effectiveUserId,
    });

    try {
      // ── 5. Subscription guard (RC16.2 §56: preserve membership/trial checks) ──
      const guard = await checkSubscriptionAccess(base44.asServiceRole, effectiveUserId);
      if (!guard.allowed) {
        return Response.json({ error: guard.error, paused: guard.isPaused }, { status: 403 });
      }
      // RC16.2 §55: Removed legacy monthly_message_limit enforcement.
      // The authoritative message-capacity source is EntitlementService +
      // checkMessageCapacity (RC16.1). The subscription guard (allowed/paused)
      // is preserved (§56).

      // ── RC16.1 §9 / RC16.2 §51: Message-Unit capacity enforcement BEFORE LLM ──
      // Only an ORIGINAL generation consumes a new commercial Message Unit.
      // Alternatives/improvements/technical_retries share the generation_key and
      // do NOT consume a new unit (§7/§17) — they skip this check. The per-user
      // capacity lock (§24 concurrency) serialises two simultaneous reservations
      // against the last remaining unit (Test M).
      // RC16.2 §51: skip_capacity_check is passed by the scheduler when it has
      // already acquired the per-user capacity lock and pre-checked capacity
      // atomically for the entire occurrence (shared-mode concurrency protection).
      let capacityLockId: string | undefined;
      if (generationType === 'original' && !body.skip_capacity_check) {
        const capLock = await acquireCapacityLock(base44.asServiceRole, effectiveUserId, requestId, 60000);
        if (!capLock.acquired) {
          try { await base44.asServiceRole.entities.GenerationLock.update(lock.id, { status: 'released' }); } catch { /* ignore */ }
          return Response.json({ preparing: true, message: null, reason: capLock.reason || 'A message is being prepared. Please wait a moment.' });
        }
        capacityLockId = capLock.lockId;
        const cap = await checkMessageCapacity(base44.asServiceRole, effectiveUserId, 1);
        if (!cap.allowed) {
          try { await base44.asServiceRole.entities.GenerationLock.update(lock.id, { status: 'released' }); } catch { /* ignore */ }
          await releaseCapacityLock(base44.asServiceRole, capacityLockId);
          console.info(`[generateMessage] MESSAGE CAPACITY BLOCKED — user ${effectiveUserId} used ${cap.used}/${cap.effective} (trial=${cap.isTrial})`);
          return Response.json({
            blocked: true,
            capacity_exhausted: true,
            reason: cap.reason,
            used: cap.used,
            effective: cap.effective,
            remaining: cap.remaining,
            is_trial: cap.isTrial,
          });
        }
      }

      // ── 6. Resolve timezone ──
      let userTimezone = body.user_timezone || '';
      if (!userTimezone) {
        try {
          const users = await base44.asServiceRole.entities.User.filter({ id: effectiveUserId });
          userTimezone = users[0]?.timezone || 'UTC';
        } catch { userTimezone = 'UTC'; }
      }
      if (!userTimezone) userTimezone = 'UTC';

      // ── 7. Resolve plan-scoped preferences ──
      let resolvedPrefs = null;
      let planProfile = null;
      let recipientProfile = null;
      try {
        const planPrefsRecords = await base44.asServiceRole.entities.PlanPreferenceProfile.filter({
          user_id: effectiveUserId, campaign_id: campaign.id, recipient_id: null,
        });
        planProfile = planPrefsRecords[0] || null;

        const recipientPrefsRecords = await base44.asServiceRole.entities.PlanPreferenceProfile.filter({
          user_id: effectiveUserId, campaign_id: campaign.id, recipient_id: recipientId,
        });
        recipientProfile = recipientPrefsRecords[0] || null;

        resolvedPrefs = resolvePreferences({
          currentFeedback: body.feedback || null,
          recipientProfile,
          planProfile,
          campaignSettings: {
            tone: campaign.tone,
            message_length: campaign.message_length,
            writing_style: campaign.writing_style,
            category: campaign.category,
          },
          limits,
        });
      } catch (prefErr) {
        console.warn('[generateMessage] Preference resolution failed, using defaults:', prefErr.message);
      }

      // ── 8. Build recent sent messages for repetition avoidance ──
      const recentSent = recent_messages || [];
      if (recentSent.length === 0) {
        try {
          const sentMessages = await base44.asServiceRole.entities.Message.filter(
            { campaign_id: campaign.id, status: 'sent' },
            '-created_date', 10
          );
          recentSent.push(...sentMessages.map((m: any) => m.edited_content || m.content));
        } catch { /* ignore */ }
      }

      // ── 8a. RC13: Resolve Relationship Intelligence (deterministic, pre-generation) ──
      // Runs ABOVE the RC7 generation controls. For legacy plans (no relationship
      // taxonomy) intelligenceSpec stays null and the existing pathway is used (§34).
      let intelligenceSpec: any = null;
      if (campaign.relationship_type_id || campaign.relationship_category_id) {
        try {
          const recentSentWithMeta = await base44.asServiceRole.entities.Message.filter(
            { campaign_id: campaign.id, status: 'sent' },
            '-created_date', 10
          );
          const recentIntents = recentSentWithMeta.map((m: any) => m.intent).filter(Boolean) as string[];

          const intelligenceResult: any = await loadIntelligenceContext(base44.asServiceRole, {
            campaign,
            recipient,
            userId: effectiveUserId,
            deliveryTimeUtc: occurrence,
            userTimezone,
            language: resolvedLang.code,
          language_display_name: resolvedLang.display_name,
            recentIntents,
          });

          if (intelligenceResult?.blocked) {
            // Safety engine blocked generation — release lock and return
            try { await base44.asServiceRole.entities.GenerationLock.update(lock.id, { status: 'released' }); } catch { /* ignore */ }
            console.info(`[generateMessage] SAFETY BLOCK — ${intelligenceResult.safety?.status} for campaign ${campaign.id}`);
            return Response.json({
              error: intelligenceResult.block_reason || 'BoriSend cannot prepare a message for this recipient due to relationship safety boundaries.',
              safety_blocked: true,
              safety_status: intelligenceResult.safety?.status,
            }, { status: 403 });
          }

          intelligenceSpec = intelligenceResult?.specification || null;
        } catch (intelErr) {
          console.warn('[generateMessage] Intelligence resolution failed, using legacy pathway:', intelErr.message);
        }
      }

      // ── 9. Build improvement instruction if requested ──
      let improvementContext = '';
      if (generationType === 'improvement' && body.improvement_action) {
        const originalMessage = existingMessages.find((m: any) =>
          m.generation_key === generationKey && !m.expired_at && m.version_type === 'original'
        );
        if (originalMessage) {
          improvementContext = buildImprovementInstruction(
            body.improvement_action,
            originalMessage.edited_content || originalMessage.content
          );
        }
      }

      // ── 10. Generate via engine ──
      const result = await generateViaEngine(base44, {
        campaign: campaignForGeneration,
        recipientName: recipient.name || 'Friend',
        language: resolvedLang.code,
        language_display_name: resolvedLang.display_name,
        deliveryTimeUtc: occurrence,
        userTimezone,
        recentMessages: recentSent,
        preferences: resolvedPrefs || undefined,
        specification: intelligenceSpec,
      });

      if (!result.content) {
        // LLM failed — no message created, no consumption. Release capacity lock.
        if (capacityLockId) await releaseCapacityLock(base44.asServiceRole, capacityLockId);
        // Record failed ledger entry
        await recordLedgerSafe(base44, {
          request_id: requestId,
          generation_key: generationKey,
          user_id: effectiveUserId,
          campaign_id: campaign.id,
          recipient_id: recipientId,
          scheduled_occurrence: occurrence,
          message_id: null,
          version_number: versionCheck.version_number,
          generation_type: generationType,
          provider_internal_name: result.provider || 'unknown',
          started_at: startedAt.toISOString(),
          status: 'failed',
          failure_category: result.failure_category || 'unknown_failure',
          validation_result: result.validation_issues?.map((i: any) => i.code).join(',') || '',
          feedback_reason: body.feedback?.reasons?.join(',') || '',
        });

        const isPermanent = result.failure_category === 'invalid_provider_config' ||
                            result.failure_category === 'invalid_generation_context';

        return Response.json({
          error: isPermanent
            ? 'BoriSend could not prepare the message. Please review the communication plan or try again.'
            : 'BoriSend could not prepare the message yet. We will try again shortly.',
          details: result.error,
          failure_category: result.failure_category,
          permanent: isPermanent,
        }, { status: 500 });
      }

      // Apply the user's exact saved signature after generation. This avoids
      // asking the language model to invent or alter a sign-off.
      const finalContent = userSignature && !result.content.trimEnd().endsWith(userSignature)
        ? `${result.content.trimEnd()}\n\n${userSignature}`
        : result.content;

      // ── 11. Create message with version metadata ──
      const messageStatus = result.needs_review
        ? 'pending'
        : (campaign.approval_mode === 'manual' ? 'pending' : 'approved');

      const versionNumber = generationType === 'improvement' ? 2 : versionCheck.version_number;

      const message = await base44.asServiceRole.entities.Message.create({
        campaign_id: campaign.id,
        user_id: effectiveUserId,
        content: finalContent,
        recipient_name: recipient.name,
        recipient_phone: recipient.phone || '',
        status: messageStatus,
        scheduled_for: occurrence,
        generation_key: generationKey,
        version_number: versionNumber,
        version_type: effectiveVersionType || 'original',
        generation_type: generationType,
        occurrence,
        created_by_id: effectiveUserId,
        plan_recipient_id: planRecipientId || undefined,
        intent: intelligenceSpec?.message_intent || null,
        strategy_key: intelligenceSpec?.strategy_key || null,
        communication_mode: intelligenceSpec?.communication_mode || campaign.message_mode || null,
      });

      // RC16.1: Message row created (the consumption point). Release the capacity
      // lock now — the unit is consumed idempotently via generation_key.
      if (capacityLockId) await releaseCapacityLock(base44.asServiceRole, capacityLockId);

      // ── 12. Record usage ledger ──
      await recordLedgerSafe(base44, {
        request_id: requestId,
        generation_key: generationKey,
        user_id: effectiveUserId,
        campaign_id: campaign.id,
        recipient_id: recipientId,
        scheduled_occurrence: occurrence,
        message_id: message.id,
        version_number: versionNumber,
        generation_type: generationType,
        provider_internal_name: result.provider,
        started_at: startedAt.toISOString(),
        status: 'success',
        failure_category: '',
        validation_result: result.validation_issues?.map((i: any) => i.code).join(',') || 'valid',
        feedback_reason: body.feedback?.reasons?.join(',') || body.improvement_action || '',
      });

      // ── 13. Update preferences from feedback ──
      if (body.feedback) {
        try {
          const feedbackEval = evaluateFeedback({
            id: '',
            user_id: effectiveUserId,
            campaign_id: campaign.id,
            message_id: message.id,
            generation_key: generationKey,
            rating: body.feedback.rating,
            reasons: body.feedback.reasons || [],
            custom_reason: body.feedback.custom_reason || '',
            improvement_action: body.improvement_action || '',
            recipient_id: recipientId,
            version_number: versionNumber,
            created_date: new Date().toISOString(),
          });

          if (feedbackEval.shouldLearn) {
            const updatedProfile = updateProfileFromFeedback(
              planProfile as any,
              {
                id: '',
                user_id: effectiveUserId,
                campaign_id: campaign.id,
                message_id: message.id,
                generation_key: generationKey,
                rating: body.feedback.rating,
                reasons: body.feedback.reasons || [],
                custom_reason: body.feedback.custom_reason || '',
                improvement_action: body.improvement_action || '',
                recipient_id: recipientId,
                version_number: versionNumber,
                created_date: new Date().toISOString(),
              } as any,
              limits
            );

            if (planProfile?.id) {
              await base44.asServiceRole.entities.PlanPreferenceProfile.update(planProfile.id, {
                avoid_styles: updatedProfile.avoid_styles,
                feedback_count: updatedProfile.feedback_count,
                confidence_score: updatedProfile.confidence_score,
                last_feedback_at: updatedProfile.last_feedback_at,
                last_updated: updatedProfile.last_updated,
              });
            } else {
              await base44.asServiceRole.entities.PlanPreferenceProfile.create({
                ...updatedProfile,
                created_by_id: effectiveUserId,
              });
            }
          }

          // Record the feedback entity
          await base44.asServiceRole.entities.MessageFeedback.create({
            user_id: effectiveUserId,
            campaign_id: campaign.id,
            message_id: message.id,
            generation_key: generationKey,
            rating: body.feedback.rating,
            reasons: body.feedback.reasons || [],
            custom_reason: body.feedback.custom_reason || '',
            improvement_action: body.improvement_action || '',
            recipient_id: recipientId,
            version_number: versionNumber,
            created_by_id: effectiveUserId,
          });
        } catch (fbErr) {
          console.warn('[generateMessage] Feedback recording failed:', fbErr.message);
        }
      }

      // ── 14. Release lock ──
      await base44.asServiceRole.entities.GenerationLock.update(lock.id, { status: 'released' });

      // ── 15. Create notification (only for original generation, not alternatives) ──
      if (generationType === 'original') {
        const notifType = messageStatus === 'pending' ? 'awaiting_approval' : 'message_ready';
        const notifTitle = messageStatus === 'pending' ? 'Awaiting Approval' : 'Message Ready';
        const notifBody = messageStatus === 'pending'
          ? `A message for "${campaign.name}" is awaiting your approval.`
          : `A message for "${campaign.name}" to ${recipient.name} is ready to send.`;

        try {
          await base44.asServiceRole.entities.Notification.create({
            title: notifTitle,
            body: notifBody,
            type: notifType,
            priority: messageStatus === 'pending' ? 'high' : 'medium',
            action_label: 'View',
            action_url: `/messages/${message.id}`,
            campaign_id: campaign.id,
            message_id: message.id,
            user_id: effectiveUserId,
            created_by_id: effectiveUserId,
          });

          // Scheduled/background preparation should also reach the registered
          // native device. DeviceToken ownership is created_by_id (not an
          // owner_user_id field). Only attempt a remote push when an active
          // native token exists; in-app Notification remains authoritative.
          const deviceTokens = await base44.asServiceRole.entities.DeviceToken.filter({
            created_by_id: effectiveUserId,
            is_active: true,
          }).catch(() => []);
          if (deviceTokens.length > 0 && body.delivery_time_utc) {
            await base44.asServiceRole.integrations.Core.SendPushNotification({
              user_id: effectiveUserId,
              title: notifTitle,
              content: notifBody,
              action_label: 'Open',
              action_url: `borisend://message/${message.id}`,
            }).catch((pushErr: any) => console.warn('[generateMessage] Push notification failed:', pushErr.message));
          }
        } catch { /* notification creation/push is best-effort */ }
      }

      console.info(`[generateMessage] SUCCESS — key: ${generationKey}, type: ${generationType}, version: ${versionNumber}, fallback: ${result.used_fallback}`);

      return Response.json({
        message,
        reused: false,
        blocked: false,
        used_fallback: result.used_fallback,
        needs_review: result.needs_review,
        versions: getActiveVersions(
          [...existingMessages, message] as any,
          generationKey
        ),
      });

    } catch (innerError) {
      // Release lock on any error
      try {
        await base44.asServiceRole.entities.GenerationLock.update(lock.id, { status: 'released' });
      } catch { /* ignore */ }
      if (capacityLockId) await releaseCapacityLock(base44.asServiceRole, capacityLockId);
      throw innerError;
    }

  } catch (error) {
    console.error('[generateMessage] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Helper: record ledger entry safely ──
async function recordLedgerSafe(base44: any, params: {
  request_id: string;
  generation_key: string;
  user_id: string;
  campaign_id: string;
  recipient_id: string;
  scheduled_occurrence: string;
  message_id: string | null;
  version_number: number;
  generation_type: string;
  provider_internal_name: string;
  started_at: string;
  status: string;
  failure_category: string;
  validation_result: string;
  feedback_reason: string;
}) {
  try {
    const entry = createLedgerEntry(params as any);
    await base44.asServiceRole.entities.GenerationUsageLedger.create({
      ...entry,
      created_by_id: params.user_id,
    });
  } catch (err) {
    console.warn('[generateMessage] Ledger recording failed:', err.message);
  }
}