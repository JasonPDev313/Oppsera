import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getRoleAccess,
  setRoleLocationAccess,
  setRoleProfitCenterAccess,
  setRoleTerminalAccess,
} from '@oppsera/core/permissions';
import { auditLog } from '@oppsera/core/audit';

const accessBody = z.object({
  locationIds: z.array(z.string().min(1)),
  profitCenterIds: z.array(z.string().min(1)),
  terminalIds: z.array(z.string().min(1)),
});

// GET /api/v1/roles/:id/access
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roleId = request.nextUrl.pathname.split('/').at(-2)!;
    const access = await getRoleAccess(ctx.tenantId, roleId);
    return NextResponse.json({ data: access });
  },
  { entitlement: 'platform_core', permission: 'users.view' },
);

// PUT /api/v1/roles/:id/access — replace all access config
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roleId = request.nextUrl.pathname.split('/').at(-2)!;
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = accessBody.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { locationIds, profitCenterIds, terminalIds } = parsed.data;

    await Promise.all([
      setRoleLocationAccess({ tenantId: ctx.tenantId, roleId, locationIds }),
      setRoleProfitCenterAccess({ tenantId: ctx.tenantId, roleId, profitCenterIds }),
      setRoleTerminalAccess({ tenantId: ctx.tenantId, roleId, terminalIds }),
    ]);

    await auditLog(ctx, 'role.access.updated', 'role', roleId);

    return NextResponse.json({
      data: { locationIds, profitCenterIds, terminalIds },
    });
  },
  { entitlement: 'platform_core', permission: 'users.manage', writeAccess: true },
);
