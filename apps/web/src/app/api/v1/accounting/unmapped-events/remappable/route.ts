import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getRemappableTenders } from '@oppsera/module-accounting';

// GET /api/v1/accounting/unmapped-events/remappable — list tenders eligible for GL remap
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');

    const results = await getRemappableTenders({
      tenantId: ctx.tenantId,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
    });

    return NextResponse.json({ data: results });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
