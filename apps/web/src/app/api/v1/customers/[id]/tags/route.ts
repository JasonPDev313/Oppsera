import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomerTags,
  applyTagToCustomer,
  applyTagToCustomerSchema,
} from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/{id}/tags → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/:id/tags
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const tags = await getCustomerTags({
      tenantId: ctx.tenantId,
      customerId,
    });
    return NextResponse.json({ data: tags });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/customers/:id/tags
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const body = await request.json();
    const parsed = applyTagToCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await applyTagToCustomer(ctx, customerId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.tags.assign', writeAccess: true },
);
