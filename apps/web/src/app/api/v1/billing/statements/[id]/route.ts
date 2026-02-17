import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getStatement } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/billing/statements/:id — get single statement by ID
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const statement = await getStatement({ tenantId: ctx.tenantId, statementId: id });
    return NextResponse.json({ data: statement });
  },
  { entitlement: 'customers', permission: 'billing.view' },
);
