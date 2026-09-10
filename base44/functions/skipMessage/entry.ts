import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import {
  getEffectiveEntitlements,
  checkMessagePassCapacity,
  acquireCapacityLock,
  releaseCapacityLock,
} from '../../shared/entitlements/entitlement-service.ts';

/**
 * RC18 — Skip Message (rewritten with Message Pass architecture).
 *
 * A Message Pass gives the user the ability to SKIP a prepared Generated Message.
 * Using a Message Pass DOES NOT refund the Generated Message Unit (§B).
 *
 * Flow (§11):
 *   1. authenticate user
 *   2. verify Message ownership
 *   3. verify Message is eligible for Skip (pending or approved)
 *   4. determine current entitlement period
 *   5. check Message Pass capacity (idempotent via generation_key)
 *   6. atomically record Pass consumption (if not already consumed)
 *   7. mark Message skipped/resolved
 *   8. preserve Generated Message consumption (untouched)
 *   9. preserve recipient-specific preference signal (skip_reason)
 *
 * §10 Idempotency: one generation_key = max 1 pass. Repeated Skip clicks,
 * network retries, and frontend retries do not consume additional passes.
 *
 * §12: If passes are exhausted, the skip is BLOCKED. The user may still
 * Approve or Edit & Use — but cannot Skip without a pass.
 *
 * §13: Delete is NOT a free Skip. Deleting a message does not consume or
 * refund a pass, and does not resolve the workflow the way Skip does.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    // 1. Authenticate
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { message_id, skip_reason } = body;

    if (!message_id) {
      return Response.json({ error: 'message_id is required' }, { status: 400 });
    }

    // 2. Load the message (service-role, enforce ownership manually)
    const messages = await sr.entities.Message.filter({ id: message_id });
    const message = messages[0];

    if (!message) {
      return Response.json({ error: 'Message not found' }, { status: 404 });
    }

    const messageOwner = message.user_id || message.created_by_id;
    if (messageOwner !== user.id && user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // 3. Verify Message is eligible for Skip
    if (!['pending', 'approved'].includes(message.status)) {
      return Response.json({ error: `Cannot skip a message with status: ${message.status}` }, { status: 400 });
    }

    // 4. Determine generation_key for idempotency
    const generationKey = message.generation_key ||
      `${message.campaign_id}|${message.plan_recipient_id || message.recipient_name || ''}|${message.occurrence || message.created_date}`;

    // 5. Check Message Pass capacity (idempotent)
    const passCheck = await checkMessagePassCapacity(sr, user.id, generationKey);

    // §10: If already consumed (idempotent), just mark message as skipped
    if (passCheck.isIdempotent) {
      await sr.entities.Message.update(message_id, {
        status: 'skipped',
        resolution_reason: message.resolution_reason || 'user_skipped',
      });
      return Response.json({
        success: true,
        message_id,
        status: 'skipped',
        idempotent: true,
        passes_remaining: passCheck.remaining,
      });
    }

    // §12: If passes exhausted, BLOCK
    if (!passCheck.allowed) {
      return Response.json({
        success: false,
        blocked: true,
        reason: "You've used your Message Passes for this period.",
        passes_used: passCheck.used,
        passes_effective: passCheck.effective,
        passes_remaining: passCheck.remaining,
      }, { status: 402 });
    }

    // 6. Atomically record Pass consumption
    const requestId = `skip:${message_id}:${user.id}`;
    const lock = await acquireCapacityLock(sr, user.id, requestId);

    if (!lock.acquired) {
      return Response.json({ error: 'A capacity update is in progress. Please retry.' }, { status: 409 });
    }

    try {
      // Double-check idempotency inside the lock (race condition prevention)
      const recheck = await checkMessagePassCapacity(sr, user.id, generationKey);
      if (recheck.isIdempotent) {
        await sr.entities.Message.update(message_id, {
          status: 'skipped',
          resolution_reason: message.resolution_reason || 'user_skipped',
        });
        return Response.json({
          success: true,
          message_id,
          status: 'skipped',
          idempotent: true,
          passes_remaining: recheck.remaining,
        });
      }
      if (!recheck.allowed) {
        return Response.json({
          success: false,
          blocked: true,
          reason: "You've used your Message Passes for this period.",
        }, { status: 402 });
      }

      // Record the pass consumption in the immutable ledger
      const ent = await getEffectiveEntitlements(sr, user.id);
      await sr.entities.MessagePassUsageLedger.create({
        owner_user_id: user.id,
        message_id: message_id,
        generation_key: generationKey,
        campaign_id: message.campaign_id || null,
        plan_recipient_id: message.plan_recipient_id || null,
        consumed_at: new Date().toISOString(),
        period_start: ent.messagePeriodStart || ent.periodStart || null,
        period_end: ent.periodEnd || null,
        units_consumed: 1,
        status: 'consumed',
        skip_reason: skip_reason || null,
      });

      // 7. Mark Message skipped (8: Generated Message consumption preserved — untouched)
      // 9: Preference signal preserved via skip_reason on the ledger + resolution_reason on the message
      await sr.entities.Message.update(message_id, {
        status: 'skipped',
        resolution_reason: 'user_skipped',
      });

      // Analytics (best-effort)
      try {
        await base44.analytics.track({
          eventName: 'message_skipped',
          properties: { campaign_id: message.campaign_id || null, pass_consumed: true },
        });
      } catch { /* non-blocking */ }

      return Response.json({
        success: true,
        message_id,
        status: 'skipped',
        pass_consumed: true,
        passes_remaining: recheck.remaining - 1,
      });
    } finally {
      await releaseCapacityLock(sr, lock.lockId);
    }
  } catch (error) {
    console.error('[skipMessage] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});