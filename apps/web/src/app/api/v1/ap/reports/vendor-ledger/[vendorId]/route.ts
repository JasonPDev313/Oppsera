import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getVendorLedger } from '@oppsera/module-ap';
import { parseLimit } from '@/lib/api-params';

function extractVendorId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const vendorId = extractVendorId(request);
    const { searchParams } = new URL(request.url);
    const result = await getVendorLedger({
      tenantId: ctx.tenantId,
      vendorId,
      startDate: searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('endDate') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.view' },
);
