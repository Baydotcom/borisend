import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'super_admin'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const sr = base44.asServiceRole;

    // ── Validation ──
    const errors = [];

    const commissionType = body?.commission_type;
    if (commissionType && !['percentage', 'fixed_amount'].includes(commissionType)) {
      errors.push('commission_type must be "percentage" or "fixed_amount"');
    }

    if (commissionType === 'percentage') {
      const pct = body?.commission_percentage;
      if (pct === undefined || pct === null || pct < 0 || pct > 100) {
        errors.push('commission_percentage must be between 0 and 100 when type is percentage');
      }
    }

    if (commissionType === 'fixed_amount') {
      const amt = body?.commission_fixed_amount;
      if (amt === undefined || amt === null || amt < 0) {
        errors.push('commission_fixed_amount must be a non-negative number when type is fixed_amount');
      }
    }

    const durationType = body?.duration_type;
    if (durationType && !['fixed_months', 'lifetime'].includes(durationType)) {
      errors.push('duration_type must be "fixed_months" or "lifetime"');
    }

    if (durationType === 'fixed_months') {
      const dm = body?.duration_months;
      if (dm === undefined || dm === null || dm < 1 || !Number.isInteger(dm)) {
        errors.push('duration_months must be a positive integer when duration_type is fixed_months');
      }
    }

    const eligiblePeriods = body?.eligible_billing_periods;
    if (eligiblePeriods && !['monthly', 'yearly', 'both'].includes(eligiblePeriods)) {
      errors.push('eligible_billing_periods must be "monthly", "yearly", or "both"');
    }

    const startsAfter = body?.commission_starts_after;
    if (startsAfter && !['first_payment', 'trial_end', 'subscription_activation'].includes(startsAfter)) {
      errors.push('commission_starts_after must be "first_payment", "trial_end", or "subscription_activation"');
    }

    if (body?.max_commission_cap !== undefined && body?.max_commission_cap !== null && body?.max_commission_cap < 0) {
      errors.push('max_commission_cap must be a non-negative number or null');
    }

    if (body?.minimum_payment_threshold !== undefined && body?.minimum_payment_threshold !== null && body?.minimum_payment_threshold < 0) {
      errors.push('minimum_payment_threshold must be a non-negative number or null');
    }

    if (errors.length > 0) {
      return Response.json({ error: 'Validation failed', validation_errors: errors }, { status: 400 });
    }

    // ── Load or create config ──
    const existing = await sr.entities.ReferralCommissionConfiguration.filter({ is_active: true });
    const updateFields = {
      commission_enabled: body.commission_enabled,
      commission_type: body.commission_type,
      commission_percentage: body.commission_percentage,
      commission_fixed_amount: body.commission_fixed_amount,
      duration_type: body.duration_type,
      duration_months: body.duration_months,
      eligible_billing_periods: body.eligible_billing_periods,
      require_active_subscription: body.require_active_subscription,
      commission_starts_after: body.commission_starts_after,
      max_commission_cap: body.max_commission_cap,
      minimum_payment_threshold: body.minimum_payment_threshold,
      is_active: body.is_active !== undefined ? body.is_active : true,
      updated_by: user.id
    };

    // Remove undefined fields
    Object.keys(updateFields).forEach(k => updateFields[k] === undefined && delete updateFields[k]);

    let config;
    if (existing.length > 0) {
      config = await sr.entities.ReferralCommissionConfiguration.update(existing[0].id, updateFields);
    } else {
      config = await sr.entities.ReferralCommissionConfiguration.create({
        commission_enabled: false,
        commission_type: 'percentage',
        commission_percentage: 10,
        commission_fixed_amount: 0,
        duration_type: 'fixed_months',
        duration_months: 12,
        eligible_billing_periods: 'both',
        require_active_subscription: true,
        commission_starts_after: 'first_payment',
        is_active: true,
        updated_by: user.id,
        ...updateFields
      });
    }

    return Response.json({ success: true, config });
  } catch (error) {
    console.error('[adminUpdateCommissionConfig] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});