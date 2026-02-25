import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanModifyPermissions } from '@oppsera/core/auth/impersonation-safety';
import { ValidationError } from '@oppsera/shared';
import { revokeRole } from '@oppsera/core/permissions';
import { auditLog } from '@oppsera/core/audit';

const revokeRoleBody = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  locationId: z.string().optional(),
});

export const POST = withMiddleware(
  async (request, ctx) => {
    // Impersonation safety: block permission changes
    assertImpersonationCanModifyPermissions(ctx);

    const body = await request.json();
    const parsed = revokeRoleBody.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await revokeRole({
      tenantId: ctx.tenantId,
      ...parsed.data,
    });

    await auditLog(ctx, 'role.revoked', 'role_assignment', parsed.data.roleId, undefined, {
      userId: parsed.data.userId,
      locationId: parsed.data.locationId,
    });

    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'platform_core', permission: 'users.manage', writeAccess: true },
);
