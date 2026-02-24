import { AuthorizationError } from '@oppsera/shared';
import type { RequestContext } from '../auth/context';
import { getPermissionEngine, matchPermission } from './engine';

export function requirePermission(permission: string) {
  return async (ctx: RequestContext): Promise<void> => {
    // Impersonation sessions get Owner-level (wildcard) permissions
    if (ctx.impersonation) return;

    const engine = getPermissionEngine();

    // When a specific role is selected, check only that role's permissions
    if (ctx.activeRoleId) {
      const rolePermissions = await engine.getUserPermissionsForRole(
        ctx.tenantId,
        ctx.user.id,
        ctx.activeRoleId,
        ctx.locationId,
      );
      for (const granted of rolePermissions) {
        if (matchPermission(granted, permission)) return;
      }
      throw new AuthorizationError(`Missing required permission: ${permission}`);
    }

    const hasAccess = await engine.hasPermission(
      ctx.tenantId,
      ctx.user.id,
      permission,
      ctx.locationId,
    );

    if (!hasAccess) {
      throw new AuthorizationError(`Missing required permission: ${permission}`);
    }
  };
}
