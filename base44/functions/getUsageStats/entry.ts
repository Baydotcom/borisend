import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getCapacityStatus } from '../../shared/entitlements/entitlement-service.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const sr = base44.asServiceRole;

    // ── RC12/RC16.6: entitlement-derived capacity (authoritative) ──
    const capStatus = await getCapacityStatus(sr, user.id);

    // Legacy subscription for paused state detection only.
    let subs = await sr.entities.UserSubscription.filter({ owner_user_id: user.id });
    if (!subs || subs.length === 0) {
      subs = await sr.entities.UserSubscription.filter({ created_by_id: user.id });
    }
    const sub = subs[0] || null;
    const isPausedLegacy = sub && sub.status === 'paused';

    // A new BoriSend 2.0 membership (active/trial) overrides legacy paused state.
    const isMembershipActive = capStatus.membershipStatus === 'active' || capStatus.membershipStatus === 'trial';
    const isPaused = isPausedLegacy && !isMembershipActive;

    if (isPaused) {
      return Response.json({
        used: 0, limit: 0, remaining: 0,
        planName: 'Paused', status: 'paused', is_paused: true,
        periodStart: sub?.current_period_start || new Date().toISOString(),
        periodEnd: sub?.current_period_end || new Date().toISOString(),
        maxCommunicationPlans: 0, currentCommunicationPlans: 0, remainingCommunicationPlans: 0,
        planUnit: { used: 0, effective: 0, remaining: 0, overCapacity: 0, isOverCapacity: false, breakdown: capStatus.plan.breakdown },
        recipientUnit: { used: 0, effective: 0, remaining: 0, overCapacity: 0, isOverCapacity: false, breakdown: capStatus.recipient.breakdown },
        pause_reason: sub?.pause_reason || 'subscription_cancelled',
        membershipStatus: capStatus.membershipStatus,
      });
    }

    // RC16.6: Message usage comes from the AUTHORITATIVE EntitlementService
    // (getMessageUnitConsumption via getCapacityStatus), NOT a sent-only
    // legacy counter. The previous implementation counted only status='sent'
    // messages via sent_at, which violated the commercial rule (consumption =
    // prepared, not sent) and used legacy UserSubscription period dates
    // instead of the membership billing window.
    const messageUsed = capStatus.message.used;
    const messageLimit = capStatus.message.effective;

    // Period for display: prefer membership billing period, fall back to legacy.
    const now = new Date();
    const periodEnd = capStatus.periodEnd
      ? new Date(capStatus.periodEnd)
      : (sub?.current_period_end ? new Date(sub.current_period_end) : new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const periodStart = sub?.current_period_start
      ? new Date(sub.current_period_start)
      : new Date(now.getFullYear(), now.getMonth(), 1);

    // Legacy plan name for display (fallback when no membership).
    let planRecord = null;
    if (sub && sub.plan_id) {
      try { planRecord = await sr.entities.SubscriptionPlan.get(sub.plan_id); } catch (_) {}
    }
    if (!planRecord && sub && sub.plan_name) {
      const allPlans = await sr.entities.SubscriptionPlan.list('sort_order', 50);
      planRecord = allPlans.find(p => p.name === sub.plan_name) || null;
    }
    const planName = isMembershipActive
      ? (capStatus.membershipStatus === 'trial' ? 'Trial' : 'BoriSend Membership')
      : (planRecord?.name || 'Trial');
    const status = isMembershipActive ? (capStatus.membershipStatus === 'trial' ? 'trial' : 'active') : 'trial';
    const isTrial = capStatus.membershipStatus === 'trial';

    return Response.json({
      used: messageUsed, limit: messageLimit, remaining: Math.max(0, messageLimit - messageUsed),
      planName, status, is_trial: isTrial,
      trial_ends_at: sub?.trial_ends_at || capStatus.periodEnd || null,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      // Communication Plan capacity (RC12 authoritative)
      maxCommunicationPlans: capStatus.plan.effective,
      currentCommunicationPlans: capStatus.plan.used,
      remainingCommunicationPlans: capStatus.plan.remaining,
      planUnit: {
        used: capStatus.plan.used,
        effective: capStatus.plan.effective,
        remaining: capStatus.plan.remaining,
        overCapacity: capStatus.plan.overCapacity,
        isOverCapacity: capStatus.plan.isOverCapacity,
        breakdown: capStatus.plan.breakdown,
      },
      recipientUnit: {
        used: capStatus.recipient.used,
        effective: capStatus.recipient.effective,
        remaining: capStatus.recipient.remaining,
        overCapacity: capStatus.recipient.overCapacity,
        isOverCapacity: capStatus.recipient.isOverCapacity,
        breakdown: capStatus.recipient.breakdown,
      },
      membershipStatus: capStatus.membershipStatus,
    });
  } catch (error) {
    console.error('[getUsageStats] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});