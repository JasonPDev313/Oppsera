import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { checkOutVisit } from '@oppsera/module-customers';

function extractVisitId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/:id/visits/:visitId/checkout — check out visit
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const visitId = extractVisitId(request);
    const result = await checkOutVisit(ctx, { visitId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
