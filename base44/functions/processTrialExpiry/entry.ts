import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@17.3.1';
import { getUserTimezone, isSameDayInTimezone } from '../../shared/timezone.ts';
import { listAll } from '../../shared/pagination.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;
    const now = new Date();

    console.info(`[TRIAL_EXPIRY] Running at ${now.toISOString()}`);

    // ── 1. Find trials that have expired or are ending soon (server-side filtered) ──
    // RC9: previously loaded up to 500 subscriptions and filtered in memory,
    // silently dropping records beyond 500. Now we query only unprocessed
    // trials whose trial_ends_at falls within the relevant window, paginated
    // via listAll so records beyond 500 are never silently ignored.
    const soonEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const trialStatuses = ['active', 'payment_method_added', 'conversion_scheduled'];
    const allCandidates = await listAll(sr.entities.UserSubscription, {
      trial_status: { $in: trialStatuses },
      trial_ends_at: { $lte: soonEnd.toISOString() },
    }, '-trial_ends_at');

    const expiringTrials = allCandidates.filter(s =>
      s.trial_ends_at && new Date(s.trial_ends_at) <= now
    );

    console.info(`[TRIAL_EXPIRY] Found ${expiringTrials.length} expired/expiring trials (scanned ${allCandidates.length} candidates)`);

    let converted = 0;
    let paused = 0;
    let errors = 0;

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    for (const sub of expiringTrials) {
      try {
        // ── Idempotency: skip if already processed ──
        if (sub.trial_status === 'expired' || sub.trial_status === 'converted') {
          continue;
        }

        if (sub.trial_conversion_scheduled && sub.stripe_subscription_id) {
          // ── Case A: Conversion was scheduled — verify with Stripe ──
          try {
            const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);

            if (stripeSub.status === 'active') {
              // ── Subscription is active — first charge happened ──
              const planRecord = sub.plan_id ? await sr.entities.SubscriptionPlan.get(sub.plan_id).catch(() => null) : null;
              const periodEnd = new Date(stripeSub.current_period_end * 1000);
              const periodStart = new Date(stripeSub.current_period_start * 1000);

              await sr.entities.UserSubscription.update(sub.id, {
                trial_status: 'converted',
                trial_converted_at: now.toISOString(),
                status: 'active',
                current_period_start: periodStart.toISOString(),
                current_period_end: periodEnd.toISOString(),
              });

              await sr.entities.TrialAuditLog.create({
                user_id: sub.owner_user_id,
                action: 'trial_converted',
                actor: 'system',
                details: `Trial converted to active subscription ${stripeSub.id}.`,
              });

              try {
                await base44.analytics.track({ eventName: 'trial_converted', properties: { subscription_id: stripeSub.id } });
              } catch (_) {}

              await sr.entities.Notification.create({
                title: 'Subscription activated',
                body: `Your ${sub.plan_name || 'Starter'} subscription is now active. Enjoy BoriSend!`,
                type: 'message_sent',
                priority: 'medium',
                user_id: sub.owner_user_id,
                created_by_id: sub.owner_user_id,
              });

              converted++;
            } else if (stripeSub.status === 'trialing') {
              // ── Still trialing — trial_end hasn't passed on Stripe's side yet ──
              console.info(`[TRIAL_EXPIRY] Subscription ${stripeSub.id} still trialing — skipping`);
            } else if (stripeSub.status === 'canceled' || stripeSub.status === 'cancelled') {
              // ── User cancelled before conversion ──
              await sr.entities.UserSubscription.update(sub.id, {
                trial_status: 'expired',
                trial_expired_at: now.toISOString(),
                status: 'paused',
                paused_at: now.toISOString(),
                pause_reason: 'trial_expired_conversion_cancelled',
                trial_conversion_scheduled: false,
              });

              await sr.entities.TrialAuditLog.create({
                user_id: sub.owner_user_id,
                action: 'trial_expired',
                actor: 'system',
                details: 'Trial expired — conversion was cancelled by user. Account paused.',
              });

              await createPausedNotification(sr, sub.owner_user_id);
              paused++;
            } else {
              // ── Unexpected status — pause to be safe ──
              await sr.entities.UserSubscription.update(sub.id, {
                trial_status: 'expired',
                trial_expired_at: now.toISOString(),
                status: 'paused',
                paused_at: now.toISOString(),
                pause_reason: `trial_expired_stripe_status_${stripeSub.status}`,
              });
              await createPausedNotification(sr, sub.owner_user_id);
              paused++;
            }
          } catch (stripeErr) {
            console.error(`[TRIAL_EXPIRY] Stripe retrieve failed for sub ${sub.id}:`, stripeErr.message);
            await sr.entities.UserSubscription.update(sub.id, {
              trial_status: 'expired',
              trial_expired_at: now.toISOString(),
              status: 'paused',
              paused_at: now.toISOString(),
              pause_reason: 'trial_expired_stripe_unreachable',
            });
            await createPausedNotification(sr, sub.owner_user_id);
            paused++;
            errors++;
          }
        } else {
          // ── Case B: No payment method added — pause the account ──
          await sr.entities.UserSubscription.update(sub.id, {
            trial_status: 'expired',
            trial_expired_at: now.toISOString(),
            status: 'paused',
            paused_at: now.toISOString(),
            pause_reason: 'trial_expired_no_payment_method',
          });

          await sr.entities.TrialAuditLog.create({
            user_id: sub.owner_user_id,
            action: 'trial_expired',
            actor: 'system',
            details: 'Trial expired — no payment method added. Account paused.',
          });

          await sr.entities.TrialAuditLog.create({
            user_id: sub.owner_user_id,
            action: 'trial_paused',
            actor: 'system',
            details: 'Account entered Paused Mode after trial expiry.',
          });

          try {
            await base44.analytics.track({ eventName: 'trial_expired', properties: {} });
            await base44.analytics.track({ eventName: 'trial_paused', properties: { reason: 'no_payment_method' } });
          } catch (_) {}

          await createPausedNotification(sr, sub.owner_user_id);
          paused++;
        }
      } catch (subError) {
        console.error(`[TRIAL_EXPIRY] Error processing sub ${sub.id}:`, subError.message);
        errors++;
      }
    }

    // ── 2. Send final-day reminders (timezone-aware) ──
    // soonEnd and allCandidates computed above (single paginated query).
    const possiblyEndingToday = allCandidates.filter(s =>
      (s.trial_status === 'active') &&
      s.trial_ends_at &&
      new Date(s.trial_ends_at) >= now &&
      new Date(s.trial_ends_at) <= soonEnd
    );

    let remindersSent = 0;
    for (const sub of possiblyEndingToday) {
      try {
        // Check if we already sent a reminder today
        const lastReminder = sub.trial_last_reminder_at ? new Date(sub.trial_last_reminder_at) : null;
        if (lastReminder && lastReminder.toDateString() === now.toDateString()) {
          continue;
        }

        // Get user's timezone for precise "ending today" check
        const users = await sr.entities.User.filter({ id: sub.owner_user_id });
        const userTimezone = getUserTimezone(users[0]);
        const trialEndsAt = new Date(sub.trial_ends_at);

        // Check if trial ends "today" in the user's timezone
        const isLastDay = isSameDayInTimezone(now, trialEndsAt, userTimezone);
        if (!isLastDay) continue;

        await sr.entities.Notification.create({
          title: 'Your BoriSend trial ends today',
          body: 'Your BoriSend trial ends today. Your account and saved information will remain available if your membership is not active after the trial.',
          type: 'quota_warning',
          priority: 'high',
          action_label: 'View Membership Status',
          action_url: '/subscription',
          user_id: sub.owner_user_id,
          created_by_id: sub.owner_user_id,
        });

        await sr.entities.UserSubscription.update(sub.id, {
          trial_last_reminder_at: now.toISOString(),
        });
        remindersSent++;
      } catch (remErr) {
        console.error(`[TRIAL_EXPIRY] Reminder error for sub ${sub.id}:`, remErr.message);
      }
    }

    const result = {
      success: true,
      timestamp: now.toISOString(),
      expired_trials_found: expiringTrials.length,
      converted,
      paused,
      reminders_sent: remindersSent,
      errors,
    };
    console.info(`[TRIAL_EXPIRY] Done — ${JSON.stringify(result)}`);
    return Response.json(result);
  } catch (error) {
    console.error('[TRIAL_EXPIRY] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function createPausedNotification(sr, userId) {
  await sr.entities.Notification.create({
    title: 'Your trial has ended',
    body: 'Your BoriSend trial has ended. Your account and saved information remain available. Paid features require an active membership.',
    type: 'subscription_expired',
    priority: 'high',
    action_label: 'View Membership Status',
    action_url: '/subscription',
    user_id: userId,
    created_by_id: userId,
  });
}