import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getRoleDetail, updateRole, deleteRole } from '@oppsera/core';

function extractRoleId(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

/** GET /api/v1/tenants/:id/roles/:roleId — get role detail */
export const GET = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const roleId = extractRoleId(req);
  try {
    const role = await getRoleDetail(tenantId, roleId);
    return NextResponse.json({ data: role });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    return NextResponse.json(
      { error: { code: error.code ?? 'NOT_FOUND', message: error.message ?? 'Role not found' } },
      { status: error.statusCode ?? 404 },
    );
  }
});

/** PATCH /api/v1/tenants/:id/roles/:roleId — update a role */
export const PATCH = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const roleId = extractRoleId(req);
  const body = await req.json();

  try {
    const role = await updateRole({
      roleId,
      tenantId,
      name: body.name,
      description: body.description,
      permissions: body.permissions,
    });
    return NextResponse.json({ data: role });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to update role' } },
      { status },
    );
  }
}, 'admin');

/** DELETE /api/v1/tenants/:id/roles/:roleId — delete a role */
export const DELETE = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const roleId = extractRoleId(req);
  try {
    await deleteRole(tenantId, roleId);
    return new NextResponse(null, { status: 204 });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to delete role' } },
      { status },
    );
  }
}, 'admin');
