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

    // Prefer the current BoriSend Membership record. Fall back to the legacy
    // UserSubscription record so existing customers retain portal access.
    const membershipSubs = await base44.asServiceRole.entities.MembershipSubscription
      .filter({ owner_user_id: user.id })
      .catch(() => []);
    const membershipSub = membershipSubs.find((s) => s.stripe_customer_id) || null;

    let stripeCustomerId = membershipSub?.stripe_customer_id || null;
    if (!stripeCustomerId) {
      const legacySubs = await base44.asServiceRole.entities.UserSubscription
        .filter({ owner_user_id: user.id })
        .catch(() => []);
      const legacySub = legacySubs.find((s) => s.stripe_customer_id) || null;
      stripeCustomerId = legacySub?.stripe_customer_id || null;
    }

    if (!stripeCustomerId) {
      return Response.json({ error: 'No Stripe billing account found' }, { status: 404 });
    }

    const origin = req.headers.get('origin') || 'https://app.borisend.macpeniel.com';
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/subscription`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Portal session error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});