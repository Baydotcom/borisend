import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';
import { checkMobileBillingBlocked } from '../../shared/mobileBillingGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mobileBlocked = checkMobileBillingBlocked(body);
    if (mobileBlocked) return mobileBlocked;

    const sr = base44.asServiceRole;

    // ── 1. Validate trial is active ──
    let subs = await sr.entities.UserSubscription.filter({ owner_user_id: user.id });
    if (!subs || subs.length === 0) {
      subs = await sr.entities.UserSubscription.filter({ created_by_id: user.id });
    }
    const sub = subs[0];
    if (!sub) return Response.json({ error: 'No subscription found' }, { status: 404 });
    if (sub.trial_status !== 'active' && sub.trial_status !== 'payment_method_added' && sub.trial_status !== 'conversion_scheduled') {
      return Response.json({ error: 'Trial is not active' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // ── 2. Create or reuse Stripe customer ──
    let customerId = sub.stripe_customer_id;
    let customerReused = true;
    if (!customerId) {
      customerReused = false;
    }

    if (!customerReused) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.full_name || undefined,
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          user_id: user.id,
        },
      });
      customerId = customer.id;
      await sr.entities.UserSubscription.update(sub.id, { stripe_customer_id: customerId });
    }

    // ── 3. Create SetupIntent (no charge) ──
    // Handle stale customer IDs gracefully — create a fresh customer if the stored one is invalid
    let setupIntent;
    try {
      setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          user_id: user.id,
          purpose: 'trial_payment_method',
        },
      });
    } catch (customerErr) {
      if (customerErr.message && customerErr.message.includes('No such customer')) {
        console.info('[createTrialSetupIntent] Stale customer ID — creating new customer');
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.full_name || undefined,
          metadata: {
            base44_app_id: Deno.env.get('BASE44_APP_ID'),
            user_id: user.id,
          },
        });
        customerId = customer.id;
        await sr.entities.UserSubscription.update(sub.id, { stripe_customer_id: customerId });
        setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          payment_method_types: ['card'],
          usage: 'off_session',
          metadata: {
            base44_app_id: Deno.env.get('BASE44_APP_ID'),
            user_id: user.id,
            purpose: 'trial_payment_method',
          },
        });
      } else {
        throw customerErr;
      }
    }

    return Response.json({
      client_secret: setupIntent.client_secret,
      customer_id: customerId,
      setup_intent_id: setupIntent.id,
      publishable_key: Deno.env.get('STRIPE_PUBLISHABLE_KEY'),
    });
  } catch (error) {
    console.error('[createTrialSetupIntent] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});