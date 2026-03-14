import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listStations, createStation, createStationSchema, resolveKdsLocationId } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations — list stations
// Uses resolveKdsLocationId to handle site→venue and venue→site fallback
// so the POS finds stations regardless of location hierarchy level.
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rawLocationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';
    const effectiveLocationId = rawLocationId
      ? await resolveKdsLocationId(ctx.tenantId, rawLocationId)
      : rawLocationId;
    const stations = await listStations({
      tenantId: ctx.tenantId,
      locationId: effectiveLocationId,
      stationType: (url.searchParams.get('stationType') as any) ?? undefined,
      isActive: url.searchParams.get('isActive') === 'false' ? false : undefined,
    });
    return NextResponse.json({ data: stations, meta: { resolvedLocationId: effectiveLocationId } });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/stations — create station
// No venue→site resolution — stations are always created at the requested location.
// The server-side guard in createStation rejects sites that have venues.
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
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
