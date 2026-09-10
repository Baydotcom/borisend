import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Support both user calls and system calls (webhook, scheduled automation)
    let actor = 'system';
    try {
      const user = await base44.auth.me();
      if (user) actor = user.id;
    } catch {
      // System call — actor remains 'system'
    }

    const body = await req.json();
    const {
      referred_user_id,
      subscription_id,
      invoice_id,
      payment_amount,
      billing_period,
      billing_reason,
      currency
    } = body || {};

    if (!referred_user_id || !invoice_id || payment_amount === undefined) {
      return Response.json({
        error: 'referred_user_id, invoice_id, and payment_amount are required'
      }, { status: 400 });
    }

    const sr = base44.asServiceRole;

    // ── 1. Load commission configuration ──
    const configs = await sr.entities.ReferralCommissionConfiguration.filter({ is_active: true });
    if (configs.length === 0) {
      return Response.json({ success: false, message: 'No active commission configuration' });
    }
    const config = configs[0];

    if (!config.commission_enabled) {
      return Response.json({ success: false, message: 'Commission program is disabled' });
    }

    // ── 2. Find referral attribution ──
    const attributions = await sr.entities.ReferralAttribution.filter({ referred_user_id });
    if (attributions.length === 0) {
      return Response.json({ success: false, message: 'No referral attribution found for this user' });
    }
    const attribution = attributions[0];

    // ── 3. Fraud check ──
    if (attribution.fraud_flag) {
      return Response.json({ success: false, message: 'Attribution is fraud-flagged — commission blocked' });
    }

    // ── 4. Billing period eligibility ──
    const eligiblePeriods = config.eligible_billing_periods;
    if (eligiblePeriods !== 'both' && eligiblePeriods !== billing_period) {
      return Response.json({
        success: false,
        message: `Billing period '${billing_period}' is not eligible (config: '${eligiblePeriods}')`
      });
    }

    // ── 5. Commission start rule ──
    const startsAfter = config.commission_starts_after || 'first_payment';
    if (startsAfter === 'trial_end' && billing_reason === 'subscription_create') {
      return Response.json({ success: false, message: 'Commission starts after trial end — skipping first invoice' });
    }

    // ── 6. Minimum payment threshold ──
    const minThreshold = config.minimum_payment_threshold;
    if (minThreshold !== undefined && minThreshold !== null && payment_amount < minThreshold) {
      return Response.json({
        success: false,
        message: `Payment amount ${payment_amount} below minimum threshold ${minThreshold}`
      });
    }

    // ── 7. Idempotency: same invoice must not generate commission twice ──
    const existingForInvoice = await sr.entities.RewardLedger.filter({
      payment_reference: invoice_id,
      event_type: 'subscription_commission'
    });
    if (existingForInvoice.length > 0) {
      return Response.json({
        success: true,
        message: 'Commission already processed for this invoice',
        reward: existingForInvoice[0]
      });
    }

    // ── 8. Count existing commission cycles for duration tracking ──
    const existingCommissions = await sr.entities.RewardLedger.filter({
      referral_attribution_id: attribution.id,
      event_type: 'subscription_commission'
    });
    const cycleNumber = existingCommissions.length + 1;

    // ── 9. Duration expiry check ──
    if (config.duration_type === 'fixed_months' && cycleNumber > (config.duration_months || 12)) {
      return Response.json({
        success: false,
        message: `Commission duration expired — ${cycleNumber - 1} cycles already rewarded (max: ${config.duration_months})`
      });
    }

    // ── 10. Calculate commission amount ──
    let commissionAmount = 0;
    let commissionRate = 0;

    if (config.commission_type === 'percentage') {
      commissionRate = config.commission_percentage || 0;
      commissionAmount = Number((payment_amount * commissionRate / 100).toFixed(2));
    } else {
      commissionRate = config.commission_fixed_amount || 0;
      commissionAmount = Number(commissionRate.toFixed(2));
    }

    if (commissionAmount <= 0) {
      return Response.json({ success: false, message: 'Calculated commission amount is zero' });
    }

    // ── 11. Commission cap check ──
    const cap = config.max_commission_cap;
    if (cap !== undefined && cap !== null && cap > 0) {
      const totalPaid = existingCommissions
        .filter(r => r.status !== 'rejected')
        .reduce((sum, r) => sum + (r.amount || 0), 0);
      if (totalPaid + commissionAmount > cap) {
        commissionAmount = Number(Math.max(0, cap - totalPaid).toFixed(2));
        if (commissionAmount <= 0) {
          return Response.json({
            success: false,
            message: `Commission cap of ${cap} already reached for this referred user`
          });
        }
      }
    }

    // ── 12. Require active subscription check ──
    if (config.require_active_subscription) {
      const subs = await sr.entities.UserSubscription.filter({ owner_user_id: referred_user_id });
      const hasActive = subs.some(s => s.status === 'active');
      if (!hasActive) {
        return Response.json({ success: false, message: 'Referred user does not have an active paid subscription' });
      }
    }

    // ── 13. Create reward ledger entry (append-only) ──
    const timestamp = new Date().toISOString();
    const reward = await sr.entities.RewardLedger.create({
      user_id: attribution.referrer_user_id,
      referral_attribution_id: attribution.id,
      referred_user_id,
      event_type: 'subscription_commission',
      reward_type: 'cash_payout',
      amount: commissionAmount,
      status: 'pending',
      source: 'processCommissionReward',
      subscription_id: subscription_id || null,
      payment_reference: invoice_id,
      billing_period: billing_period || null,
      payment_amount: payment_amount,
      commission_type: config.commission_type,
      commission_rate: commissionRate,
      commission_cycle_number: cycleNumber,
      commission_duration_rule: config.duration_type,
      audit_metadata: {
        trigger: 'subscription_commission',
        trigger_source: body?.trigger_source || 'stripe_webhook',
        event_source: 'processCommissionReward',
        actor,
        timestamp,
        currency: currency || 'gbp',
        billing_reason: billing_reason || null,
        config_snapshot: {
          commission_type: config.commission_type,
          commission_rate: commissionRate,
          duration_type: config.duration_type,
          duration_months: config.duration_months,
          eligible_billing_periods: config.eligible_billing_periods,
          commission_starts_after: config.commission_starts_after,
          max_commission_cap: config.max_commission_cap,
          minimum_payment_threshold: config.minimum_payment_threshold
        }
      }
    });

    return Response.json({
      success: true,
      reward,
      cycle_number: cycleNumber,
      commission_amount: commissionAmount
    });
  } catch (error) {
    console.error('[processCommissionReward] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});