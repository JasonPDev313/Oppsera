import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getMappingCoverage } from '@oppsera/module-accounting';

// Allow extra time — this endpoint runs 9 count queries in parallel
export const maxDuration = 30;

// GET /api/v1/accounting/mappings/coverage — mapping coverage diagnostic
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const report = await getMappingCoverage({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
