import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listStations, createStation, createStationSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations — list stations
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const stations = await listStations({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      stationType: (url.searchParams.get('stationType') as any) ?? undefined,
      isActive: url.searchParams.get('isActive') === 'false' ? false : undefined,
    });
    return NextResponse.json({ data: stations });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/stations — create station
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createStationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const station = await createStation(ctx, parsed.data);
    return NextResponse.json({ data: station }, { status: 201 });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
