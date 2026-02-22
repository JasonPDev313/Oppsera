import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getFinancialAccountsSummary,
  createFinancialAccount,
  createFinancialAccountSchema,
} from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

// GET /api/v1/customers/:id/financial — financial accounts summary
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const data = await getFinancialAccountsSummary({ tenantId: ctx.tenantId, customerId });
    return NextResponse.json({ data });
  },
  { entitlement: 'customers', permission: 'customers.financial.view' },
);

// POST /api/v1/customers/:id/financial — create financial account
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const body = await request.json();
    const parsed = createFinancialAccountSchema.safeParse({ ...body, customerId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await createFinancialAccount(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.financial.manage' },
);
