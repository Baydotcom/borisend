import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'super_admin'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const sr = base44.asServiceRole;

    const [codes, attributions, rewards, payouts, configs, commissionConfig] = await Promise.all([
      sr.entities.ReferralCode.list('-created_date', 200),
      sr.entities.ReferralAttribution.list('-created_date', 200),
      sr.entities.RewardLedger.list('-created_date', 200),
      sr.entities.PayoutRequest.list('-created_date', 200),
      sr.entities.ReferralProgramConfiguration.list('-created_date', 100),
      sr.entities.ReferralCommissionConfiguration.filter({ is_active: true })
    ]);

    // Export-ready flat data structures (no file export — structured for export readiness)
    const export_ready = {
      attributions: attributions.map(a => ({
        id: a.id,
        created_date: a.created_date,
        referral_code: a.referral_code,
        referrer_user_id: a.referrer_user_id,
        referred_user_id: a.referred_user_id,
        referred_email: a.referred_email,
        status: a.status,
        fraud_flag: a.fraud_flag,
        fraud_reason: a.fraud_reason,
        attribution_source: a.attribution_source
      })),
      rewards: rewards.map(r => ({
        id: r.id,
        created_date: r.created_date,
        user_id: r.user_id,
        referred_user_id: r.referred_user_id,
        event_type: r.event_type,
        reward_type: r.reward_type,
        amount: r.amount,
        status: r.status,
        source: r.source,
        subscription_id: r.subscription_id,
        payment_reference: r.payment_reference,
        billing_period: r.billing_period,
        payment_amount: r.payment_amount,
        commission_type: r.commission_type,
        commission_rate: r.commission_rate,
        commission_cycle_number: r.commission_cycle_number,
        commission_duration_rule: r.commission_duration_rule
      })),
      payouts: payouts.map(p => ({
        id: p.id,
        created_date: p.created_date,
        user_id: p.user_id,
        user_email: p.user_email,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method,
        requested_at: p.requested_at,
        processed_at: p.processed_at
      }))
    };

    return Response.json({
      codes,
      attributions,
      rewards,
      payouts,
      configs,
      export_ready,
      commission_config: commissionConfig[0] || null,
      commission_summary: {
        total_commission_rewards: rewards.filter(r => r.event_type === 'subscription_commission').length,
        pending_commission: rewards.filter(r => r.event_type === 'subscription_commission' && r.status === 'pending').length,
        approved_commission: rewards.filter(r => r.event_type === 'subscription_commission' && r.status === 'approved').length,
        paid_commission: rewards.filter(r => r.event_type === 'subscription_commission' && r.status === 'paid').length,
        total_commission_liability: rewards
          .filter(r => r.event_type === 'subscription_commission' && r.status !== 'rejected')
          .reduce((sum, r) => sum + (r.amount || 0), 0),
        active_commission_referrals: new Set(
          rewards.filter(r => r.event_type === 'subscription_commission' && r.status !== 'rejected')
            .map(r => r.referred_user_id)
        ).size,
        commission_by_duration: {
          fixed_months: rewards.filter(r => r.event_type === 'subscription_commission' && r.commission_duration_rule === 'fixed_months').length,
          lifetime: rewards.filter(r => r.event_type === 'subscription_commission' && r.commission_duration_rule === 'lifetime').length
        }
      },
      summary: {
        total_codes: codes.length,
        total_attributions: attributions.length,
        flagged_attributions: attributions.filter(a => a.fraud_flag).length,
        total_rewards: rewards.length,
        pending_rewards: rewards.filter(r => r.status === 'pending').length,
        approved_rewards: rewards.filter(r => r.status === 'approved').length,
        paid_rewards: rewards.filter(r => r.status === 'paid').length,
        total_payouts: payouts.length,
        requested_payouts: payouts.filter(p => p.status === 'requested').length,
        approved_payouts: payouts.filter(p => p.status === 'approved').length,
        paid_payouts: payouts.filter(p => p.status === 'paid').length
      }
    });
  } catch (error) {
    console.error('[adminGetReferrals] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});