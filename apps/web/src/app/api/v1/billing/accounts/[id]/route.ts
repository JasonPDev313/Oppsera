import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getBillingAccount,
  updateBillingAccount,
  updateBillingAccountSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/billing/accounts/:id — billing account detail (members, recent AR, outstanding balance)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const account = await getBillingAccount({ tenantId: ctx.tenantId, billingAccountId: id });
    return NextResponse.json({ data: account });
  },
  { entitlement: 'customers', permission: 'billing.view' },
);

// PATCH /api/v1/billing/accounts/:id — update billing account
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateBillingAccountSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const account = await updateBillingAccount(ctx, id, parsed.data);
    return NextResponse.json({ data: account });
  },
  { entitlement: 'customers', permission: 'billing.manage' , writeAccess: true },
);
