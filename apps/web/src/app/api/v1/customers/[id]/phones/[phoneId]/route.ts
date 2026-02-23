import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateCustomerPhone,
  updateCustomerPhoneSchema,
  removeCustomerPhone,
} from '@oppsera/module-customers';

function extractPhoneId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const phoneId = extractPhoneId(request);
    const body = await request.json();
    const parsed = updateCustomerPhoneSchema.safeParse({ ...body, phoneId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const updated = await updateCustomerPhone(ctx, parsed.data);
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const phoneId = extractPhoneId(request);
    await removeCustomerPhone(ctx, { phoneId });
    return NextResponse.json({ data: { id: phoneId, deleted: true } });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
