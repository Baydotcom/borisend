import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';
import { checkMobileBillingBlocked } from '../../shared/mobileBillingGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const mobileBlocked = checkMobileBillingBlocked(body);
    if (mobileBlocked) return mobileBlocked;
    const { plan_id, billing_interval } = body;

    if (!plan_id) {
      return Response.json({ error: "plan_id is required" }, { status: 400 });
    }

    const plan = await base44.asServiceRole.entities.SubscriptionPlan.get(plan_id);
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    // Free plan — no checkout required
    if (plan.price === 0) {
      return Response.json({
        no_checkout_required: true,
        message: "This is a free plan. No checkout is required.",
        plan_name: plan.name,
      });
    }

    // Determine which Stripe Price ID to use based on billing interval
    const interval = billing_interval === "yearly" ? "yearly" : "monthly";
    const priceId = interval === "yearly"
      ? (plan.stripe_price_id_annual || plan.stripe_price_id)
      : (plan.stripe_price_id_monthly || plan.stripe_price_id);

    if (!priceId) {
      return Response.json({ error: "This plan is not configured for checkout" }, { status: 400 });
    }

    // Get user ID if authenticated (public app — may not be logged in)
    let userId = null;
    try {
      const user = await base44.auth.me();
      if (user) userId = user.id;
    } catch (e) {
      console.info("[CHECKOUT] User not authenticated (public app):", e.message);
    }

    // Use production URL for redirects; fall back to request origin for dev/preview
    const PRODUCTION_URL = "https://app.borisend.macpeniel.com";
    const baseUrl = req.headers.get("origin") || PRODUCTION_URL;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/subscription?status=success`,
      cancel_url: `${baseUrl}/subscription?status=cancelled`,
      metadata: {
        base44_app_id: Deno.env.get("BASE44_APP_ID"),
        plan_id: plan_id,
        user_id: userId || "",
        billing_interval: interval,
      },
      client_reference_id: userId || undefined,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});