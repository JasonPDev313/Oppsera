import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGroupPickupSummary, PMS_PERMISSIONS } from '@oppsera/module-pms';

// GET /api/v1/pms/groups/pickup-summary?propertyId=...&status=...
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId') ?? '';
    const status = url.searchParams.get('status') ?? undefined;
    const startDateFrom = url.searchParams.get('startDateFrom') ?? undefined;
    const startDateTo = url.searchParams.get('startDateTo') ?? undefined;

    const data = await getGroupPickupSummary({
      tenantId: ctx.tenantId,
      propertyId,
      status,
      startDateFrom,
      startDateTo,
    });
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GROUPS_VIEW },
);
