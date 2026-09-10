/**
 * RC18.3.3 §3/§4 + RC18.3.4 Part D/E — Add-on Expiry Reminder Scheduler
 *
 * Runs daily via a scheduled automation. Finds active one-period add-ons that
 * expire in exactly 5 days (REMINDER 1) or 1 day (REMINDER 2), and creates
 * idempotent in-app Notifications + best-effort native push notifications.
 *
 * RC18.3.4 HARDENING:
 *   Part D — Reminder suppression after renewal: if the add-on's product
 *            already has a scheduled next-period renewal, suppress the renewal-
 *            request reminder (no noise after successful renewal).
 *   Part E — Multi-product grouping: if multiple add-ons expire on the same
 *            date, send ONE grouped push notification instead of N separate
 *            pushes ("3 BoriSend add-ons expire on 1 October").
 *   Part D §13 — Multiple current add-ons of the same product: group reminders
 *            per product+period (not per AddOnSubscription row).
 *
 * IDEMPOTENCY: Each reminder uses a deterministic deduplication_key:
 *   addon_expiry:{owner_user_id}:{add_on_product_id}:{period_end_date}:{days_before}
 *   (RC18.3.4: keyed on product+period, not per AddOnSubscription row, so
 *   multiple current purchases of the same product produce ONE reminder.)
 *
 * NATIVE PUSH: Uses Core.SendPushNotification (server-side, asServiceRole).
 * Native delivery requires a native mobile build with push credentials —
 * real-device verification is outstanding. The in-app Notification is always
 * created (the reliable channel).
 *
 * NO LLM, NO SMS, NO customer charges.
 */
import { createClient } from 'npm:@base44/sdk@0.8.31';

const REMINDER_DAYS = [5, 1];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return 'soon'; }
}

function productLabel(qty: number, type: string): string {
  const map: Record<string, string> = {
    communication_plan_units: 'Communication Plans',
    recipient_units: 'Recipient Units',
    message_units: 'Generated Messages',
    smart_message_units: 'Smart Messages',
  };
  return `+${qty} ${map[type] || type}`;
}

function dateKey(iso: string): string {
  try { return new Date(iso).toISOString().split('T')[0]; } catch { return iso; }
}

Deno.serve(async () => {
  const base44 = createClient(Deno.env.get('BASE44_APP_ID'));
  const sr = base44.asServiceRole;
  const now = new Date();
  let remindersCreated = 0;
  let pushesAttempted = 0;
  let suppressedByRenewal = 0;
  const errors: string[] = [];

  try {
    // Fetch all active/cancel_at_period_end add-ons with a period end.
    const allAddons: any[] = [];
    for (const status of ['active', 'cancel_at_period_end', 'past_due']) {
      try {
        const batch = await sr.entities.AddOnSubscription.filter({ status });
        allAddons.push(...batch);
      } catch (e) { errors.push(`filter ${status}: ${e.message}`); }
    }

    // Deduplicate by id (in case batches overlap).
    const seen = new Set<string>();
    const candidates = allAddons.filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return !!a.current_period_end && a.auto_renew === false;
    });

    // ── RC18.3.4 Part D: Build a map of (user, product) → has scheduled renewal ──
    // If a scheduled renewal exists for the same product, suppress the reminder.
    const scheduledRenewalMap = new Map<string, boolean>();
    try {
      const scheduled = await sr.entities.AddOnSubscription.filter({ status: 'scheduled' });
      for (const s of scheduled) {
        const key = `${s.owner_user_id}|${s.add_on_product_id}`;
        scheduledRenewalMap.set(key, true);
      }
    } catch (e) { errors.push(`scheduled filter: ${e.message}`); }

    // ── RC18.3.4 Part D §13 / Part E: Group by (user, product, expiry_date) ──
    // Multiple current add-ons of the same product expiring on the same date
    // produce ONE reminder (not one per AddOnSubscription row).
    interface ReminderGroup {
      owner_user_id: string;
      add_on_product_id: string;
      period_end: string;
      addons: any[];
    }
    const groupMap = new Map<string, ReminderGroup>();
    for (const addon of candidates) {
      const dk = dateKey(addon.current_period_end);
      const gkey = `${addon.owner_user_id}|${addon.add_on_product_id}|${dk}`;
      if (!groupMap.has(gkey)) {
        groupMap.set(gkey, { owner_user_id: addon.owner_user_id, add_on_product_id: addon.add_on_product_id, period_end: addon.current_period_end, addons: [] });
      }
      groupMap.get(gkey)!.addons.push(addon);
    }

    // ── RC18.3.4 Part E: Group pushes by (user, expiry_date) across products ──
    // Collect per-user, per-day, per-reminder-level push groups.
    interface PushGroup {
      owner_user_id: string;
      expiry_date: string;
      days_before: number;
      product_labels: string[];
      addon_ids: string[];
    }
    const pushGroups: PushGroup[] = [];

    for (const group of groupMap.values()) {
      const periodEnd = new Date(group.period_end);
      const daysUntilExpiry = Math.round((periodEnd.getTime() - now.getTime()) / MS_PER_DAY);

      for (const daysBefore of REMINDER_DAYS) {
        if (daysUntilExpiry !== daysBefore) continue;

        // ── Part D §11: Reminder suppression after renewal ──
        const renewalKey = `${group.owner_user_id}|${group.add_on_product_id}`;
        if (scheduledRenewalMap.get(renewalKey)) {
          suppressedByRenewal++;
          continue;
        }

        const dedupKey = `addon_expiry:${group.owner_user_id}:${group.add_on_product_id}:${dateKey(group.period_end)}:${daysBefore}`;
        // Idempotency check — skip if a reminder for this product+day already exists.
        try {
          const existing = await sr.entities.Notification.filter({ deduplication_key: dedupKey });
          if (existing && existing.length > 0) continue;
        } catch { /* non-blocking */ }

        // Resolve product for the label.
        const product = group.add_on_product_id
          ? await sr.entities.AddOnProduct.get(group.add_on_product_id).catch(() => null)
          : null;
        const qty = group.addons.reduce((sum, a) => sum + (a.quantity || 0), 0);
        const label = productLabel(qty, group.addons[0]?.entitlement_type || product?.entitlement_type || '');
        const expiryStr = fmtDate(group.period_end);
        const isFinal = daysBefore === 1;
        const body = isFinal
          ? `Your ${label} add-on expires tomorrow. Renew now to keep your extra capacity.`
          : `Your ${label} add-on expires on ${expiryStr}. Renew it to keep your extra capacity.`;

        try {
          await sr.entities.Notification.create({
            title: isFinal ? 'Add-on expires tomorrow' : 'Add-on expiring soon',
            body,
            type: 'addon_expiry_reminder',
            priority: isFinal ? 'high' : 'medium',
            user_id: group.owner_user_id,
            created_by_id: group.owner_user_id,
            addon_subscription_id: group.addons[0]?.id,
            action_label: 'Renew',
            action_url: `/subscription?addon=${group.add_on_product_id}&mode=renew`,
            deduplication_key: dedupKey,
          });
          remindersCreated++;
        } catch (e) { errors.push(`notify ${group.add_on_product_id}/${daysBefore}: ${e.message}`); }

        // Collect for grouped push (Part E).
        pushGroups.push({
          owner_user_id: group.owner_user_id,
          expiry_date: group.period_end,
          days_before: daysBefore,
          product_labels: [label],
          addon_ids: [group.add_on_product_id],
        });
      }
    }

    // ── RC18.3.4 Part E: Send grouped push notifications ──
    // Merge all product reminders for the same (user, expiry_date, days_before)
    // into a single push: "3 BoriSend add-ons expire on 1 October."
    const pushByUserDay = new Map<string, PushGroup[]>();
    for (const pg of pushGroups) {
      const pk = `${pg.owner_user_id}|${dateKey(pg.expiry_date)}|${pg.days_before}`;
      if (!pushByUserDay.has(pk)) pushByUserDay.set(pk, []);
      pushByUserDay.get(pk)!.push(pg);
    }

    for (const [pk, groups] of pushByUserDay) {
      const allLabels = groups.flatMap(g => g.product_labels);
      const userId = groups[0].owner_user_id;
      const expiryStr = fmtDate(groups[0].expiry_date);
      const isFinal = groups[0].days_before === 1;
      const count = allLabels.length;
      const firstProductId = groups[0].addon_ids[0];

      const pushTitle = isFinal ? 'Add-ons expire tomorrow' : 'Add-ons expiring soon';
      const pushBody = count === 1
        ? groups[0].product_labels[0] + (isFinal ? ' expires tomorrow.' : ` expires on ${expiryStr}.`)
        : `${count} BoriSend add-ons ${isFinal ? 'expire tomorrow' : `expire on ${expiryStr}`}.`;

      try {
        const tokens = await sr.entities.DeviceToken.filter({ created_by_id: userId, is_active: true }).catch(() => []);
        if (tokens && tokens.length > 0) {
          try {
            await sr.integrations.Core.SendPushNotification({
              user_id: userId,
              title: pushTitle,
              content: pushBody,
              action_label: count === 1 ? 'Renew' : 'View',
              action_url: count === 1
                ? `borisend://addon-renewal/${firstProductId}`
                : `borisend://subscription`,
            });
            pushesAttempted++;
          } catch (pushErr) { errors.push(`push-call ${pk}: ${pushErr.message}`); }
        }
      } catch (e) { errors.push(`push ${pk}: ${e.message}`); }
    }
  } catch (e) {
    errors.push(`fatal: ${e.message}`);
  }

  return Response.json({
    received: true,
    reminders_created: remindersCreated,
    pushes_attempted: pushesAttempted,
    suppressed_by_renewal: suppressedByRenewal,
    errors: errors.slice(0, 10),
  });
});