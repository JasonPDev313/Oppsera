import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getDepreciationSchedule } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const segments = request.nextUrl.pathname.split('/');
  // URL: /api/v1/accounting/fixed-assets/[id]/schedule
  return segments[segments.length - 2]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const schedule = await getDepreciationSchedule({ tenantId: ctx.tenantId, assetId: id });

    if (!schedule) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Fixed asset not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: schedule });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
