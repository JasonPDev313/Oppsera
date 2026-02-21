import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCashRequirements } from '@oppsera/module-ap';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await getCashRequirements({
      tenantId: ctx.tenantId,
      asOfDate: searchParams.get('asOfDate') ?? undefined,
      weeksAhead: searchParams.get('weeksAhead') ? Number(searchParams.get('weeksAhead')) : undefined,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);
