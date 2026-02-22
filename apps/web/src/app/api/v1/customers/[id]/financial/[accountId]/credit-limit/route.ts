import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateCreditLimit, updateCreditLimitSchema } from '@oppsera/module-customers';

function extractAccountId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('financial');
  return parts[idx + 1]!;
}

// PATCH /api/v1/customers/:id/financial/:accountId/credit-limit — update credit limit
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = extractAccountId(request);
    const body = await request.json();
    const parsed = updateCreditLimitSchema.safeParse({ ...body, accountId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateCreditLimit(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.financial.manage' },
);
