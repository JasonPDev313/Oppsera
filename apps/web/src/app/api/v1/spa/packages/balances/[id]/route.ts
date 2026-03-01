import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getPackageBalance } from '@oppsera/module-spa';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/spa/packages/balances/:id
  return parts[parts.length - 1]!;
}

// GET /api/v1/spa/packages/balances/:id — package balance detail with redemptions
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getPackageBalance(ctx.tenantId, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.packages.view' },
);
