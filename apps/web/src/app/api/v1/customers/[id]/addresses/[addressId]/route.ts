import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateCustomerAddress,
  updateCustomerAddressSchema,
  removeCustomerAddress,
} from '@oppsera/module-customers';

function extractAddressId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const addressId = extractAddressId(request);
    const body = await request.json();
    const parsed = updateCustomerAddressSchema.safeParse({ ...body, addressId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const updated = await updateCustomerAddress(ctx, parsed.data);
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const addressId = extractAddressId(request);
    await removeCustomerAddress(ctx, { addressId });
    return NextResponse.json({ data: { id: addressId, deleted: true } });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
