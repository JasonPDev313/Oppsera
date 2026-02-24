export interface PermissionEngine {
  getUserPermissions(
    tenantId: string,
    userId: string,
    locationId?: string,
  ): Promise<Set<string>>;
  getUserPermissionsForRole(
    tenantId: string,
    userId: string,
    roleId: string,
    locationId?: string,
  ): Promise<Set<string>>;
  hasPermission(
    tenantId: string,
    userId: string,
    permission: string,
    locationId?: string,
  ): Promise<boolean>;
  invalidateCache(tenantId: string, userId: string): Promise<void>;
}

export { DefaultPermissionEngine, getPermissionEngine, setPermissionEngine, matchPermission } from './engine';
export { requirePermission } from './middleware';
export type { PermissionCache } from './cache';
export { InMemoryPermissionCache, RedisPermissionCache, getPermissionCache, setPermissionCache } from './cache';
export { createRole, updateRole, deleteRole, assignRole, revokeRole, setRoleLocationAccess, setRoleProfitCenterAccess, setRoleTerminalAccess } from './commands';
export { listRoles, getRoleDetail, getUserRoles, getEffectivePermissions, getUserRoleAssignments, getRoleAccess, getAccessibleLocationsForRole, getAccessibleProfitCentersForRole, getAccessibleTerminalsForRole } from './queries';
