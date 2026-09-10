import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';

Deno.serve(async (req) => {
  let body = null;
  let base44 = null;

  try {
    body = await req.json();
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { plan_id, plan_data, sync_to_stripe = true } = body;

    if (!plan_data || !plan_data.name) {
      return Response.json({ error: 'plan_data with name is required' }, { status: 400 });
    }

    // Fetch existing plan to compare for pricing changes
    let existingPlan = null;
    if (plan_id) {
      try {
        existingPlan = await base44.asServiceRole.entities.SubscriptionPlan.get(plan_id);
      } catch {}
    }

    // Calculate annual price from monthly price + discount percentage
    const monthlyPrice = Number(plan_data.price) || 0;
    const discountPct = Number(plan_data.annual_discount_percentage) || 0;
    const supportsAnnual = plan_data.supports_annual !== false;
    const originalAnnual = monthlyPrice * 12;
    const annualPrice = supportsAnnual && discountPct > 0
      ? Math.round((originalAnnual * (1 - discountPct / 100)) * 100) / 100
      : null;

    // Determine if pricing-related fields changed (requires Stripe sync)
    const pricingChanged = !existingPlan ||
      existingPlan.price !== monthlyPrice ||
      existingPlan.annual_discount_percentage !== plan_data.annual_discount_percentage ||
      existingPlan.currency !== plan_data.currency ||
      existingPlan.supports_annual !== supportsAnnual;

    const shouldSync = sync_to_stripe && monthlyPrice > 0 && (pricingChanged || !existingPlan?.stripe_product_id);

    let stripeProductId = existingPlan?.stripe_product_id || plan_data.stripe_product_id || null;
    let stripePriceIdMonthly = existingPlan?.stripe_price_id_monthly || plan_data.stripe_price_id_monthly || null;
    let stripePriceIdAnnual = existingPlan?.stripe_price_id_annual || plan_data.stripe_price_id_annual || null;
    let oldPriceIdsToArchive = [];
    let syncedFields = [];

    if (shouldSync) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
      const currency = (plan_data.currency || 'GBP').toLowerCase();

      // ── Create or update Stripe Product ──
      if (stripeProductId) {
        await stripe.products.update(stripeProductId, {
          name: plan_data.name,
          description: plan_data.description || undefined,
        });
      } else {
        const product = await stripe.products.create({
          name: plan_data.name,
          description: plan_data.description || undefined,
          metadata: {
            base44_app_id: Deno.env.get('BASE44_APP_ID'),
            plan_name: plan_data.name,
          },
        });
        stripeProductId = product.id;
      }

      // ── Create monthly price (for all paid plans) ──
      if (pricingChanged || !stripePriceIdMonthly) {
        if (stripePriceIdMonthly) oldPriceIdsToArchive.push(stripePriceIdMonthly);
        const monthlyPriceObj = await stripe.prices.create({
          product: stripeProductId,
          unit_amount: Math.round(monthlyPrice * 100),
          currency,
          recurring: { interval: 'month' },
          metadata: {
            base44_app_id: Deno.env.get('BASE44_APP_ID'),
            plan_name: plan_data.name,
            billing_interval: 'monthly',
          },
        });
        stripePriceIdMonthly = monthlyPriceObj.id;
        syncedFields.push('monthly_price');
      }

      // ── Create annual price (if supported) ──
      if (supportsAnnual && annualPrice && annualPrice > 0) {
        if (pricingChanged || !stripePriceIdAnnual) {
          if (stripePriceIdAnnual) oldPriceIdsToArchive.push(stripePriceIdAnnual);
          const annualPriceObj = await stripe.prices.create({
            product: stripeProductId,
            unit_amount: Math.round(annualPrice * 100),
            currency,
            recurring: { interval: 'year' },
            metadata: {
              base44_app_id: Deno.env.get('BASE44_APP_ID'),
              plan_name: plan_data.name,
              billing_interval: 'yearly',
            },
          });
          stripePriceIdAnnual = annualPriceObj.id;
          syncedFields.push('annual_price');
        }
      }

      // ── Archive old prices ──
      for (const oldPriceId of oldPriceIdsToArchive) {
        try {
          await stripe.prices.update(oldPriceId, { active: false });
        } catch (e) {
          console.error(`[SYNC] Failed to archive old price ${oldPriceId}:`, e.message);
        }
      }
    }

    // ── Build data to save ──
    const dataToSave = {
      ...plan_data,
      price: monthlyPrice,
      monthly_message_limit: parseInt(plan_data.monthly_message_limit) || 0,
      max_campaigns: parseInt(plan_data.max_campaigns) || 1,
      sort_order: parseInt(plan_data.sort_order) || 0,
      features: Array.isArray(plan_data.features)
        ? plan_data.features
        : (typeof plan_data.features === 'string'
            ? plan_data.features.split('\n').filter((f) => f.trim())
            : []),
      annual_discount_percentage: discountPct,
      annual_price: annualPrice,
      supports_annual: supportsAnnual,
      stripe_product_id: stripeProductId,
      stripe_price_id_monthly: stripePriceIdMonthly,
      stripe_price_id_annual: stripePriceIdAnnual,
      stripe_price_id: stripePriceIdMonthly, // backward compat
      stripe_sync_status: shouldSync ? 'synced' : (existingPlan?.stripe_sync_status || 'not_synced'),
      stripe_sync_error: null,
      last_synced_at: shouldSync ? new Date().toISOString() : (existingPlan?.last_synced_at || null),
    };

    // ── Save to database ──
    let savedPlan;
    if (plan_id) {
      savedPlan = await base44.asServiceRole.entities.SubscriptionPlan.update(plan_id, dataToSave);
    } else {
      savedPlan = await base44.asServiceRole.entities.SubscriptionPlan.create(dataToSave);
    }

    // ── Record audit entry ──
    if (shouldSync && existingPlan) {
      try {
        await base44.asServiceRole.entities.StripeSyncAudit.create({
          plan_id: plan_id,
          plan_name: plan_data.name,
          previous_monthly_price: existingPlan.price,
          new_monthly_price: monthlyPrice,
          previous_annual_discount: existingPlan.annual_discount_percentage,
          new_annual_discount: discountPct,
          previous_stripe_price_id: existingPlan.stripe_price_id_monthly || '',
          new_stripe_price_id: stripePriceIdMonthly || '',
          admin_user_id: user.id,
          admin_user_email: user.email || '',
          status: 'success',
          stripe_environment: 'live',
          synced_fields: syncedFields,
        });
      } catch (auditErr) {
        console.error('[SYNC] Audit log failed:', auditErr.message);
      }
    }

    return Response.json({
      success: true,
      plan: savedPlan,
      stripe_product_id: stripeProductId,
      stripe_price_id_monthly: stripePriceIdMonthly,
      stripe_price_id_annual: stripePriceIdAnnual,
      archived_prices: oldPriceIdsToArchive,
      synced: shouldSync,
    });
  } catch (error) {
    console.error('[SYNC] Error:', error.message);

    // Record error on the plan
    if (base44 && body?.plan_id) {
      try {
        await base44.asServiceRole.entities.SubscriptionPlan.update(body.plan_id, {
          stripe_sync_status: 'error',
          stripe_sync_error: error.message,
        });
      } catch {}
    }

    return Response.json({ error: error.message }, { status: 500 });
  }
});