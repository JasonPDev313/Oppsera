/**
 * GET /api/v1/pms/housekeepers/available-users?propertyId=xxx
 *
 * Returns users who are NOT already housekeepers at the given property.
 * Used by the "Link Existing User" dialog.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, users, memberships, pmsHousekeepers, userRoles, roles } from '@oppsera/db';
import { ValidationError } from '@oppsera/shared';
import { PMS_PERMISSIONS } from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
      throw new ValidationError('propertyId is required', [{ field: 'propertyId', message: 'required' }]);
    }

    const data = await withTenant(ctx.tenantId, async (tx) => {
      // Get user IDs already linked as housekeepers at this property
      const existingHousekeeperUserIds = await tx
        .select({ userId: pmsHousekeepers.userId })
        .from(pmsHousekeepers)
        .where(
          and(
            eq(pmsHousekeepers.tenantId, ctx.tenantId),
            eq(pmsHousekeepers.propertyId, propertyId),
          ),
        );

      const excludeIds = existingHousekeeperUserIds.map((r) => r.userId);

      // Get all active users in the tenant, excluding those already housekeepers
      const baseCondition = and(
        eq(memberships.tenantId, ctx.tenantId),
        eq(memberships.status, 'active'),
        eq(users.status, 'active'),
      );

      const where = excludeIds.length > 0
        ? and(baseCondition, notInArray(users.id, excludeIds))
        : baseCondition;

      const userRows = await tx
        .select({
          id: users.id,
          displayName: users.displayName,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          status: users.status,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(where!)
        .orderBy(users.displayName);

      // Fetch roles for these users
      const userIds = userRows.map((u) => u.id);
      const roleRows = userIds.length
        ? await tx
            .select({
              userId: userRoles.userId,
              roleId: userRoles.roleId,
              roleName: roles.name,
            })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(and(eq(userRoles.tenantId, ctx.tenantId), inArray(userRoles.userId, userIds)))
        : [];

      const rolesByUser = new Map<string, Array<{ id: string; name: string }>>();
      for (const row of roleRows) {
        if (!rolesByUser.has(row.userId)) rolesByUser.set(row.userId, []);
        rolesByUser.get(row.userId)!.push({ id: row.roleId, name: row.roleName });
      }

      return userRows.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        status: u.status,
        roles: rolesByUser.get(u.id) ?? [],
      }));
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPERS_MANAGE },
);
