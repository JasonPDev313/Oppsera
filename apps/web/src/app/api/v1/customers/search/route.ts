import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { searchCustomers } from '@oppsera/module-customers';

// GET /api/v1/customers/search — lightweight search for POS customer attachment
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? undefined;
    const identifier = url.searchParams.get('identifier') ?? undefined;

    const result = await searchCustomers({
      tenantId: ctx.tenantId,
      search,
      identifier,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
