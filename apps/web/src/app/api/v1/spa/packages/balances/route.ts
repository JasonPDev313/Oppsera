import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listCustomerPackages } from '@oppsera/module-spa';

// GET /api/v1/spa/packages/balances — list customer package balances
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const customerId = searchParams.get('customerId') ?? undefined;
    if (!customerId) {
      throw new ValidationError('Validation failed', [
        { field: 'customerId', message: 'customerId query parameter is required' },
      ]);
    }

    const result = await listCustomerPackages({
      tenantId: ctx.tenantId,
      customerId,
      status: searchParams.get('status') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'spa', permission: 'spa.packages.view' },
);
