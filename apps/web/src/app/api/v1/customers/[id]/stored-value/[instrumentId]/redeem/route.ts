import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  redeemStoredValue,
  redeemStoredValueSchema,
} from '@oppsera/module-customers';

function extractInstrumentId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const svIdx = parts.indexOf('stored-value');
  return parts[svIdx + 1]!;
}

// POST /api/v1/customers/:id/stored-value/:instrumentId/redeem
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const instrumentId = extractInstrumentId(request);
    const body = await request.json();
    const parsed = redeemStoredValueSchema.safeParse({ ...body, instrumentId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await redeemStoredValue(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.stored_value.manage' },
);
