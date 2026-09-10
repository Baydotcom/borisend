import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getEffectiveEntitlements, isAddonCurrentlyEffective } from '../../shared/entitlements/entitlement-service.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    const sr = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const requestedUserId = body.user_id || null;
    const memberships = requestedUserId
      ? await sr.entities.MembershipSubscription.filter({ owner_user_id: requestedUserId })
      : await sr.entities.MembershipSubscription.list('-created_date', 100);
    const addOns = requestedUserId
      ? await sr.entities.AddOnSubscription.filter({ owner_user_id: requestedUserId })
      : await sr.entities.AddOnSubscription.list('-created_date', 200);

    const userIds = [...new Set([
      ...memberships.map((m:any) => m.owner_user_id),
      ...addOns.map((a:any) => a.owner_user_id),
    ].filter(Boolean))];

    const results:any[] = [];
    for (const userId of userIds) {
      const ent:any = await getEffectiveEntitlements(sr, userId);
      const mem = memberships
        .filter((m:any) => m.owner_user_id === userId)
        .sort((a:any,b:any) => new Date(b.current_period_end || b.created_date || 0).getTime() - new Date(a.current_period_end || a.created_date || 0).getTime())[0] || null;
      const effectiveAddons = addOns.filter((a:any) => a.owner_user_id === userId && isAddonCurrentlyEffective(a));
      const expectedAddon:any = { communication_plan_units:0, recipient_units:0, message_units:0, message_passes:0, smart_message_units:0 };
      for (const a of effectiveAddons) if (Object.prototype.hasOwnProperty.call(expectedAddon, a.entitlement_type)) expectedAddon[a.entitlement_type] += Number(a.quantity || 0);
      const checks = [
        ['membership_status', mem ? ['active','trial','grace','past_due'].includes(mem.status) ? ent.membershipStatus !== 'none' : true : true],
        ['plan_addons', Number(ent.communication_plan_units?.addons || 0) === expectedAddon.communication_plan_units],
        ['recipient_addons', Number(ent.recipient_units?.addons || 0) === expectedAddon.recipient_units],
        ['message_addons', Number(ent.message_units?.addons || 0) === expectedAddon.message_units],
        ['message_pass_addons', Number(ent.message_passes?.addons || 0) === expectedAddon.message_passes],
        ['smart_message_addons', Number(ent.smart_message_units?.addons || 0) === expectedAddon.smart_message_units],
      ];
      results.push({
        user_id: userId,
        membership_status: mem?.status || 'none',
        payment_provider: mem?.payment_provider || null,
        active_addons: effectiveAddons.length,
        entitlement_status: ent.membershipStatus,
        effective: {
          plans: ent.communication_plan_units?.effective || 0,
          recipients: ent.recipient_units?.effective || 0,
          messages: ent.message_units?.effective || 0,
          message_passes: ent.message_passes?.effective || 0,
          smart_messages: ent.smart_message_units?.effective || 0,
        },
        checks: checks.map(([name, passed]) => ({ name, passed })),
        passed: checks.every(([,passed]) => passed),
      });
    }

    return Response.json({
      checked_users: results.length,
      passed_users: results.filter(r => r.passed).length,
      failed_users: results.filter(r => !r.passed).length,
      all_passed: results.every(r => r.passed),
      results,
    });
  } catch (error:any) {
    console.error('[adminVerifyEntitlements]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
