import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { PMS_PERMISSIONS, listReservations } from '@oppsera/module-pms';

/**
 * GET /api/v1/pms/front-desk?propertyId=xxx
 *
 * Combined endpoint for the front desk page — fetches both arrivals (CONFIRMED)
 * and in-house guests (CHECKED_IN) in parallel within a single HTTP request.
 * Eliminates the waterfall of properties → arrivals + in-house.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'propertyId is required' } },
        { status: 400 },
      );
    }

    const [arrivalsResult, inHouseResult] = await Promise.all([
      listReservations({
        tenantId: ctx.tenantId,
        propertyId,
        status: 'CONFIRMED',
        limit: 100,
      }),
      listReservations({
        tenantId: ctx.tenantId,
        propertyId,
        status: 'CHECKED_IN',
        limit: 100,
      }),
    ]);

    return NextResponse.json({
      data: {
        arrivals: arrivalsResult.items,
        inHouse: inHouseResult.items,
      },
      meta: {
        arrivalsCount: arrivalsResult.items.length,
        inHouseCount: inHouseResult.items.length,
        arrivalsHasMore: arrivalsResult.hasMore,
        inHouseHasMore: inHouseResult.hasMore,
      },
    });
  },
  { permission: PMS_PERMISSIONS.RESERVATIONS_VIEW, entitlement: 'pms' },
);
