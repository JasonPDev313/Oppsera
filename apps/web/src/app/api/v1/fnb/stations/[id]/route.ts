import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getStationDetail, updateStation, updateStationSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/[id] — get station detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const stationId = parts[parts.length - 1]!;

    const detail = await getStationDetail({
      tenantId: ctx.tenantId,
      stationId,
    });
    return NextResponse.json({ data: detail });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.view' },
);

// PATCH /api/v1/fnb/stations/[id] — update station
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const stationId = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateStationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const station = await updateStation(ctx, stationId, parsed.data);
    return NextResponse.json({ data: station });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' , writeAccess: true },
);
