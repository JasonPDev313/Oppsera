import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanModifyPermissions } from '@oppsera/core/auth/impersonation-safety';
import { auditLog, computeChanges } from '@oppsera/core/audit';
import { ValidationError } from '@oppsera/shared';
import { getUserById, updateUser } from '@oppsera/core';

const updateBody = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  emailAddress: z.string().email().optional(),
  userName: z.string().min(3).max(64).optional(),
  phoneNumber: z.string().max(30).optional().or(z.literal('')),
  userRole: z.string().min(1).optional(),
  additionalRoleIds: z.array(z.string().min(1)).optional(),
  userStatus: z.enum(['invited', 'active', 'inactive', 'locked']).optional(),
  posOverridePin: z.string().optional().or(z.literal('')),
  uniqueIdentificationPin: z.string().optional().or(z.literal('')),
  userTabColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
  externalPayrollEmployeeId: z.string().max(100).optional().or(z.literal('')),
  locationIds: z.array(z.string().min(1)).optional(),
  passwordResetRequired: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});

function extractUserId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const userId = extractUserId(request);
    const user = await getUserById({ tenantId: ctx.tenantId, userId });
    return NextResponse.json({ data: user });
  },
  { permission: 'users.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Impersonation safety: block user permission/role changes
    assertImpersonationCanModifyPermissions(ctx);

    const userId = extractUserId(request);
    const before = await getUserById({ tenantId: ctx.tenantId, userId });
    const body = await request.json();
    const parsed = updateBody.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateUser({
      tenantId: ctx.tenantId,
      updatedByUserId: ctx.user.id,
      userId,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      emailAddress: parsed.data.emailAddress,
      userName: parsed.data.userName,
      phoneNumber: parsed.data.phoneNumber || undefined,
      userRole: parsed.data.userRole,
      additionalRoleIds: parsed.data.additionalRoleIds,
      userStatus: parsed.data.userStatus,
      posOverridePin: parsed.data.posOverridePin || undefined,
      uniqueIdentificationPin: parsed.data.uniqueIdentificationPin || undefined,
      userTabColor: parsed.data.userTabColor || undefined,
      externalPayrollEmployeeId: parsed.data.externalPayrollEmployeeId || undefined,
      locationIds: parsed.data.locationIds,
      passwordResetRequired: parsed.data.passwordResetRequired,
      password: parsed.data.password,
    });

    const after = await getUserById({ tenantId: ctx.tenantId, userId });
    await auditLog(ctx, 'user.update', 'user', userId, computeChanges(before, after));
    return NextResponse.json({ data: result });
  },
  { permission: 'users.manage' },
);
