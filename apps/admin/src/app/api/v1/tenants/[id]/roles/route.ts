import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { listRoles, createRole } from '@oppsera/core';

/** GET  /api/v1/tenants/:id/roles — list all roles for a tenant */
export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const roles = await listRoles(tenantId);
  return NextResponse.json({ data: roles });
});

/** POST /api/v1/tenants/:id/roles — create a new role for a tenant */
export const POST = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const name = (body.name ?? '').trim();
  const description = (body.description ?? '').trim();
  const permissions: string[] = body.permissions ?? [];

  if (!name) {
    return NextResponse.json({ error: { message: 'Role name is required' } }, { status: 400 });
  }
  if (permissions.length === 0) {
    return NextResponse.json({ error: { message: 'At least one permission is required' } }, { status: 400 });
  }

  try {
    const role = await createRole({ tenantId, name, description: description || undefined, permissions });
    return NextResponse.json({ data: role }, { status: 201 });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to create role' } },
      { status },
    );
  }
}, 'admin');
