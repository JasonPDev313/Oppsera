import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  removePaymentMethod,
  removePaymentMethodSchema,
  setDefaultPaymentMethod,
  setDefaultPaymentMethodSchema,
} from '@oppsera/module-payments';

function extractIds(request: NextRequest): { customerId: string; methodId: string } {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/{id}/payment-methods/{methodId}
  const custIdx = parts.indexOf('customers');
  return {
    customerId: parts[custIdx + 1]!,
    methodId: parts[parts.length - 1]!,
  };
}

// PATCH /api/v1/customers/:id/payment-methods/:methodId — set default or update nickname
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { customerId, methodId } = extractIds(request);
    const body = await request.json();

    if (body.isDefault === true) {
      const parsed = setDefaultPaymentMethodSchema.safeParse({
        paymentMethodId: methodId,
        customerId,
      });
      if (!parsed.success) {
        throw new ValidationError(
          'Validation failed',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        );
      }
      await setDefaultPaymentMethod(ctx, parsed.data);
      return NextResponse.json({ data: { success: true } });
    }

    return NextResponse.json(
      { error: { code: 'INVALID_UPDATE', message: 'Only isDefault update is supported' } },
      { status: 400 },
    );
  },
  { entitlement: 'customers', permission: 'customers.manage', writeAccess: true },
);

// DELETE /api/v1/customers/:id/payment-methods/:methodId
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { methodId } = extractIds(request);
    const parsed = removePaymentMethodSchema.safeParse({
      paymentMethodId: methodId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    await removePaymentMethod(ctx, parsed.data);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'customers', permission: 'customers.manage', writeAccess: true },
);
