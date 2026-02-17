import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { assignRole } from '@oppsera/core/permissions';
import { auditLog } from '@oppsera/core/audit';

const assignRoleBody = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  locationId: z.string().optional(),
});

export const POST = withMiddleware(
  async (request, ctx) => {
    const body = await request.json();
    const parsed = assignRoleBody.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const assignment = await assignRole({
      tenantId: ctx.tenantId,
      ...parsed.data,
    });

    await auditLog(ctx, 'role.assigned', 'role_assignment', assignment.id);

    return NextResponse.json({ data: assignment }, { status: 201 });
  },
  { permission: 'users.manage' },
);
