import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'super_admin'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const payout_id = body?.payout_id;
    const action = body?.action;
    const notes = String(body?.notes || '').trim();
    const payment_reference = String(body?.payment_reference || '').trim();

    if (!payout_id || !action) {
      return Response.json({ error: 'payout_id and action are required' }, { status: 400 });
    }

    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      mark_paid: 'paid'
    };

    const newStatus = statusMap[action];
    if (!newStatus) {
      return Response.json({ error: 'Invalid action. Use: approve, reject, mark_paid' }, { status: 400 });
    }

    const sr = base44.asServiceRole;
    const payout = await sr.entities.PayoutRequest.get(payout_id);
    if (!payout) {
      return Response.json({ error: 'Payout not found' }, { status: 404 });
    }

    const allowedTransitions = {
      requested: new Set(['approve', 'reject']),
      approved: new Set(['mark_paid', 'reject']),
      rejected: new Set(),
      paid: new Set(),
    };
    if (!allowedTransitions[payout.status]?.has(action)) {
      return Response.json({ error: `Cannot ${action} a payout with status ${payout.status}.` }, { status: 409 });
    }
    if (action === 'mark_paid' && !payment_reference) {
      return Response.json({ error: 'payment_reference is required before a payout can be marked paid' }, { status: 400 });
    }

    // Validate the entire reserved ledger set before changing any payout state.
    // Retries tolerate rewards already marked paid by an earlier interrupted
    // attempt, provided they are part of this payout's reserved ID set.
    const rewardsToSettle = [];
    if (action === 'mark_paid') {
      if (!Array.isArray(payout.reward_ledger_ids) || payout.reward_ledger_ids.length === 0) {
        return Response.json({ error: 'Payout has no reserved reward ledger entries.' }, { status: 409 });
      }
      for (const rewardId of payout.reward_ledger_ids) {
        const reward = await sr.entities.RewardLedger.get(rewardId);
        if (!reward || reward.user_id !== payout.user_id || reward.reward_type !== 'cash_payout' || !['approved', 'paid'].includes(reward.status)) {
          return Response.json({ error: `Payout not settled: reward ${rewardId} failed validation.` }, { status: 409 });
        }
        rewardsToSettle.push(reward);
      }

      for (const reward of rewardsToSettle) {
        if (reward.status !== 'paid') {
          await sr.entities.RewardLedger.update(reward.id, { status: 'paid' });
        }
      }
    }

    const updateData = {
      status: newStatus,
      processed_at: new Date().toISOString(),
      processed_by_user_id: user.id,
      admin_notes: notes,
    };
    if (action === 'mark_paid') updateData.payment_reference = payment_reference;

    await sr.entities.PayoutRequest.update(payout_id, updateData);

    return Response.json({ success: true, payout_id, new_status: newStatus });
  } catch (error) {
    console.error('[adminManagePayout] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});