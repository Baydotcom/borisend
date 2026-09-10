import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Authenticate — support both user calls and system calls (webhook, scheduled automation)
    let actor = 'system';
    try {
      const user = await base44.auth.me();
      if (user) actor = user.id;
    } catch {
      // System call (from stripeWebhook or scheduled automation) — actor remains 'system'
    }

    const body = await req.json();
    const referred_user_id = body?.referred_user_id;
    const event_type = body?.event_type;
    const trigger_source = body?.trigger_source || 'manual';

    if (!referred_user_id || !event_type) {
      return Response.json({ error: 'referred_user_id and event_type are required' }, { status: 400 });
    }

    const validEvents = ['signup', 'trial_started', 'became_paid', 'remained_active'];
    if (!validEvents.includes(event_type)) {
      return Response.json({ error: `Invalid event_type. Must be one of: ${validEvents.join(', ')}` }, { status: 400 });
    }

    const sr = base44.asServiceRole;

    // Find attribution for the referred user
    const attributions = await sr.entities.ReferralAttribution.filter({ referred_user_id });
    if (attributions.length === 0) {
      return Response.json({ success: false, message: 'No attribution found for this user' });
    }
    const attribution = attributions[0];

    // Idempotency: prevent duplicate rewards for the same event
    const existingRewards = await sr.entities.RewardLedger.filter({
      referral_attribution_id: attribution.id,
      event_type
    });
    if (existingRewards.length > 0) {
      return Response.json({ success: true, message: 'Reward already granted for this event', reward: existingRewards[0] });
    }

    // Configuration-driven reward rules — no hard-coded values
    const configs = await sr.entities.ReferralProgramConfiguration.filter({ is_active: true });
    const configMap = {};
    configs.forEach(c => { configMap[c.key] = c.value; });

    const eventEnabled = configMap[`reward_${event_type}_enabled`] === 'true';
    if (!eventEnabled) {
      return Response.json({ success: true, message: `Reward event '${event_type}' not enabled in configuration` });
    }

    const rewardAmount = parseFloat(configMap[`reward_${event_type}_amount`] || '0');
    const rewardType = configMap[`reward_${event_type}_type`] || 'message_credits';

    // Create reward ledger entry (append-only — never overwritten)
    const timestamp = new Date().toISOString();
    const reward = await sr.entities.RewardLedger.create({
      user_id: attribution.referrer_user_id,
      referral_attribution_id: attribution.id,
      referred_user_id: referred_user_id,
      event_type,
      reward_type: rewardType,
      amount: rewardAmount,
      status: 'pending',
      source: 'processRewardEvent',
      audit_metadata: {
        trigger: event_type,
        trigger_source,
        event_source: 'processRewardEvent',
        actor,
        timestamp,
        config_snapshot: {
          enabled_key: `reward_${event_type}_enabled`,
          amount_key: `reward_${event_type}_amount`,
          type_key: `reward_${event_type}_type`,
          amount: rewardAmount,
          type: rewardType
        }
      }
    });

    // Update attribution status based on event
    if (event_type === 'became_paid') {
      await sr.entities.ReferralAttribution.update(attribution.id, { status: 'qualified' });
    } else if (event_type === 'remained_active') {
      await sr.entities.ReferralAttribution.update(attribution.id, { status: 'rewarded' });

      const codeRecords = await sr.entities.ReferralCode.filter({ code: attribution.referral_code });
      if (codeRecords.length > 0) {
        await sr.entities.ReferralCode.update(codeRecords[0].id, {
          successful_referrals: (codeRecords[0].successful_referrals || 0) + 1
        });
      }
    }

    return Response.json({ success: true, reward });
  } catch (error) {
    console.error('[processRewardEvent] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});