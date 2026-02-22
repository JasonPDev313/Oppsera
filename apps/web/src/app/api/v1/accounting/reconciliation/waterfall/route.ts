import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReconciliationWaterfall } from '@oppsera/module-accounting';

// GET /api/v1/accounting/reconciliation/waterfall — chain of custody waterfall
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const businessDate = url.searchParams.get('businessDate') ?? new Date().toISOString().split('T')[0]!;
    const locationId = url.searchParams.get('locationId') ?? undefined;

    const result = await getReconciliationWaterfall({
      tenantId: ctx.tenantId,
      businessDate,
      locationId,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
