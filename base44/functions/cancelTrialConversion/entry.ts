import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;

    // ── 1. Get subscription ──
    let subs = await sr.entities.UserSubscription.filter({ owner_user_id: user.id });
    if (!subs || subs.length === 0) {
      subs = await sr.entities.UserSubscription.filter({ created_by_id: user.id });
    }
    const sub = subs[0];
    if (!sub) return Response.json({ error: 'No subscription found' }, { status: 404 });

    if (!sub.trial_conversion_scheduled) {
      return Response.json({ error: 'No scheduled conversion to cancel' }, { status: 400 });
    }

    // ── 2. Cancel the Stripe subscription (it's in trialing status — no charge) ──
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    if (sub.stripe_subscription_id) {
      try {
        await stripe.subscriptions.del(sub.stripe_subscription_id, {
          invoice_now: false,
          prorate: false,
        });
      } catch (stripeErr) {
        console.error('[cancelTrialConversion] Stripe error:', stripeErr.message);
        // Continue — we still need to update our records
      }
    }

    // ── 3. Update UserSubscription ──
    const now = new Date();
    await sr.entities.UserSubscription.update(sub.id, {
      trial_conversion_scheduled: false,
      trial_conversion_cancelled_at: now.toISOString(),
      trial_status: 'active',
      // Keep trial active until original expiry
      // Clear the stripe subscription ID since we cancelled it
      stripe_subscription_id: null,
    });

    // ── 4. Audit log ──
    await sr.entities.TrialAuditLog.create({
      user_id: user.id,
      action: 'conversion_cancelled',
      actor: user.id,
      details: `Scheduled conversion cancelled. Trial remains active until ${sub.trial_ends_at}. No subscription charge will occur.`,
    });

    // ── 5. Analytics ──
    try {
      await base44.analytics.track({ eventName: 'trial_conversion_cancelled', properties: {} });
    } catch (_) {}

    // ── 6. Notification ──
    await sr.entities.Notification.create({
      title: 'Conversion cancelled',
      body: `Your scheduled subscription has been cancelled. Your trial remains active until ${new Date(sub.trial_ends_at).toLocaleDateString()}. No charge will occur.`,
      type: 'campaign_paused',
      priority: 'medium',
      created_by_id: user.id,
    });

    return Response.json({
      success: true,
      message: 'Scheduled conversion cancelled. Your trial remains active until its original expiry.',
      trial_ends_at: sub.trial_ends_at,
    });
  } catch (error) {
    console.error('[cancelTrialConversion] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});