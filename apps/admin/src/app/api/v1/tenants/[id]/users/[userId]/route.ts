import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { buildAdminCtx } from '@/lib/admin-context';
import { getUserById, updateUser } from '@oppsera/core';

export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  const userId = params?.userId;
  if (!tenantId || !userId) {
    return NextResponse.json({ error: { message: 'Missing tenant or user ID' } }, { status: 400 });
  }

  try {
    const user = await getUserById({ tenantId, userId });
    return NextResponse.json({ data: user });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'NOT_FOUND', message: error.message ?? 'User not found' } },
      { status },
    );
  }
});

export const PATCH = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  const userId = params?.userId;
  if (!tenantId || !userId) {
    return NextResponse.json({ error: { message: 'Missing tenant or user ID' } }, { status: 400 });
  }

  const body = await req.json();
  const ctx = buildAdminCtx(session, tenantId);

  try {
    const result = await updateUser({
      tenantId,
      updatedByUserId: ctx.user.id,
      userId,
      firstName: body.firstName,
      lastName: body.lastName,
      emailAddress: body.emailAddress,
      userName: body.userName,
      phoneNumber: body.phoneNumber || undefined,
      userRole: body.userRole,
      additionalRoleIds: body.additionalRoleIds,
      userStatus: body.userStatus,
      posOverridePin: body.posOverridePin || undefined,
      uniqueIdentificationPin: body.uniqueIdentificationPin || undefined,
      userTabColor: body.userTabColor || undefined,
      externalPayrollEmployeeId: body.externalPayrollEmployeeId || undefined,
      locationIds: body.locationIds,
      passwordResetRequired: body.passwordResetRequired,
    });

    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to update user' } },
      { status },
    );
  }
}, 'admin');
