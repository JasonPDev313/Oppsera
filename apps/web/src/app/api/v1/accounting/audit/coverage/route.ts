import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuditCoverage } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'from and to query params required' } },
        { status: 400 },
      );
    }

    const result = await getAuditCoverage(ctx.tenantId, { from, to });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
