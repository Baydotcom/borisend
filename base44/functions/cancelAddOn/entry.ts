import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { add_on_subscription_id } = body;
    if (!add_on_subscription_id) {
      return Response.json({ error: 'add_on_subscription_id is required' }, { status: 400 });
    }
    const sr = base44.asServiceRole;

    let ao;
    try {
      ao = await sr.entities.AddOnSubscription.get(add_on_subscription_id);
    } catch (_) {
      return Response.json({ error: 'Add-on not found' }, { status: 404 });
    }
    if (ao.owner_user_id !== user.id) {
      return Response.json({ error: 'Forbidden: you do not own this add-on' }, { status: 403 });
    }

    // Cancel at period end via Stripe (authoritative billing source). Capacity
    // remains effective until the end of the already-paid period (RC12 §13).
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    if (ao.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(ao.stripe_subscription_id, { cancel_at_period_end: true });
      } catch (e) {
        console.error('[cancelAddOn] Stripe update failed:', e.message);
      }
    }
    await sr.entities.AddOnSubscription.update(ao.id, {
      status: 'cancel_at_period_end',
      cancel_at_period_end: true,
      cancelled_at: new Date().toISOString(),
    });
    return Response.json({ success: true, status: 'cancel_at_period_end' });
  } catch (error) {
    console.error('[cancelAddOn] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});