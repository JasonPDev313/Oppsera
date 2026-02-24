import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getEffectivePermissions } from '@oppsera/core/permissions';
import { getPermissionEngine } from '@oppsera/core/permissions/engine';

export const GET = withMiddleware(async (request: NextRequest, ctx) => {
  const roleId = request.nextUrl.searchParams.get('roleId');

  // When roleId is specified, return only that role's permissions
  if (roleId) {
    const engine = getPermissionEngine();
    const permissionSet = await engine.getUserPermissionsForRole(
      ctx.tenantId,
      ctx.user.id,
      roleId,
      ctx.locationId,
    );
    return NextResponse.json({
      data: {
        permissions: [...permissionSet],
        roles: [{ id: roleId, scope: 'active' }],
      },
    });
  }

  const result = await getEffectivePermissions(
    ctx.tenantId,
    ctx.user.id,
    ctx.locationId,
  );

  return NextResponse.json({ data: result });
});
