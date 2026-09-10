import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;
    let subs = await sr.entities.UserSubscription.filter({ owner_user_id: user.id });
    if (!subs || subs.length === 0) {
      subs = await sr.entities.UserSubscription.filter({ created_by_id: user.id });
    }
    const sub = subs[0];
    if (!sub) return Response.json({ success: false });

    const now = new Date();
    await sr.entities.UserSubscription.update(sub.id, {
      trial_modal_last_shown_at: now.toISOString(),
    });

    await sr.entities.TrialAuditLog.create({
      user_id: user.id,
      action: 'modal_shown',
      actor: user.id,
      details: 'Final-day payment modal shown',
    });

    try { await base44.analytics.track({ eventName: 'trial_payment_modal_shown', properties: {} }); } catch (_) {}

    return Response.json({ success: true });
  } catch (error) {
    console.error('[recordTrialModalShown] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});