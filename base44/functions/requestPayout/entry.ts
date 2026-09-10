import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // The client does not choose the payable amount. The server reserves the
    // entire currently eligible balance so payout requests and reward-ledger
    // settlement always reconcile exactly.
    await req.json().catch(() => ({}));

    const sr = base44.asServiceRole;

    const [approvedRewards, allPayouts, payoutConfigs] = await Promise.all([
      sr.entities.RewardLedger.filter({
        user_id: user.id,
        status: 'approved',
        reward_type: 'cash_payout'
      }),
      sr.entities.PayoutRequest.filter({ user_id: user.id }),
      sr.entities.ReferralProgramConfiguration.filter({ key: 'minimum_payout_amount', is_active: true }).catch(() => [])
    ]);

    // Rewards already attached to an open payout are reserved and must never be
    // attached to a second request.
    const openPayouts = allPayouts.filter(p => p.status === 'requested' || p.status === 'approved');
    const reservedRewardIds = new Set(openPayouts.flatMap(p => p.reward_ledger_ids || []));
    const eligibleRewards = approvedRewards.filter(r => !reservedRewardIds.has(r.id));
    const availableBalance = eligibleRewards.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const configuredMinimum = Number(payoutConfigs?.[0]?.value);
    const minimumPayout = Number.isFinite(configuredMinimum) && configuredMinimum > 0 ? configuredMinimum : 50;

    if (availableBalance < minimumPayout) {
      return Response.json({
        error: `Minimum payout is £${minimumPayout.toFixed(2)}. Available: £${availableBalance.toFixed(2)}.`,
        available: availableBalance,
        minimum_payout: minimumPayout
      }, { status: 400 });
    }

    if (eligibleRewards.length === 0) {
      return Response.json({ error: 'No eligible approved rewards are available for payout.' }, { status: 400 });
    }

    const payout = await sr.entities.PayoutRequest.create({
      user_id: user.id,
      user_email: user.email,
      amount: availableBalance,
      currency: 'GBP',
      status: 'requested',
      method: 'manual_bank_transfer',
      reward_ledger_ids: eligibleRewards.map(r => r.id),
      requested_at: new Date().toISOString()
    });

    return Response.json({ success: true, payout });
  } catch (error) {
    console.error('[requestPayout] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});