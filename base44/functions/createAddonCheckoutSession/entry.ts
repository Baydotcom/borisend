import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';
import { checkMobileBillingBlocked } from '../../shared/mobileBillingGuard.ts';
import { resolveMembership, getMonthlyEntitlementWindow } from '../../shared/entitlements/entitlement-service.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const mobileBlocked = checkMobileBillingBlocked(body);
    if (mobileBlocked) return mobileBlocked;
    const { add_on_product_id, billing_interval, purchase_mode } = body;
    // RC18.3.3 §6: 'current' = Buy More Now (immediate). 'next_period' = Renew
    // for Next Period (scheduled, effective at next monthly boundary).
    const mode = purchase_mode === 'next_period' ? 'next_period' : 'current';

    if (!add_on_product_id) {
      return Response.json({ error: 'add_on_product_id is required' }, { status: 400 });
    }
    const product = await base44.asServiceRole.entities.AddOnProduct.get(add_on_product_id);
    if (!product) {
      return Response.json({ error: 'Add-on product not found' }, { status: 404 });
    }
    if (!product.is_active) {
      return Response.json({ error: 'This add-on is not available.' }, { status: 400 });
    }

    const interval = (billing_interval === 'yearly' && product.supports_annual && product.annual_stripe_price_id) ? 'yearly' : 'monthly';
    const priceId = interval === 'yearly' ? product.annual_stripe_price_id : product.monthly_stripe_price_id;
    if (!priceId) {
      return Response.json({ error: 'This add-on is not configured for checkout.' }, { status: 400 });
    }

    // Public app — may not be authenticated.
    let userId = null;
    try {
      const user = await base44.auth.me();
      if (user) userId = user.id;
    } catch (e) {
      console.info('[ADDON_CHECKOUT] User not authenticated (public app):', e.message);
    }

    // ── RC16.8 §42: Server-side membership gate ──
    // Add-ons are NOT standalone products — they extend a Membership.
    // Trial, no-membership, and expired users are blocked from purchasing.
    if (!userId) {
      return Response.json({
        error: 'You must be signed in to purchase add-ons.',
        membership_required: true,
      }, { status: 403 });
    }

    const membership = await resolveMembership(base44.asServiceRole, userId);
    if (membership.status === 'trial') {
      return Response.json({
        error: 'Subscribe to BoriSend Membership to add more capacity.',
        membership_required: true,
        trial: true,
      }, { status: 403 });
    }
    if (membership.status === 'none') {
      return Response.json({
        error: 'Subscribe to BoriSend Membership to add more capacity.',
        membership_required: true,
      }, { status: 403 });
    }
    // Cancel-at-period-end but still in paid period: ALLOW (§40), but the
    // add-on period will be capped at the membership period end (handled in
    // the webhook). The add-on cannot outlive the membership it extends.

    // ── RC18.3.4: Resolve target period SERVER-SIDE for next_period renewals ──
    // The target_period_start is the next monthly entitlement boundary. This
    // is computed from the user's membership period anchor, NOT from the
    // purchase date. Frontend never supplies this value.
    let renewalIntentKey: string | null = null;
    let targetPeriodStart: string | null = null;
    if (mode === 'next_period') {
      // RC18.3.4.1: Use the canonical anchor-preserving window calculation.
      // windowEnd is the next monthly boundary, computed from the original
      // membership anchor — no JS Date overflow drift on month-end anchors.
      const { windowEnd: nextBoundary } = getMonthlyEntitlementWindow(membership.periodStart, new Date());
      targetPeriodStart = nextBoundary.toISOString();
      renewalIntentKey = `addon_renewal:${userId}:${product.id}:${targetPeriodStart}`;

      // RC18.3.3 §8 / RC18.3.4 §3: Prevent duplicate next-period renewal.
      // Check BOTH: an existing scheduled AddOnSubscription (paid) AND an
      // existing AddOnSubscription with the same renewal_intent_key (covers
      // the rare case where a concurrent webhook hasn't promoted status yet).
      const existingByKey = await base44.asServiceRole.entities.AddOnSubscription
        .filter({ owner_user_id: userId, add_on_product_id: product.id, status: 'scheduled' })
        .catch(() => []);
      const existingByKeyIntent = renewalIntentKey
        ? await base44.asServiceRole.entities.AddOnSubscription
            .filter({ owner_user_id: userId, renewal_intent_key: renewalIntentKey })
            .catch(() => [])
        : [];
      if ((existingByKey && existingByKey.length > 0) || (existingByKeyIntent && existingByKeyIntent.length > 0)) {
        return Response.json({
          error: 'You have already renewed this add-on for the next period.',
          already_renewed: true,
        }, { status: 409 });
      }
    }

    // RC16.7: one_period add-ons use one-time Stripe Checkout (mode: 'payment').
    // recurring add-ons use subscription checkout (mode: 'subscription').
    const isOnePeriod = product.billing_mode === 'one_period';
    const checkoutMode = isOnePeriod ? 'payment' : 'subscription';

    const PRODUCTION_URL = 'https://app.borisend.macpeniel.com';
    const baseUrl = req.headers.get('origin') || PRODUCTION_URL;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // ── RC18.3.4 §5: Stripe idempotency for renewal checkout ──
    // For next_period renewals, use the deterministic renewal_intent_key as
    // the Stripe idempotency key. This means concurrent checkout requests
    // (two browser tabs) return the SAME Checkout Session — eliminating the
    // race condition where two sessions are created and both paid.
    // For current (Buy More Now), no deterministic key — each purchase is a
    // distinct, stackable action.
    const idempotencyKey = mode === 'next_period' ? renewalIntentKey : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/subscription?status=success&addon=1`,
      cancel_url: `${baseUrl}/subscription?status=cancelled`,
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
        product_type: 'addon',
        add_on_product_id: product.id,
        entitlement_type: product.entitlement_type,
        quantity: String(product.quantity),
        user_id: userId || '',
        billing_interval: interval,
        addon_billing_mode: product.billing_mode,
        purchase_mode: mode,
        // RC18.3.4: Carry the server-computed renewal identity through to the
        // webhook so it can deduplicate at the payment-grant boundary.
        ...(renewalIntentKey ? { renewal_intent_key: renewalIntentKey, target_period_start: targetPeriodStart || '' } : {}),
      },
      client_reference_id: userId || undefined,
      ...(isOnePeriod ? {} : {
        subscription_data: {
          metadata: {
            base44_app_id: Deno.env.get('BASE44_APP_ID'),
            product_type: 'addon',
            add_on_product_id: product.id,
            entitlement_type: product.entitlement_type,
            quantity: String(product.quantity),
            user_id: userId || '',
          },
        },
      }),
    }, idempotencyKey ? { idempotencyKey } : undefined);
    return Response.json({ url: session.url });
  } catch (error) {
    console.error('[createAddonCheckoutSession] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});