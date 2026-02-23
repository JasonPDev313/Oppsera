import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createCustomer,
  createCustomerSchema,
  listCustomers,
} from '@oppsera/module-customers';

// GET /api/v1/customers — list customers with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const search = url.searchParams.get('search') ?? undefined;
    const tags = url.searchParams.get('tags') ?? undefined;

    const result = await listCustomers({
      tenantId: ctx.tenantId,
      cursor,
      limit,
      search,
      tags: tags ? tags.split(',') : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/customers — create customer
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createCustomerSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const customer = await createCustomer(ctx, parsed.data);

    return NextResponse.json({ data: customer }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
