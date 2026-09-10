/**
 * Shared subscription guard — single source of truth for Paused Mode enforcement.
 * Every backend function that performs a paid operation must call this.
 *
 * Returns { allowed, isPaused, isTrial, isActive, subscription, planRecord, error }
 * If allowed === false, error contains a user-friendly message.
 */
export async function checkSubscriptionAccess(sr, userId) {
  let subs = await sr.entities.UserSubscription.filter({ owner_user_id: userId });
  if (!subs || subs.length === 0) {
    subs = await sr.entities.UserSubscription.filter({ created_by_id: userId });
  }
  const sub = subs[0] || null;
  const now = new Date();

  // ── RC12: BoriSend 2.0 membership (authoritative for new members) ──
  // If there is no legacy subscription, or the legacy one is paused/expired,
  // an active BoriSend 2.0 membership grants access. RC12 does not define a
  // per-message quota for the new membership (capacity = plan/recipient
  // units), so a high default keeps the scheduler's legacy quota path working.
  const memSubs = await sr.entities.MembershipSubscription.filter({ owner_user_id: userId });
  let activeMem = null;
  for (const s of memSubs) {
    if (!['active', 'trial', 'grace', 'past_due'].includes(s.status)) continue;
    if (s.current_period_end && now > new Date(s.current_period_end)) continue;
    if (s.status === 'trial' && s.trial_ends_at && now > new Date(s.trial_ends_at)) continue;
    if (!activeMem || new Date(s.current_period_end || 0) > new Date(activeMem.current_period_end || 0)) activeMem = s;
  }
  if (activeMem && (!sub || sub.status === 'paused' || sub.status === 'expired')) {
    return {
      allowed: true, isPaused: false,
      isTrial: activeMem.status === 'trial',
      isActive: activeMem.status === 'active',
      subscription: sub,
      planRecord: { monthly_message_limit: 100000, max_campaigns: null },
      error: undefined, isMembership2: true, membershipConfigId: activeMem.membership_config_id,
    };
  }

  // No subscription at all — not allowed
  if (!sub) {
    return {
      allowed: false,
      isPaused: false,
      isTrial: false,
      isActive: false,
      subscription: null,
      planRecord: null,
      error: 'Your trial has ended. Choose a subscription to continue using BoriSend.',
    };
  }

  // Explicitly paused
  if (sub.status === 'paused') {
    return {
      allowed: false,
      isPaused: true,
      isTrial: false,
      isActive: false,
      subscription: sub,
      planRecord: null,
      error: 'Your trial has ended. Choose a subscription to continue using BoriSend.',
    };
  }

  // On-the-fly trial expiry detection
  const isTrialActive = sub.trial_status === 'active' || sub.trial_status === 'payment_method_added' || sub.trial_status === 'conversion_scheduled';
  const trialEndsAt = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  if (isTrialActive && trialEndsAt && now > trialEndsAt) {
    return {
      allowed: false,
      isPaused: true,
      isTrial: false,
      isActive: false,
      subscription: sub,
      planRecord: null,
      error: 'Your trial has ended. Choose a subscription to continue using BoriSend.',
    };
  }

  // Active trial or active paid subscription — allowed
  const isTrial = sub.status === 'trial' || isTrialActive;
  const isActive = sub.status === 'active' && (sub.trial_status === 'converted' || !sub.trial_status);

  // Load plan record for limits
  let planRecord = null;
  if (sub.plan_id) {
    try { planRecord = await sr.entities.SubscriptionPlan.get(sub.plan_id); } catch (_) {}
  }
  if (!planRecord && sub.plan_name) {
    const allPlans = await sr.entities.SubscriptionPlan.list('sort_order', 50);
    planRecord = allPlans.find(p => p.name === sub.plan_name) || null;
  }

  return {
    allowed: true,
    isPaused: false,
    isTrial,
    isActive,
    subscription: sub,
    planRecord,
    error: undefined,
  };
}