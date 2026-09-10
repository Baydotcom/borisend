import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const referral_code = body?.referral_code;
    if (!referral_code) {
      return Response.json({ error: 'referral_code is required' }, { status: 400 });
    }

    const sr = base44.asServiceRole;

    // ── 1. Look up referral code ──
    const codes = await sr.entities.ReferralCode.filter({ code: referral_code, is_active: true });
    if (codes.length === 0) {
      return Response.json({ error: 'Invalid or inactive referral code', fraud_type: 'invalid_code' }, { status: 400 });
    }
    const referralCode = codes[0];

    // ── 2. Fraud checks (server-side, authoritative) ──

    // a. Self-referral
    if (referralCode.owner_user_id === user.id) {
      return Response.json({ error: 'Cannot use your own referral code', fraud_type: 'self_referral' }, { status: 400 });
    }

    // b. Duplicate attribution — user already attributed to a referral
    const existingAttributions = await sr.entities.ReferralAttribution.filter({ referred_user_id: user.id });
    if (existingAttributions.length > 0) {
      return Response.json({ error: 'You have already been attributed to a referral', fraud_type: 'duplicate_attribution' }, { status: 400 });
    }

    // c. Referral loop — referrer was referred by current user
    const reverseAttributions = await sr.entities.ReferralAttribution.filter({
      referrer_user_id: user.id,
      referred_user_id: referralCode.owner_user_id
    });
    if (reverseAttributions.length > 0) {
      return Response.json({ error: 'Referral loop detected', fraud_type: 'referral_loop' }, { status: 400 });
    }

    // d. Repeated referral attempts — same user trying multiple codes
    // (Already covered by duplicate check, but we log the attempt)

    // ── 3. Create attribution (recorded once, never silently overwritten) ──
    const attribution = await sr.entities.ReferralAttribution.create({
      referral_code: referral_code,
      referrer_user_id: referralCode.owner_user_id,
      referred_user_id: user.id,
      referred_email: user.email,
      status: 'attributed',
      fraud_flag: false,
      attribution_source: 'signup_link'
    });

    // ── 4. Update referral code counter ──
    await sr.entities.ReferralCode.update(referralCode.id, {
      total_referrals: (referralCode.total_referrals || 0) + 1
    });

    // ── 5. Check reward config for signup event ──
    const configs = await sr.entities.ReferralProgramConfiguration.filter({ is_active: true });
    const configMap = {};
    configs.forEach(c => { configMap[c.key] = c.value; });

    let reward = null;
    if (configMap['reward_signup_enabled'] === 'true') {
      const rewardAmount = parseFloat(configMap['reward_signup_amount'] || '0');
      const rewardType = configMap['reward_signup_type'] || 'message_credits';

      reward = await sr.entities.RewardLedger.create({
        user_id: referralCode.owner_user_id,
        referral_attribution_id: attribution.id,
        referred_user_id: user.id,
        event_type: 'signup',
        reward_type: rewardType,
        amount: rewardAmount,
        status: 'pending',
        source: 'processReferralAttribution',
        audit_metadata: {
          referral_code: referral_code,
          attributed_at: new Date().toISOString(),
          config_snapshot: {
            reward_signup_amount: rewardAmount,
            reward_signup_type: rewardType
          }
        }
      });
    }

    return Response.json({ success: true, attribution, reward });
  } catch (error) {
    console.error('[processReferralAttribution] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});