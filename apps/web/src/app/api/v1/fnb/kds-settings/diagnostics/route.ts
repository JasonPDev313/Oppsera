import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { diagnoseKdsRouting } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/diagnostics?locationId=...&catalogItemId=...&tabId=...&orderType=...
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';
    const catalogItemId = url.searchParams.get('catalogItemId') ?? undefined;
    const tabId = url.searchParams.get('tabId') ?? undefined;
    const orderType = url.searchParams.get('orderType') ?? undefined;
    const channel = url.searchParams.get('channel') ?? 'pos';

    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'MISSING_LOCATION', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    const result = await diagnoseKdsRouting({
      tenantId: ctx.tenantId,
      locationId,
      catalogItemId,
      tabId,
      orderType,
      channel,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
