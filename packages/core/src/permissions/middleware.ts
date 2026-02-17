import { AuthorizationError } from '@oppsera/shared';
import type { RequestContext } from '../auth/context';
import { getPermissionEngine } from './engine';

export function requirePermission(permission: string) {
  return async (ctx: RequestContext): Promise<void> => {
    const engine = getPermissionEngine();

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
