import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getFinancialAccountsSummary,
  updateFinancialAccount,
  updateFinancialAccountSchema,
} from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

function extractAccountId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('financial');
  return parts[idx + 1]!;
}

// GET /api/v1/customers/:id/financial/:accountId — single financial account detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const accountId = extractAccountId(request);
    const summary = await getFinancialAccountsSummary({
      tenantId: ctx.tenantId,
      customerId,
    });
    return NextResponse.json({ data: summary });
  },
  { entitlement: 'customers', permission: 'customers.financial.view' },
);

// PATCH /api/v1/customers/:id/financial/:accountId — update financial account
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const accountId = extractAccountId(request);
    const body = await request.json();
    const parsed = updateFinancialAccountSchema.safeParse({ ...body, accountId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateFinancialAccount(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.financial.manage' , writeAccess: true },
);
