import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { mergeCustomers, mergeCustomersSchema } from '@oppsera/module-customers';

// POST /api/v1/customers/merge — merge two customers
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = mergeCustomersSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await mergeCustomers(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
