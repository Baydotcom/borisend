import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getCapacityStatus } from '../../shared/entitlements/entitlement-service.ts';

/**
 * RC18 — Capacity Status API.
 *
 * Returns 5 capacity blocks:
 *   plan            — Communication Plans
 *   recipient       — Recipient Units
 *   message         — Generated Messages
 *   message_pass    — Message Passes
 *   smart_message   — Smart Messages
 *
 * Each block: { used, effective, remaining, overCapacity, isOverCapacity, breakdown }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await getCapacityStatus(base44.asServiceRole, user.id);

    // Also fetch active add-ons for UI display
    const addOnSubs = await base44.asServiceRole.entities.AddOnSubscription.filter({
      owner_user_id: user.id,
    }).catch(() => []);

    const ACTIVE_ADDON_STATUSES = ['active', 'cancel_at_period_end', 'past_due'];
    const now = new Date();
    const activeAddOns = addOnSubs
      .filter(s => ACTIVE_ADDON_STATUSES.includes(s.status))
      .filter(s => !s.current_period_end || now <= new Date(s.current_period_end));

    return Response.json({
      plan: result.plan,
      recipient: result.recipient,
      message: result.message,
      message_pass: result.message_pass,
      smart_message: result.smart_message,
      membershipStatus: result.membershipStatus,
      billingInterval: result.billingInterval,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      legacyBridge: result.legacyBridge,
      paymentProvider: result.paymentProvider,
      addons: activeAddOns.map(a => ({
        id: a.id,
        entitlementType: a.entitlement_type,
        entitlement_type: a.entitlement_type,
        quantity: a.quantity,
        status: a.status,
        autoRenew: a.auto_renew,
        periodEnd: a.current_period_end,
      })),
    });
  } catch (error) {
    console.error('[getCapacityStatus] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});