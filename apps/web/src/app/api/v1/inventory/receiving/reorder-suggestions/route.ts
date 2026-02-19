import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReorderSuggestions } from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId') ?? ctx.locationId;

    if (!locationId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'locationId is required' } },
        { status: 400 },
      );
    }

    const suggestions = await getReorderSuggestions(ctx.tenantId, locationId);
    return NextResponse.json({ data: suggestions });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);
