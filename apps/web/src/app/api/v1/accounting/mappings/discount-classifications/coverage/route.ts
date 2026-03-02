import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getDiscountMappingCoverage } from '@oppsera/module-accounting';

// GET /api/v1/accounting/mappings/discount-classifications/coverage
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const coverage = await getDiscountMappingCoverage(ctx.tenantId);
    return NextResponse.json({ data: coverage });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
