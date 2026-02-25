/**
 * POST /api/v1/pms/housekeepers/from-user
 *
 * Link an existing user as a housekeeper at a property.
 * Steps:
 *   1. Validate user exists in tenant
 *   2. Look up the 'housekeeper' system role
 *   3. If user doesn't have it, assign it
 *   4. Create pms_housekeepers record
 *   5. Return the housekeeper record
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assignRole, getUserRoles, getUserById } from '@oppsera/core';
import { db, roles } from '@oppsera/db';
import { createHousekeeper, PMS_PERMISSIONS } from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

const fromUserBody = z.object({
  userId: z.string().min(1),
  propertyId: z.string().min(1),
});

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = fromUserBody.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const { userId, propertyId } = parsed.data;

    // 1. Fetch user to get name/phone
    const user = await getUserById({ tenantId: ctx.tenantId, userId });

    // 2. Find the housekeeper system role for this tenant
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

    // 3. If housekeeper role exists, check if user already has it — if not, assign it
    if (housekeeperRole) {
      const userRoleList = await getUserRoles(ctx.tenantId, userId);
      const hasHousekeeperRole = userRoleList.some((r) => r.id === housekeeperRole.id);

      if (!hasHousekeeperRole) {
        try {
          await assignRole({
            tenantId: ctx.tenantId,
            userId,
            roleId: housekeeperRole.id,
          });
        } catch (err: unknown) {
          // ConflictError means it's already assigned (race condition safe)
          if (!(err instanceof Error) || !('code' in err) || (err as { code: string }).code !== 'CONFLICT') {
            throw err;
          }
        }
      }
    }

    // 4. Create the housekeeper record
    const displayName = user.displayName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
    const result = await createHousekeeper(ctx, {
      propertyId,
      userId,
      name: displayName,
      phone: user.phone ?? undefined,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPERS_MANAGE, writeAccess: true },
);
