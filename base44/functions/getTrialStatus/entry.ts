import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getUserTimezone, getTrialDayInfo } from '../../shared/timezone.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;

    // ── 1. Get user subscription ──
    let subs = await sr.entities.UserSubscription.filter({ owner_user_id: user.id });
    if (!subs || subs.length === 0) {
      subs = await sr.entities.UserSubscription.filter({ created_by_id: user.id });
    }
    const sub = subs[0] || null;

    if (!sub) {
      return Response.json({ has_subscription: false, trial_active: false, is_paused: false });
    }

    const now = new Date();
    const userTimezone = getUserTimezone(user);

    // ── Timezone-aware trial day calculations ──
    const trialDayInfo = getTrialDayInfo(sub.trial_ends_at, userTimezone);
    const daysRemaining = trialDayInfo.daysRemaining;
    const hoursRemaining = trialDayInfo.hoursRemaining;
    const isLastDay = trialDayInfo.isLastDay;

    // Determine effective status
    const isPaused = sub.status === 'paused';
    const isTrialActive = sub.trial_status === 'active' || sub.trial_status === 'payment_method_added' || sub.trial_status === 'conversion_scheduled';
    const isTrialEnded = sub.trial_status === 'expired' || sub.trial_status === 'converted';
    const isPaidActive = sub.status === 'active' && (sub.trial_status === 'converted' || !sub.trial_status);

    // Check if trial should be expired (for on-the-fly detection)
    const trialExpired = trialDayInfo.isExpired && isTrialActive;

    // Get plan details
    let planRecord = null;
    if (sub.plan_id) {
      try { planRecord = await sr.entities.SubscriptionPlan.get(sub.plan_id); } catch (_) {}
    }

    // Determine if modal should be shown (last day, once per day)
    const modalLastShown = sub.trial_modal_last_shown_at ? new Date(sub.trial_modal_last_shown_at) : null;
    const modalShownToday = modalLastShown && modalLastShown.toDateString() === now.toDateString();

    return Response.json({
      has_subscription: true,
      subscription_id: sub.id,
      status: sub.status,
      plan_name: sub.plan_name,
      plan_id: sub.plan_id,
      // Trial fields
      trial_status: sub.trial_status,
      trial_active: isTrialActive && !trialExpired,
      trial_started_at: sub.trial_started_at,
      trial_ends_at: sub.trial_ends_at,
      trial_offer_name: sub.trial_offer_name,
      trial_billing_interval: sub.trial_billing_interval,
      trial_conversion_scheduled: sub.trial_conversion_scheduled,
      trial_payment_method_added: sub.trial_status === 'payment_method_added' || sub.trial_status === 'conversion_scheduled',
      trial_days_remaining: daysRemaining,
      trial_hours_remaining: hoursRemaining,
      trial_is_last_day: isLastDay,
      trial_expired: trialExpired || sub.trial_status === 'expired',
      trial_converted: sub.trial_status === 'converted',
      // Paused mode
      is_paused: isPaused || trialExpired,
      paused_at: sub.paused_at,
      pause_reason: sub.pause_reason,
      // Modal
      show_payment_modal: isLastDay && !modalShownToday && !sub.trial_conversion_scheduled && sub.trial_status === 'active',
      // Plan limits
      monthly_limit: planRecord?.monthly_message_limit || sub.monthly_limit,
      max_campaigns: planRecord?.max_campaigns || sub.max_campaigns,
      // Stripe
      stripe_customer_id: sub.stripe_customer_id || null,
      // Timezone info for frontend
      user_timezone: userTimezone,
    });
  } catch (error) {
    console.error('[getTrialStatus] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});