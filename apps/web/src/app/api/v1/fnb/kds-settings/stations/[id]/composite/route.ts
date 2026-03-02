import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getKdsStationSettings } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/stations/[id]/composite — get composite station settings
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const stationId = parts[parts.indexOf('stations') + 1]!;

    const settings = await getKdsStationSettings({
      tenantId: ctx.tenantId,
      stationId,
    });
    if (!settings) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Station not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: settings });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
