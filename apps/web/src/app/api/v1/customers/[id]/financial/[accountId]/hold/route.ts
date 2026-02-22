import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  placeFinancialHold,
  placeFinancialHoldSchema,
  liftFinancialHold,
  liftFinancialHoldSchema,
} from '@oppsera/module-customers';

function extractAccountId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('financial');
  return parts[idx + 1]!;
}

// POST /api/v1/customers/:id/financial/:accountId/hold — place financial hold
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = extractAccountId(request);
    const body = await request.json();
    const parsed = placeFinancialHoldSchema.safeParse({ ...body, accountId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await placeFinancialHold(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.financial.manage' },
);

// DELETE /api/v1/customers/:id/financial/:accountId/hold — lift financial hold
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = extractAccountId(request);
    const body = await request.json();
    const parsed = liftFinancialHoldSchema.safeParse({ ...body, accountId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await liftFinancialHold(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.financial.manage' },
);
