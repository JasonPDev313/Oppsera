import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { buildAdminCtx } from '@/lib/admin-context';
import { listUsers, createUser } from '@oppsera/core';

export const GET = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const cursor = sp.get('cursor') ?? undefined;
  const limit = Math.min(Number(sp.get('limit') ?? 50), 100);

  const result = await listUsers({ tenantId, cursor, limit });

  return NextResponse.json({
    data: result.items,
    meta: { cursor: result.cursor, hasMore: result.hasMore },
  });
});

export const POST = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const ctx = buildAdminCtx(session, tenantId);

  try {
    const created = await createUser({
      tenantId,
      createdByUserId: ctx.user.id,
      firstName: body.firstName,
      lastName: body.lastName,
      emailAddress: body.emailAddress,
      userName: body.userName,
      password: body.password || undefined,
      phoneNumber: body.phoneNumber || undefined,
      userRole: body.userRole,
      additionalRoleIds: body.additionalRoleIds,
      userStatus: body.userStatus,
      posOverridePin: body.posOverridePin || undefined,
      uniqueIdentificationPin: body.uniqueIdentificationPin || undefined,
      userTabColor: body.userTabColor || undefined,
      externalPayrollEmployeeId: body.externalPayrollEmployeeId || undefined,
      locationIds: body.locationIds,
      forcePasswordReset: body.forcePasswordReset,
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to create user' } },
      { status },
    );
  }
}, 'admin');
