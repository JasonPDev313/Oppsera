import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getRoleDetail, updateRole, deleteRole } from '@oppsera/core/permissions';
import { auditLog } from '@oppsera/core/audit';
import type { RequestContext } from '@oppsera/core/auth/context';

const updateRoleBody = z.object({
  name: z.string().min(1).max(100).transform((v) => v.trim()).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1)).min(1).optional(),
});

function extractRoleId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/roles/:id
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx: RequestContext) => {
    const roleId = extractRoleId(request);
    const role = await getRoleDetail(ctx.tenantId, roleId);
    return NextResponse.json({ data: role });
  },
  { entitlement: 'platform_core', permission: 'users.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx: RequestContext) => {
    const roleId = extractRoleId(request);
    const body = await request.json();
    const parsed = updateRoleBody.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const oldRole = await getRoleDetail(ctx.tenantId, roleId);

    const role = await updateRole({
      roleId,
      tenantId: ctx.tenantId,
      ...parsed.data,
    });

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (parsed.data.name && parsed.data.name !== oldRole.name) {
      changes.name = { old: oldRole.name, new: parsed.data.name };
    }
    if (parsed.data.description !== undefined && parsed.data.description !== oldRole.description) {
      changes.description = { old: oldRole.description, new: parsed.data.description };
    }
    if (parsed.data.permissions) {
      changes.permissions = { old: oldRole.permissions, new: parsed.data.permissions };
    }

    await auditLog(
      ctx,
      'role.updated',
      'role',
      roleId,
      Object.keys(changes).length > 0 ? changes : undefined,
    );

    return NextResponse.json({ data: role });
  },
  { entitlement: 'platform_core', permission: 'users.manage', writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx: RequestContext) => {
    const roleId = extractRoleId(request);
    await deleteRole(ctx.tenantId, roleId);

    await auditLog(ctx, 'role.deleted', 'role', roleId);

    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'platform_core', permission: 'users.manage', writeAccess: true },
);
