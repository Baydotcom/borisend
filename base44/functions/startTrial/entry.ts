import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;

    // ── 1. Load trial configuration ──
    const configs = await sr.entities.TrialConfiguration.filter({ is_active: true });
    const config = configs[0];
    if (!config) return Response.json({ error: 'Trial configuration not found' }, { status: 500 });
    if (!config.trial_enabled) return Response.json({ error: 'Trials are not enabled', trial_disabled: true }, { status: 403 });

    // ── 2. Check if user already has a subscription ──
    const existingSubs = await sr.entities.UserSubscription.filter({ owner_user_id: user.id });
    if (existingSubs.length > 0) {
      const existing = existingSubs[0];
      // If they already have a trial or paid subscription, don't create another
      if (existing.trial_status === 'active' || existing.trial_status === 'payment_method_added' || existing.trial_status === 'conversion_scheduled') {
        return Response.json({ success: true, message: 'Trial already exists', trial: existing, already_exists: true });
      }
      if (existing.status === 'active' && existing.trial_status === 'converted') {
        return Response.json({ success: true, message: 'User already has an active paid subscription', already_paid: true });
      }
    }

    // ── 3. Trial eligibility checks ──
    // One trial per person: check if is_trial_eligible is false on any existing record
    if (config.one_trial_per_person) {
      const existingRecord = existingSubs[0];
      if (existingRecord && existingRecord.is_trial_eligible === false && existingRecord.trial_status !== 'eligible') {
        return Response.json({ error: 'You have already used your trial', not_eligible: true }, { status: 403 });
      }
    }

    // One trial per email: indexed lookup (replaces 500-user scan)
    if (config.one_trial_per_email) {
      const normalisedEmail = user.email.toLowerCase().trim();
      // Indexed lookup by email — scalable, no user-list scan
      const matchingUsers = await sr.entities.User.filter({ email: user.email });
      for (const mu of matchingUsers) {
        if (mu.id === user.id) continue;
        // Also check normalised email for case-insensitive match
        if (!mu.email || mu.email.toLowerCase().trim() !== normalisedEmail) continue;
        const theirSubs = await sr.entities.UserSubscription.filter({ owner_user_id: mu.id });
        if (theirSubs.length > 0 && theirSubs[0].is_trial_eligible === false && theirSubs[0].trial_status !== 'eligible') {
          return Response.json({ error: 'A trial has already been used for this email address', not_eligible: true }, { status: 403 });
        }
      }
    }

    // ── 4. Get the trial plan ──
    let trialPlan = null;
    if (config.trial_plan_id) {
      try { trialPlan = await sr.entities.SubscriptionPlan.get(config.trial_plan_id); } catch (_) {}
    }
    if (!trialPlan) {
      // Fallback: find Starter plan
      const allPlans = await sr.entities.SubscriptionPlan.list("sort_order", 50);
      trialPlan = allPlans.find(p => p.name && p.name.toLowerCase() === 'starter');
    }
    if (!trialPlan) return Response.json({ error: 'Trial plan (Starter) not found in SubscriptionPlan' }, { status: 500 });
    if (!trialPlan.is_active) return Response.json({ error: 'Trial plan is not active' }, { status: 500 });

    // ── 5. Create the trial ──
    // Trial dates are stored as UTC ISO strings — timezone awareness is applied at display/reminder time
    const now = new Date();
    const trialEnds = new Date(now.getTime() + (config.trial_duration_days || 7) * 24 * 60 * 60 * 1000);

    const trialData = {
      owner_user_id: user.id,
      plan_id: trialPlan.id,
      plan_name: trialPlan.name,
      status: 'trial',
      monthly_limit: trialPlan.monthly_message_limit,
      max_campaigns: trialPlan.max_campaigns,
      messages_used_this_month: 0,
      current_period_start: now.toISOString(),
      current_period_end: trialEnds.toISOString(),
      last_reset_date: now.toISOString().split('T')[0],
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
      trial_plan_id: trialPlan.id,
      trial_status: 'active',
      trial_offer_name: config.trial_offer_name || `${config.trial_duration_days}-Day ${trialPlan.name} Trial`,
      is_trial_eligible: false,
    };

    let subscription;
    if (existingSubs.length > 0) {
      subscription = await sr.entities.UserSubscription.update(existingSubs[0].id, trialData);
    } else {
      subscription = await sr.entities.UserSubscription.create(trialData);
    }

    // ── 6. Audit log ──
    await sr.entities.TrialAuditLog.create({
      user_id: user.id,
      action: 'trial_started',
      actor: user.id,
      details: `Trial started for plan "${trialPlan.name}" — ends ${trialEnds.toISOString()}`,
      new_value: 'active',
    });

    // ── 7. Analytics ──
    try {
      await base44.analytics.track({ eventName: 'trial_started', properties: { plan: trialPlan.name, duration_days: config.trial_duration_days } });
    } catch (_) {}

    // ── 8. Notification ──
    await sr.entities.Notification.create({
      title: 'Welcome to BoriSend',
      body: `Your ${config.trial_offer_name || '7-Day Starter Trial'} has started. You can use all ${trialPlan.name} features until ${trialEnds.toLocaleDateString()}.`,
      type: 'message_ready',
      priority: 'medium',
      user_id: user.id,
      created_by_id: user.id,
    });

    // ── 9. Trigger referral "trial_started" event ──
    try {
      await sr.functions.invoke('processRewardEvent', {
        referred_user_id: user.id,
        event_type: 'trial_started',
        trigger_source: 'startTrial'
      });
    } catch (referralError) {
      console.error('[startTrial] Referral trial_started trigger failed:', referralError.message);
    }

    return Response.json({
      success: true,
      trial: subscription,
      trial_plan_name: trialPlan.name,
      trial_ends_at: trialEnds.toISOString(),
      monthly_limit: trialPlan.monthly_message_limit,
      max_campaigns: trialPlan.max_campaigns,
    });
  } catch (error) {
    console.error('[startTrial] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});