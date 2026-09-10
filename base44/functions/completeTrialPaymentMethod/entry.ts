import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';
import { checkMobileBillingBlocked } from '../../shared/mobileBillingGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const mobileBlocked = checkMobileBillingBlocked(body);
    if (mobileBlocked) return mobileBlocked;
    const { setup_intent_id, billing_interval } = body;

    if (!setup_intent_id || !billing_interval) {
      return Response.json({ error: 'setup_intent_id and billing_interval are required' }, { status: 400 });
    }

    const sr = base44.asServiceRole;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // ── 1. Get subscription and validate trial ──
    let subs = await sr.entities.UserSubscription.filter({ owner_user_id: user.id });
    if (!subs || subs.length === 0) {
      subs = await sr.entities.UserSubscription.filter({ created_by_id: user.id });
    }
    const sub = subs[0];
    if (!sub) return Response.json({ error: 'No subscription found' }, { status: 404 });
    if (sub.trial_status !== 'active' && sub.trial_status !== 'payment_method_added') {
      return Response.json({ error: 'Trial is not active or conversion already scheduled' }, { status: 400 });
    }

    // ── 2. Retrieve the SetupIntent to confirm payment method ──
    const setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);
    if (setupIntent.status !== 'succeeded') {
      return Response.json({ error: 'Payment method setup was not completed successfully', setup_status: setupIntent.status }, { status: 400 });
    }
    if (!setupIntent.payment_method) {
      return Response.json({ error: 'No payment method attached to this SetupIntent' }, { status: 400 });
    }

    // Prefer the SetupIntent's customer (always valid) over the stored one (may be stale)
    const customerId = setupIntent.customer || sub.stripe_customer_id;
    if (!customerId) return Response.json({ error: 'No Stripe customer found' }, { status: 500 });

    // ── 3. Get the trial plan and validate Stripe Price ID ──
    let planRecord = null;
    if (sub.trial_plan_id) {
      try { planRecord = await sr.entities.SubscriptionPlan.get(sub.trial_plan_id); } catch (_) {}
    }
    if (!planRecord && sub.plan_id) {
      try { planRecord = await sr.entities.SubscriptionPlan.get(sub.plan_id); } catch (_) {}
    }
    if (!planRecord) return Response.json({ error: 'Trial plan not found' }, { status: 500 });

    const interval = billing_interval === 'yearly' ? 'yearly' : 'monthly';
    const priceId = interval === 'yearly'
      ? (planRecord.stripe_price_id_annual || planRecord.stripe_price_id)
      : (planRecord.stripe_price_id_monthly || planRecord.stripe_price_id);

    if (!priceId) {
      return Response.json({ error: `Starter plan is not configured for ${interval} billing` }, { status: 500 });
    }

    // ── 4. Attach payment method to customer as default ──
    await stripe.paymentMethods.attach(setupIntent.payment_method, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: setupIntent.payment_method },
    });

    // ── 5. Create Stripe subscription with trial_end (no immediate charge) ──
    const trialEndTimestamp = sub.trial_ends_at ? Math.floor(new Date(sub.trial_ends_at).getTime() / 1000) : undefined;

    // If trial has already expired, create subscription without trial (immediate charge)
    const trialAlreadyEnded = trialEndTimestamp && trialEndTimestamp < Math.floor(Date.now() / 1000);

    const subscriptionParams = {
      customer: customerId,
      items: [{ price: priceId, quantity: 1 }],
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        user_id: user.id,
        plan_id: planRecord.id,
        billing_interval: interval,
        trial_conversion: 'true',
      },
      payment_behavior: 'default',
    };

    if (!trialAlreadyEnded && trialEndTimestamp) {
      subscriptionParams.trial_end = trialEndTimestamp;
    }

    const stripeSubscription = await stripe.subscriptions.create(subscriptionParams);

    // ── 6. Update UserSubscription ──
    const now = new Date();
    await sr.entities.UserSubscription.update(sub.id, {
      trial_status: 'conversion_scheduled',
      trial_billing_interval: interval,
      trial_payment_method_added_at: now.toISOString(),
      trial_conversion_scheduled: true,
      stripe_customer_id: customerId,
      stripe_subscription_id: stripeSubscription.id,
    });

    // ── 7. Audit log ──
    await sr.entities.TrialAuditLog.create({
      user_id: user.id,
      action: 'payment_method_added',
      actor: user.id,
      details: `Payment method added via SetupIntent ${setup_intent_id}. Billing interval: ${interval}. Subscription ${stripeSubscription.id} scheduled with trial_end.`,
    });
    await sr.entities.TrialAuditLog.create({
      user_id: user.id,
      action: 'conversion_scheduled',
      actor: user.id,
      details: `Conversion scheduled for ${sub.trial_ends_at}. ${interval} billing, price ${priceId}.`,
    });

    // ── 8. Analytics ──
    try {
      await base44.analytics.track({ eventName: 'trial_payment_method_added', properties: { billing_interval: interval } });
      await base44.analytics.track({ eventName: 'trial_conversion_scheduled', properties: { billing_interval: interval } });
    } catch (_) {}

    // ── 9. Notification ──
    const chargeAmount = interval === 'yearly'
      ? (planRecord.annual_price || planRecord.price * 12)
      : planRecord.price;
    const currency = planRecord.currency || 'GBP';
    await sr.entities.Notification.create({
      title: 'Payment method added',
      body: `Your ${planRecord.name} subscription will begin automatically on ${new Date(sub.trial_ends_at).toLocaleDateString()}. You will be charged ${currency === 'GBP' ? '£' : ''}${chargeAmount}${interval === 'yearly' ? '/yr' : '/mo'} unless you cancel before then.`,
      type: 'message_ready',
      priority: 'medium',
      created_by_id: user.id,
    });

    return Response.json({
      success: true,
      message: 'Payment method added and conversion scheduled',
      subscription_id: stripeSubscription.id,
      trial_ends_at: sub.trial_ends_at,
      billing_interval: interval,
      charge_amount: chargeAmount,
      currency,
    });
  } catch (error) {
    console.error('[completeTrialPaymentMethod] Error:', error.message);
    return Response.json({ error: error.message, conversion_failed: true }, { status: 500 });
  }
});