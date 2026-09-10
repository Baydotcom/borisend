import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'super_admin'].includes(user.role)) return Response.json({ error: 'Admin access required' }, { status: 403 });

    const sr = base44.asServiceRole;
    const body = await req.json();
    const { action, target_user_id, config_updates, extension_days, reason } = body;

    // ── Config updates ──
    if (action === 'update_config') {
      const configs = await sr.entities.TrialConfiguration.filter({ is_active: true });
      if (configs.length === 0) return Response.json({ error: 'No active trial configuration' }, { status: 404 });
      const updated = await sr.entities.TrialConfiguration.update(configs[0].id, {
        ...config_updates,
        updated_by: user.id,
      });
      await sr.entities.TrialAuditLog.create({
        user_id: user.id,
        action: 'admin_override',
        actor: user.id,
        details: `Admin updated trial configuration: ${JSON.stringify(config_updates)}`,
      });
      return Response.json({ success: true, config: updated });
    }

    // ── Get config ──
    if (action === 'get_config') {
      const configs = await sr.entities.TrialConfiguration.filter({ is_active: true });
      return Response.json({ config: configs[0] || null });
    }

    // ── Get trial stats ──
    if (action === 'get_stats') {
      const allSubs = await sr.entities.UserSubscription.list("-created_date", 500);
      const activeTrials = allSubs.filter(s => s.trial_status === 'active' || s.trial_status === 'payment_method_added' || s.trial_status === 'conversion_scheduled');
      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      const endingToday = activeTrials.filter(s => s.trial_ends_at && new Date(s.trial_ends_at) <= todayEnd && new Date(s.trial_ends_at) >= now);
      const paymentMethodsAdded = allSubs.filter(s => s.trial_status === 'payment_method_added' || s.trial_status === 'conversion_scheduled');
      const conversionsScheduled = allSubs.filter(s => s.trial_conversion_scheduled === true);
      const converted = allSubs.filter(s => s.trial_status === 'converted');
      const expired = allSubs.filter(s => s.trial_status === 'expired');
      const paused = allSubs.filter(s => s.status === 'paused');

      const monthlyCount = allSubs.filter(s => s.trial_billing_interval === 'monthly').length;
      const yearlyCount = allSubs.filter(s => s.trial_billing_interval === 'yearly').length;
      const conversionRate = activeTrials.length > 0
        ? Math.round((converted.length / (converted.length + expired.length)) * 100) || 0
        : 0;

      return Response.json({
        active_trials: activeTrials.length,
        trials_ending_today: endingToday.length,
        payment_methods_added: paymentMethodsAdded.length,
        conversions_scheduled: conversionsScheduled.length,
        converted: converted.length,
        expired: expired.length,
        paused: paused.length,
        conversion_rate: conversionRate,
        monthly_selections: monthlyCount,
        yearly_selections: yearlyCount,
        trials: activeTrials.map(s => ({
          id: s.id,
          user_id: s.owner_user_id,
          trial_status: s.trial_status,
          trial_started_at: s.trial_started_at,
          trial_ends_at: s.trial_ends_at,
          trial_offer_name: s.trial_offer_name,
          trial_billing_interval: s.trial_billing_interval,
          trial_conversion_scheduled: s.trial_conversion_scheduled,
          trial_extension_count: s.trial_extension_count || 0,
        })),
      });
    }

    // ── Extend a trial ──
    if (action === 'extend_trial') {
      if (!target_user_id) return Response.json({ error: 'target_user_id is required' }, { status: 400 });
      const configs = await sr.entities.TrialConfiguration.filter({ is_active: true });
      const config = configs[0];
      if (config && !config.allow_admin_extension) {
        return Response.json({ error: 'Admin extension is not allowed' }, { status: 403 });
      }
      const maxExt = config?.max_extension_days || 7;
      const extDays = Math.min(extension_days || 7, maxExt);

      const targetSubs = await sr.entities.UserSubscription.filter({ owner_user_id: target_user_id });
      const targetSub = targetSubs[0];
      if (!targetSub) return Response.json({ error: 'User subscription not found' }, { status: 404 });
      if (targetSub.trial_status === 'expired' || targetSub.trial_status === 'converted') {
        return Response.json({ error: `Cannot extend a ${targetSub.trial_status} trial` }, { status: 400 });
      }

      const currentEnd = targetSub.trial_ends_at ? new Date(targetSub.trial_ends_at) : new Date();
      const newEnd = new Date(currentEnd.getTime() + extDays * 24 * 60 * 60 * 1000);

      // If conversion was scheduled, we need to update the Stripe subscription's trial_end
      if (targetSub.trial_conversion_scheduled && targetSub.stripe_subscription_id) {
        try {
          const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
          await stripe.subscriptions.update(targetSub.stripe_subscription_id, {
            trial_end: Math.floor(newEnd.getTime() / 1000),
          });
        } catch (stripeErr) {
          console.error('[adminTrialAction] Stripe update failed:', stripeErr.message);
        }
      }

      await sr.entities.UserSubscription.update(targetSub.id, {
        trial_ends_at: newEnd.toISOString(),
        current_period_end: newEnd.toISOString(),
        trial_extension_count: (targetSub.trial_extension_count || 0) + 1,
      });

      await sr.entities.TrialAuditLog.create({
        user_id: target_user_id,
        action: 'trial_extended',
        actor: user.id,
        details: `Admin extended trial by ${extDays} days. Reason: ${reason || 'not specified'}. New end: ${newEnd.toISOString()}`,
        previous_value: targetSub.trial_ends_at,
        new_value: newEnd.toISOString(),
      });

      try { await base44.analytics.track({ eventName: 'trial_extended', properties: { days: extDays } }); } catch (_) {}

      return Response.json({ success: true, new_trial_ends_at: newEnd.toISOString() });
    }

    // ── Revoke a trial ──
    if (action === 'revoke_trial') {
      if (!target_user_id) return Response.json({ error: 'target_user_id is required' }, { status: 400 });
      const targetSubs = await sr.entities.UserSubscription.filter({ owner_user_id: target_user_id });
      const targetSub = targetSubs[0];
      if (!targetSub) return Response.json({ error: 'User subscription not found' }, { status: 404 });

      // Cancel any scheduled Stripe subscription
      if (targetSub.trial_conversion_scheduled && targetSub.stripe_subscription_id) {
        try {
          const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
          await stripe.subscriptions.del(targetSub.stripe_subscription_id, { invoice_now: false, prorate: false });
        } catch (stripeErr) {
          console.error('[adminTrialAction] Stripe cancel failed:', stripeErr.message);
        }
      }

      const now = new Date();
      await sr.entities.UserSubscription.update(targetSub.id, {
        trial_status: 'revoked',
        status: 'paused',
        paused_at: now.toISOString(),
        pause_reason: 'trial_revoked_by_admin',
        trial_conversion_scheduled: false,
        stripe_subscription_id: null,
      });

      await sr.entities.TrialAuditLog.create({
        user_id: target_user_id,
        action: 'trial_revoked',
        actor: user.id,
        details: `Admin revoked trial. Reason: ${reason || 'not specified'}`,
      });

      return Response.json({ success: true, message: 'Trial revoked' });
    }

    // ── Get audit history ──
    if (action === 'get_audit_history') {
      if (!target_user_id) return Response.json({ error: 'target_user_id is required' }, { status: 400 });
      const logs = await sr.entities.TrialAuditLog.filter({ user_id: target_user_id }, "-created_date", 50);
      return Response.json({ logs });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[adminTrialAction] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});