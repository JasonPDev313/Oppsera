import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCoaHealth } from '@oppsera/module-accounting';

// GET /api/v1/accounting/health — COA health check
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const report = await getCoaHealth(ctx.tenantId);
    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
