import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listRoles, createRole } from '@oppsera/core/permissions';
import { auditLog } from '@oppsera/core/audit';

const createRoleBody = z.object({
  name: z.string().min(1).max(100).transform((v) => v.trim()),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1)).min(1),
});

export const GET = withMiddleware(
  async (_request, ctx) => {
    const result = await listRoles(ctx.tenantId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'platform_core', permission: 'users.view' },
);

export const POST = withMiddleware(
  async (request, ctx) => {
    const body = await request.json();
    const parsed = createRoleBody.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const role = await createRole({
      tenantId: ctx.tenantId,
      ...parsed.data,
    });

    await auditLog(ctx, 'role.created', 'role', role.id);

    return NextResponse.json({ data: role }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'users.manage', writeAccess: true },
);
