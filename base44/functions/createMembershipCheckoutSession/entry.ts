import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';
import { checkMobileBillingBlocked } from '../../shared/mobileBillingGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const mobileBlocked = checkMobileBillingBlocked(body);
    if (mobileBlocked) return mobileBlocked;
    const { membership_config_id, billing_interval } = body;

    // Resolve config: explicit id or the single active BoriSend 2.0 membership.
    let config = null;
    if (membership_config_id) {
      config = await base44.asServiceRole.entities.MembershipConfiguration.get(membership_config_id).catch(() => null);
    } else {
      const all = await base44.asServiceRole.entities.MembershipConfiguration.list('display_order', 50);
      config = all.find(c => c.is_active) || all[0] || null;
    }
    if (!config) {
      return Response.json({ error: 'Membership is not configured yet. Please contact support.' }, { status: 400 });
    }
    if (!config.is_active) {
      return Response.json({ error: 'Membership is not available.' }, { status: 400 });
    }

    const interval = billing_interval === 'yearly' ? 'yearly' : 'monthly';
    const priceId = interval === 'yearly' ? config.annual_stripe_price_id : config.monthly_stripe_price_id;
    if (!priceId) {
      return Response.json({ error: 'Membership pricing is not configured yet. Please contact support.' }, { status: 400 });
    }

    // Membership checkout must always be attributed to an authenticated BoriSend account.
    // Never create a Stripe membership session without the authoritative Base44 user ID.
    const user = await base44.auth.me().catch(() => null);
    if (!user?.id) {
      return Response.json({ error: 'Please sign in to your BoriSend account before starting membership checkout.' }, { status: 401 });
    }
    const userId = user.id;

    const PRODUCTION_URL = 'https://app.borisend.macpeniel.com';
    const baseUrl = req.headers.get('origin') || PRODUCTION_URL;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/subscription?status=success`,
      cancel_url: `${baseUrl}/subscription?status=cancelled`,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        product_type: 'membership',
        membership_config_id: config.id,
        stripe_price_id: priceId,
        user_id: userId,
        billing_interval: interval,
      },
      client_reference_id: userId,
      subscription_data: {
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          product_type: 'membership',
          membership_config_id: config.id,
          user_id: userId,
        },
      },
    });
    return Response.json({ url: session.url });
  } catch (error) {
    console.error('[createMembershipCheckoutSession] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});