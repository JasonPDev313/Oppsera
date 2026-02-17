import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomer,
  updateCustomer,
  updateCustomerSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/customers/:id — customer detail with identifiers, memberships, billing accounts, activity log
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const customer = await getCustomer({ tenantId: ctx.tenantId, customerId: id });
    return NextResponse.json({ data: customer });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// PATCH /api/v1/customers/:id — update customer
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateCustomerSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const customer = await updateCustomer(ctx, id, parsed.data);
    return NextResponse.json({ data: customer });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
