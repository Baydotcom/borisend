/**
 * ARCHIVED MAINTENANCE UTILITY — DO NOT EXECUTE IN PRODUCTION
 *
 * This function was used to migrate pre-launch Free-plan users to the
 * trial subscription model. Migration is complete (0 unmigrated users
 * as of 2026-07-25). The Free plan has been marked inactive.
 *
 * Retained for historical recovery only. The migration button has been
 * removed from the admin Trial Management UI to prevent accidental execution.
 *
 * To re-enable: add the migration button back to TrialManagement.jsx.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'super_admin'].includes(user.role)) return Response.json({ error: 'Admin access required' }, { status: 403 });

    const sr = base44.asServiceRole;
    const now = new Date();

    // ── 1. Load trial configuration ──
    const configs = await sr.entities.TrialConfiguration.filter({ is_active: true });
    const config = configs[0];
    if (!config || !config.trial_enabled) {
      return Response.json({ error: 'Trial system not configured or disabled' }, { status: 500 });
    }

    // ── 2. Get the trial plan ──
    let trialPlan = null;
    if (config.trial_plan_id) {
      try { trialPlan = await sr.entities.SubscriptionPlan.get(config.trial_plan_id); } catch (_) {}
    }
    if (!trialPlan) {
      const allPlans = await sr.entities.SubscriptionPlan.list("sort_order", 50);
      trialPlan = allPlans.find(p => p.name && p.name.toLowerCase() === 'starter');
    }
    if (!trialPlan) return Response.json({ error: 'Starter plan not found' }, { status: 500 });

    // ── 3. Get all users ──
    const allUsers = await sr.entities.User.list("-created_date", 500);

    let reviewed = 0;
    let migrated = 0;
    let excluded = 0;
    let alreadyPaid = 0;
    let alreadyTrialled = 0;
    const exclusionReasons = [];

    for (const u of allUsers) {
      reviewed++;
      try {
        // Exclude system/service accounts (no email or role-based exclusion)
        if (!u.email) {
          excluded++;
          exclusionReasons.push({ user_id: u.id, reason: 'no_email' });
          continue;
        }

        // Preserve admin access — don't force admins into trial
        // (admins can still have trials if they want, but we don't auto-migrate them)
        if (u.role === 'admin') {
          // Check if they already have a paid subscription
          const adminSubs = await sr.entities.UserSubscription.filter({ owner_user_id: u.id });
          if (adminSubs.length === 0 || (adminSubs[0].status !== 'active')) {
            // Give admins a trial too if they don't have a paid sub
            // But mark them as excluded from the migration report since they're admins
            excluded++;
            exclusionReasons.push({ user_id: u.id, reason: 'admin_account' });
            continue;
          }
          alreadyPaid++;
          continue;
        }

        // ── Check existing subscription ──
        const existingSubs = await sr.entities.UserSubscription.filter({ owner_user_id: u.id });
        const existing = existingSubs[0];

        // Don't change active paid subscriptions
        if (existing && existing.status === 'active' && existing.stripe_subscription_id) {
          alreadyPaid++;
          continue;
        }

        // Don't create a trial if they've already used one
        if (existing && existing.is_trial_eligible === false && existing.trial_status !== 'eligible') {
          alreadyTrialled++;
          continue;
        }

        // ── Create trial ──
        const trialEnds = new Date(now.getTime() + (config.trial_duration_days || 7) * 24 * 60 * 60 * 1000);

        const trialData = {
          owner_user_id: u.id,
          plan_id: trialPlan.id,
          plan_name: trialPlan.name,
          status: 'trial',
          monthly_limit: trialPlan.monthly_message_limit,
          max_campaigns: trialPlan.max_campaigns,
          messages_used_this_month: 0,
          current_period_start: now.toISOString(),
          current_period_end: trialEnds.toISOString(),
          last_reset_date: now.toISOString().split('T')[0],
          trial_started_at: now.toISOString(),
          trial_ends_at: trialEnds.toISOString(),
          trial_plan_id: trialPlan.id,
          trial_status: 'active',
          trial_offer_name: config.trial_offer_name || `${config.trial_duration_days}-Day ${trialPlan.name} Trial`,
          is_trial_eligible: false,
        };

        if (existing) {
          await sr.entities.UserSubscription.update(existing.id, trialData);
        } else {
          await sr.entities.UserSubscription.create(trialData);
        }

        await sr.entities.TrialAuditLog.create({
          user_id: u.id,
          action: 'migration_created_trial',
          actor: user.id,
          details: `Migrated from Free plan to ${config.trial_offer_name}. Trial ends ${trialEnds.toISOString()}.`,
          new_value: 'active',
        });

        migrated++;
      } catch (userErr) {
        console.error(`[MIGRATION] Error for user ${u.id}:`, userErr.message);
        excluded++;
        exclusionReasons.push({ user_id: u.id, reason: `error: ${userErr.message}` });
      }
    }

    // ── 4. Mark the Free plan as inactive ──
    const allPlans = await sr.entities.SubscriptionPlan.list("sort_order", 50);
    const freePlan = allPlans.find(p => p.name && p.name.toLowerCase() === 'free');
    if (freePlan && freePlan.is_active !== false) {
      await sr.entities.SubscriptionPlan.update(freePlan.id, { is_active: false });
    }

    const result = {
      success: true,
      timestamp: now.toISOString(),
      accounts_reviewed: reviewed,
      accounts_migrated: migrated,
      accounts_excluded: excluded,
      already_paid: alreadyPaid,
      already_trialled: alreadyTrialled,
      free_plan_retired: !!freePlan,
      exclusion_reasons: exclusionReasons.map(e => ({ reason: e.reason, count: exclusionReasons.filter(x => x.reason === e.reason).length }))
        .filter((v, i, a) => a.findIndex(t => t.reason === v.reason) === i),
    };
    console.info(`[MIGRATION] Done — ${JSON.stringify(result)}`);
    return Response.json(result);
  } catch (error) {
    console.error('[migrateFreeUsersToTrial] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});