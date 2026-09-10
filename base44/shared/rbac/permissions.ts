/**
 * RC15 RBAC — Role-Based Access Control
 *
 * Central permission model. Roles map to permissions; backend functions
 * enforce via hasPermission(). Frontend components check via usePermissions().
 *
 * Roles:
 *   user         — normal BoriSend customer (own data only)
 *   admin        — operational/admin (user directory, commercial config, support info)
 *   super_admin  — highest privilege (manage admins, roles, critical settings)
 *
 * Least-privilege: admins do NOT automatically get super_admin powers or
 * unrestricted access to private relationship/message data.
 */

export type Role = 'user' | 'admin' | 'super_admin';

export type Permission =
  | 'users.view'
  | 'users.view_profile'
  | 'users.manage_profile'
  | 'users.manage_status'
  | 'roles.manage'
  | 'roles.view'
  | 'commercial.view'
  | 'commercial.manage'
  | 'entitlements.adjust'
  | 'taxonomy.manage'
  | 'referrals.manage'
  | 'settings.manage'
  | 'support.view_account'
  | 'support.view_messages'
  | 'support.view_memory'
  | 'admin.access';

/** Full permission set per role. */
const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  user: new Set<Permission>([]),

  admin: new Set<Permission>([
    'admin.access',
    'users.view',
    'users.view_profile',
    'users.manage_status',
    'commercial.view',
    'taxonomy.manage',
    'referrals.manage',
    'settings.manage',
    'support.view_account',
    'roles.view',
  ]),

  super_admin: new Set<Permission>([
    'admin.access',
    'users.view',
    'users.view_profile',
    'users.manage_profile',
    'users.manage_status',
    'roles.manage',
    'roles.view',
    'commercial.view',
    'commercial.manage',
    'entitlements.adjust',
    'taxonomy.manage',
    'referrals.manage',
    'settings.manage',
    'support.view_account',
    'support.view_messages',
    'support.view_memory',
  ]),
};

/** Resolve a user object's role safely (falls back to 'user'). */
export function resolveRole(user: any): Role {
  const role = user?.role as string | undefined;
  if (role === 'super_admin' || role === 'admin') return role;
  return 'user';
}

/** Check if a user role grants a specific permission. */
export function hasPermission(role: string | undefined, permission: Permission): boolean {
  const resolved = (role === 'super_admin' || role === 'admin') ? (role as Role) : 'user';
  return ROLE_PERMISSIONS[resolved]?.has(permission) ?? false;
}

/** Check if a user can manage roles (promote/demote admins). */
export function canManageRoles(role: string | undefined): boolean {
  return hasPermission(role, 'roles.manage');
}

/**
 * Enforce a permission server-side. Throws 403 if the user lacks it.
 * Call at the top of any sensitive backend function.
 */
export function enforcePermission(user: any, permission: Permission): void {
  if (!user) {
    throw new Error('Authentication required');
  }
  if (!hasPermission(user.role, permission)) {
    throw new Error(`Permission denied: ${permission} required`);
  }
}

/**
 * Enforce that the acting user can access the target user's data.
 * Users can always access their own data; admins/super_admins need the
 * appropriate support permission.
 */
export function enforceUserAccess(
  actingUser: any,
  targetUserId: string,
  permission: Permission = 'users.view_profile'
): void {
  if (!actingUser) throw new Error('Authentication required');
  if (actingUser.id === targetUserId) return;
  if (!hasPermission(actingUser.role, permission)) {
    throw new Error('Access denied: you cannot view another user\'s data');
  }
}