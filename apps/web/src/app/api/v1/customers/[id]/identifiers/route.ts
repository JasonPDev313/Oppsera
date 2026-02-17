import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  addCustomerIdentifier,
  addCustomerIdentifierSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/:id/identifiers — add customer identifier (card, barcode, wristband)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = addCustomerIdentifierSchema.safeParse({ ...body, customerId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const identifier = await addCustomerIdentifier(ctx, parsed.data);

    return NextResponse.json({ data: identifier }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
