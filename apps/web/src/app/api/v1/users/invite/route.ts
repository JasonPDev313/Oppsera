import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { auditLog } from '@oppsera/core/audit';
import { ValidationError } from '@oppsera/shared';
import { inviteUser } from '@oppsera/core';

const inviteBody = z.object({
  emailAddress: z.string().email(),
  roleId: z.string().min(1),
  locationIds: z.array(z.string().min(1)).optional(),
});

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = inviteBody.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await inviteUser({
      tenantId: ctx.tenantId,
      invitedByUserId: ctx.user.id,
      emailAddress: parsed.data.emailAddress,
      roleId: parsed.data.roleId,
      locationIds: parsed.data.locationIds,
    });

    await auditLog(ctx, 'user.invite', 'user', result.userId);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'users.manage', writeAccess: true },
);
