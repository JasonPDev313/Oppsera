import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, pmsHousekeepers, pmsProperties } from '@oppsera/db';
import { PMS_PERMISSIONS } from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) {
      throw new ValidationError('userId is required', [{ field: 'userId', message: 'required' }]);
    }

    const rows = await withTenant(ctx.tenantId, async (tx) => {
      return tx
        .select({
          id: pmsHousekeepers.id,
          propertyId: pmsHousekeepers.propertyId,
          propertyName: pmsProperties.name,
          isActive: pmsHousekeepers.isActive,
        })
        .from(pmsHousekeepers)
        .leftJoin(pmsProperties, eq(pmsHousekeepers.propertyId, pmsProperties.id))
        .where(
          and(
            eq(pmsHousekeepers.tenantId, ctx.tenantId),
            eq(pmsHousekeepers.userId, userId),
          ),
        );
    });

    return NextResponse.json({ data: rows });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPING_VIEW },
);
