import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTipBalances } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const result = await getTipBalances({
      tenantId: ctx.tenantId,
      locationId: searchParams.get('locationId') || undefined,
      asOfDate: searchParams.get('asOfDate') || undefined,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
