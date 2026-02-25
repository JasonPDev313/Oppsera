/**
 * POST /api/v1/pms/housekeepers/create-with-user
 *
 * Create a new user account and simultaneously link them as a housekeeper.
 * Steps:
 *   1. Look up the 'housekeeper' system role
 *   2. Create the user with that role
 *   3. Create the pms_housekeepers record
 *   4. Return both records
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { createUser } from '@oppsera/core';
import { db, roles } from '@oppsera/db';
import { createHousekeeper, PMS_PERMISSIONS } from '@oppsera/module-pms';
import { ValidationError, NotFoundError } from '@oppsera/shared';

const createWithUserBody = z.object({
  propertyId: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128).optional(),
  phone: z.string().max(30).optional(),
});

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createWithUserBody.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const { propertyId, firstName, lastName, email, username, password, phone } = parsed.data;

    // 1. Find the housekeeper system role for this tenant
    const [housekeeperRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.tenantId, ctx.tenantId),
          eq(roles.name, 'housekeeper'),
          eq(roles.isSystem, true),
        ),
      )
      .limit(1);

    if (!housekeeperRole) {
      throw new NotFoundError('Role', 'housekeeper');
    }

    // 2. Create the user with housekeeper role
    const created = await createUser({
      tenantId: ctx.tenantId,
      createdByUserId: ctx.user.id,
      firstName,
      lastName,
      emailAddress: email,
      userName: username,
      password: password || undefined,
      phoneNumber: phone || undefined,
      userRole: housekeeperRole.id,
      userStatus: 'active',
    });

    // 3. Create the housekeeper record
    const displayName = `${firstName} ${lastName}`.trim();
    const housekeeper = await createHousekeeper(ctx, {
      propertyId,
      userId: created.userId,
      name: displayName,
      phone: phone ?? undefined,
    });

    return NextResponse.json({
      data: {
        user: created,
        housekeeper,
      },
    }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPERS_MANAGE, writeAccess: true },
);
