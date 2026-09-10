import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { hasPermission } from '../../shared/rbac/permissions.ts';
import { getCapacityStatus } from '../../shared/entitlements/entitlement-service.ts';

/**
 * RC15 Admin User Detail
 *
 * Consolidates authoritative user information for admin view.
 * Enforces RBAC: requires 'users.view_profile' permission.
 *
 * Privacy boundary: does NOT expose message content or RelationshipMemory
 * unless the acting user has 'support.view_messages' / 'support.view_memory'
 * (super_admin only by default).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!hasPermission(user.role, 'users.view_profile')) {
      return Response.json({ error: 'Permission denied: admin access required' }, { status: 403 });
    }

    const url = new URL(req.url);
    const targetUserId = url.searchParams.get('user_id') || (await req.json().catch(() => ({})))?.user_id;

    if (!targetUserId) {
      return Response.json({ error: 'user_id is required' }, { status: 400 });
    }

    // ── Identity ──
    const users = await base44.asServiceRole.entities.User.filter({ id: targetUserId });
    const targetUser = users[0];
    if (!targetUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // ── BoriSendProfile ──
    const profiles = await base44.asServiceRole.entities.BoriSendProfile.filter({ user_id: targetUserId });
    const profile = profiles[0] || null;

    // ── Commercial: Membership ──
    const memberships = await base44.asServiceRole.entities.MembershipSubscription.filter({
      owner_user_id: targetUserId,
    });
    const membership = memberships[0] || null;

    let membershipConfig = null;
    if (membership?.membership_config_id) {
      const configs = await base44.asServiceRole.entities.MembershipConfiguration.filter({
        id: membership.membership_config_id,
      });
      membershipConfig = configs[0] || null;
    }

    // ── Commercial: Add-ons ──
    // RC18.3.4 Part L: Admin must distinguish active, scheduled (next-period
    // renewal), and expired add-ons for support diagnosis. Fetch ALL statuses.
    const allAddOns = await base44.asServiceRole.entities.AddOnSubscription.filter({
      owner_user_id: targetUserId,
    }).catch(() => []);
    const activeAddOns = allAddOns.filter(a => a.status === 'active' || a.status === 'cancel_at_period_end' || a.status === 'past_due');
    const scheduledAddOns = allAddOns.filter(a => a.status === 'scheduled');
    const expiredAddOns = allAddOns.filter(a => a.status === 'expired' || a.status === 'cancelled');

    // ── Capacity / Entitlement ──
    let capacity = null;
    try {
      capacity = await getCapacityStatus(base44.asServiceRole, targetUserId);
    } catch { /* non-blocking */ }

    // ── Product: Communication Plans ──
    const campaignsByUser = await base44.asServiceRole.entities.Campaign.filter({ user_id: targetUserId });
    const campaignsByCreator = await base44.asServiceRole.entities.Campaign.filter({ created_by_id: targetUserId });
    const allCampaigns = [...new Map([...campaignsByUser, ...campaignsByCreator].map(c => [c.id, c])).values()];
    const activeCampaigns = allCampaigns.filter(c => c.status === 'active');

    // ── Product: Contacts ──
    const contacts = await base44.asServiceRole.entities.Contact.filter({ owner_user_id: targetUserId });

    // ── Privacy boundary: do NOT expose message content or memory ──
    // Only expose counts unless the viewer has explicit support permissions
    const canViewMessages = hasPermission(user.role, 'support.view_messages');
    const canViewMemory = hasPermission(user.role, 'support.view_memory');

    return Response.json({
      identity: {
        id: targetUser.id,
        full_name: targetUser.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' '),
        email: targetUser.email,
        role: targetUser.role || 'user',
        timezone: targetUser.timezone || profile?.timezone || null,
        language: targetUser.language || profile?.preferred_locale || null,
        created_date: targetUser.created_date,
        is_disabled: targetUser.is_disabled || false,
        deletion_requested: targetUser.deletion_requested || false,
        borisend_user_id: profile?.borisend_user_id || null,
        onboarding_status: profile?.onboarding_status || 'incomplete',
        profile_status: profile?.profile_status || 'active',
        first_name: profile?.first_name || null,
        last_name: profile?.last_name || null,
      },
      commercial: {
        membership: membership ? {
          status: membership.status,
          billing_interval: membership.billing_interval,
          current_period_end: membership.current_period_end,
          cancel_at_period_end: membership.cancel_at_period_end,
          trial_ends_at: membership.trial_ends_at,
          config_name: membershipConfig?.display_name || null,
          included_plan_units: membershipConfig?.included_plan_units || 0,
          included_recipient_units: membershipConfig?.included_recipient_units || 0,
        } : null,
        active_addons: activeAddOns.map(a => ({
          entitlement_type: a.entitlement_type,
          quantity: a.quantity,
          status: a.status,
          auto_renew: a.auto_renew,
          purchase_mode: a.purchase_mode || 'current',
          period_end: a.current_period_end || null,
        })),
        scheduled_renewals: scheduledAddOns.map(a => ({
          entitlement_type: a.entitlement_type,
          quantity: a.quantity,
          add_on_product_id: a.add_on_product_id,
          effective_from: a.effective_from || null,
          period_end: a.current_period_end || null,
          renewal_intent_key: a.renewal_intent_key || null,
          stripe_checkout_session_id: a.stripe_checkout_session_id || null,
        })),
        expired_addons: expiredAddOns.map(a => ({
          entitlement_type: a.entitlement_type,
          quantity: a.quantity,
          status: a.status,
          period_end: a.current_period_end || null,
          cancelled_at: a.cancelled_at || null,
        })),
        capacity: capacity ? {
          plan: {
            used: capacity.plan?.used,
            effective: capacity.plan?.effective,
            isOverCapacity: capacity.plan?.isOverCapacity,
          },
          recipient: {
            used: capacity.recipient?.used,
            effective: capacity.recipient?.effective,
            isOverCapacity: capacity.recipient?.isOverCapacity,
          },
          message: {
            used: capacity.message?.used,
            effective: capacity.message?.effective,
            isOverCapacity: capacity.message?.isOverCapacity,
          },
          message_pass: {
            used: capacity.message_pass?.used,
            effective: capacity.message_pass?.effective,
            isOverCapacity: capacity.message_pass?.isOverCapacity,
          },
          smart_message: {
            used: capacity.smart_message?.used,
            effective: capacity.smart_message?.effective,
            isOverCapacity: capacity.smart_message?.isOverCapacity,
          },
        } : null,
      },
      product: {
        total_campaigns: allCampaigns.length,
        active_campaigns: activeCampaigns.length,
        total_contacts: contacts.length,
      },
      permissions: {
        can_view_messages: canViewMessages,
        can_view_memory: canViewMemory,
      },
    });
  } catch (error) {
    console.error('[adminGetUserDetail] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});