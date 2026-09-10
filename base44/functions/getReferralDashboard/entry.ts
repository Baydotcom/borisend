import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BR';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getOrCreateReferralCode(sr, user) {
  const existing = await sr.entities.ReferralCode.filter({ owner_user_id: user.id });
  if (existing.length > 0) return existing[0];

  for (let attempts = 0; attempts < 5; attempts++) {
    const code = generateReferralCode();
    const collision = await sr.entities.ReferralCode.filter({ code });
    if (collision.length === 0) {
      return await sr.entities.ReferralCode.create({
        code,
        owner_user_id: user.id,
        owner_email: user.email,
        is_active: true,
        total_referrals: 0,
        successful_referrals: 0
      });
    }
  }
  throw new Error('Failed to generate unique referral code after 5 attempts');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;

    // Get or create referral code for user
    const referralCode = await getOrCreateReferralCode(sr, user);

    // Get attribution records where user is referrer
    const attributions = await sr.entities.ReferralAttribution.filter(
      { referrer_user_id: user.id },
      '-created_date',
      100
    );

    // Get reward ledger entries (append-only history)
    const rewards = await sr.entities.RewardLedger.filter(
      { user_id: user.id },
      '-created_date',
      100
    );

    // Get payout requests
    const payouts = await sr.entities.PayoutRequest.filter(
      { user_id: user.id },
      '-created_date',
      50
    );

    // Compute payout availability from ledger identity, not arithmetic alone.
    // Open payouts reserve exact reward IDs; those rewards are unavailable for
    // another request until that payout is rejected or settled.
    const openPayouts = payouts.filter(p => p.status === 'requested' || p.status === 'approved');
    const reservedRewardIds = new Set(openPayouts.flatMap(p => p.reward_ledger_ids || []));
    const eligibleApprovedCashRewards = rewards.filter(r =>
      r.status === 'approved' && r.reward_type === 'cash_payout' && !reservedRewardIds.has(r.id)
    );
    const availablePayoutBalance = eligibleApprovedCashRewards
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const payoutConfigs = await sr.entities.ReferralProgramConfiguration.filter({
      key: 'minimum_payout_amount',
      is_active: true,
    }).catch(() => []);
    const configuredMinimum = Number(payoutConfigs?.[0]?.value);
    const minimumPayout = Number.isFinite(configuredMinimum) && configuredMinimum > 0 ? configuredMinimum : 50;

    // Split rewards into one-time and commission
    const oneTimeRewards = rewards.filter(r => r.event_type !== 'subscription_commission');
    const commissionRewards = rewards.filter(r => r.event_type === 'subscription_commission');
    const activeCommissionReferrals = new Set(
      commissionRewards.filter(r => r.status !== 'rejected').map(r => r.referred_user_id)
    ).size;

    const stats = {
      total_referrals: attributions.length,
      successful_referrals: attributions.filter(a => a.status === 'rewarded').length,
      pending_rewards: oneTimeRewards.filter(r => r.status === 'pending').length,
      approved_rewards: oneTimeRewards.filter(r => r.status === 'approved').length,
      paid_rewards: oneTimeRewards.filter(r => r.status === 'paid').length,
      total_reward_amount: oneTimeRewards
        .filter(r => r.status === 'approved' || r.status === 'paid')
        .reduce((sum, r) => sum + (r.amount || 0), 0),
      lifetime_rewards_earned: oneTimeRewards
        .filter(r => r.status !== 'rejected')
        .reduce((sum, r) => sum + (r.amount || 0), 0),
      available_payout_balance: Math.max(0, availablePayoutBalance),
      minimum_payout_amount: minimumPayout,
      payout_eligible: availablePayoutBalance >= minimumPayout,
      pending_payouts: openPayouts.length,
      // Commission-specific stats
      one_time_rewards: oneTimeRewards.length,
      commission_rewards: commissionRewards.length,
      lifetime_commission_earned: commissionRewards
        .filter(r => r.status !== 'rejected')
        .reduce((sum, r) => sum + (r.amount || 0), 0),
      pending_commission: commissionRewards.filter(r => r.status === 'pending').length,
      approved_commission: commissionRewards.filter(r => r.status === 'approved').length,
      paid_commission: commissionRewards.filter(r => r.status === 'paid').length,
      active_commission_referrals: activeCommissionReferrals
    };

    const PUBLIC_REFERRAL_DOMAIN = 'https://borisend.com';

    return Response.json({
      referral_code: referralCode.code,
      referral_link: `${PUBLIC_REFERRAL_DOMAIN}/?ref=${referralCode.code}`,
      stats,
      // Do not expose the referred user's email address to the referrer. Admin
      // reporting retains it through adminGetReferrals; the customer dashboard
      // receives only referral status metadata.
      attributions: attributions.map(a => ({
        id: a.id,
        status: a.status,
        created_date: a.created_date
      })),
      rewards,
      payouts
    });
  } catch (error) {
    console.error('[getReferralDashboard] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});