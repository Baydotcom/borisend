import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { hasPermission, canManageRoles } from '../../shared/rbac/permissions.ts';

/**
 * RC15 Admin Update User Role
 *
 * Super Admin only. Promotes/demotes users between 'user' and 'admin'.
 * Super Admins cannot be demoted by other admins (only by another super_admin).
 * Admins cannot promote themselves or others to super_admin.
 *
 * Enforced server-side — frontend role checks are cosmetic only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only super_admin can manage roles
    if (!canManageRoles(user.role)) {
      return Response.json({ error: 'Permission denied: super admin access required to manage roles' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { target_user_id, new_role } = body;

    if (!target_user_id || !new_role) {
      return Response.json({ error: 'target_user_id and new_role are required' }, { status: 400 });
    }

    // Validate role value
    if (!['user', 'admin', 'super_admin'].includes(new_role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Cannot change own role (prevents self-promotion/lockout)
    if (target_user_id === user.id) {
      return Response.json({ error: 'You cannot change your own role' }, { status: 400 });
    }

    // Load target user
    const users = await base44.asServiceRole.entities.User.filter({ id: target_user_id });
    const targetUser = users[0];
    if (!targetUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const oldRole = targetUser.role || 'user';

    // Prevent demoting a super_admin unless you are also super_admin (already enforced above)
    if (oldRole === 'super_admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Cannot demote a super admin' }, { status: 403 });
    }

    // Update role
    await base44.asServiceRole.entities.User.update(target_user_id, { role: new_role });

    // Analytics
    try {
      await base44.analytics.track({
        eventName: 'role_changed',
        properties: {
          target_user_id,
          old_role: oldRole,
          new_role,
        },
      });
    } catch { /* non-blocking */ }

    console.info(`[adminUpdateUserRole] ${user.id} changed ${target_user_id} from ${oldRole} to ${new_role}`);

    return Response.json({
      success: true,
      target_user_id,
      old_role: oldRole,
      new_role,
    });
  } catch (error) {
    console.error('[adminUpdateUserRole] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});