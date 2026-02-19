import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCatalogForPOS } from '@oppsera/module-catalog';

// GET /api/v1/catalog/pos — lean POS catalog (items + categories in one call)
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const result = await getCatalogForPOS(ctx.tenantId);

    return NextResponse.json(
      { data: result },
      { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } },
    );
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);
