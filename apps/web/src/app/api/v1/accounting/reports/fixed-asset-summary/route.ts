import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAssetSummary } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const summary = await getAssetSummary({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? undefined,
    });

    return NextResponse.json({ data: summary });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
