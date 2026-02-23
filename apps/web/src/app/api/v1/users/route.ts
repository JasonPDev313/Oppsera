import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { auditLog } from '@oppsera/core/audit';
import { ValidationError } from '@oppsera/shared';
import { createUser, listUsers } from '@oppsera/core';

const createUserBody = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  emailAddress: z.string().email(),
  userName: z.string().min(3).max(64),
  password: z.string().min(8).max(128).optional(),
  phoneNumber: z.string().max(30).optional().or(z.literal('')),
  userRole: z.string().min(1),
  additionalRoleIds: z.array(z.string().min(1)).optional(),
  userStatus: z.enum(['active', 'inactive']),
  posOverridePin: z.string().optional().or(z.literal('')),
  uniqueIdentificationPin: z.string().optional().or(z.literal('')),
  userTabColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
  externalPayrollEmployeeId: z.string().max(100).optional().or(z.literal('')),
  locationIds: z.array(z.string().min(1)).optional(),
  forcePasswordReset: z.boolean().optional(),
});

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const result = await listUsers({ tenantId: ctx.tenantId, cursor, limit });
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'platform_core', permission: 'users.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createUserBody.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const created = await createUser({
      tenantId: ctx.tenantId,
      createdByUserId: ctx.user.id,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      emailAddress: parsed.data.emailAddress,
      userName: parsed.data.userName,
      password: parsed.data.password || undefined,
      phoneNumber: parsed.data.phoneNumber || undefined,
      userRole: parsed.data.userRole,
      additionalRoleIds: parsed.data.additionalRoleIds,
      userStatus: parsed.data.userStatus,
      posOverridePin: parsed.data.posOverridePin || undefined,
      uniqueIdentificationPin: parsed.data.uniqueIdentificationPin || undefined,
      userTabColor: parsed.data.userTabColor || undefined,
      externalPayrollEmployeeId: parsed.data.externalPayrollEmployeeId || undefined,
      locationIds: parsed.data.locationIds,
      forcePasswordReset: parsed.data.forcePasswordReset,
    });

    await auditLog(ctx, 'user.create', 'user', created.userId, undefined, { invited: created.invited });
    return NextResponse.json({ data: created }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'users.manage', writeAccess: true },
);
