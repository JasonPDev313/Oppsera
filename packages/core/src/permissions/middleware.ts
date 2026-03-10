import { AuthorizationError } from '@oppsera/shared';
import type { RequestContext } from '../auth/context';
import { getPermissionEngine, matchPermission } from './engine';

export function requirePermission(permission: string | string[]) {
  return async (ctx: RequestContext): Promise<void> => {
    // Impersonation sessions get Owner-level (wildcard) permissions
    if (ctx.impersonation) return;

    const permissions = Array.isArray(permission) ? permission : [permission];
    const engine = getPermissionEngine();

    // When a specific role is selected, check only that role's permissions
    if (ctx.activeRoleId) {
      const rolePermissions = await engine.getUserPermissionsForRole(
        ctx.tenantId,
        ctx.user.id,
        ctx.activeRoleId,
        ctx.locationId,
      );
      for (const perm of permissions) {
        for (const granted of rolePermissions) {
          if (matchPermission(granted, perm)) return;
        }
      }
      throw new AuthorizationError(`Missing required permission: ${permissions.join(' or ')}`);
    }

    for (const perm of permissions) {
      const hasAccess = await engine.hasPermission(
        ctx.tenantId,
        ctx.user.id,
        perm,
        ctx.locationId,
      );
      if (hasAccess) return;
    }

    throw new AuthorizationError(`Missing required permission: ${permissions.join(' or ')}`);
  };
}
