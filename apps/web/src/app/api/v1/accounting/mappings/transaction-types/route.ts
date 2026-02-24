import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTransactionTypeMappings } from '@oppsera/module-accounting';

// GET /api/v1/accounting/mappings/transaction-types — all transaction types with GL mappings
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const items = await getTransactionTypeMappings({
      tenantId: ctx.tenantId,
      category,
      includeInactive,
    });

    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
