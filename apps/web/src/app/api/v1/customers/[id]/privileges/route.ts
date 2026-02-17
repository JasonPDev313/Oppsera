import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomerPrivileges,
  assignCustomerPrivilege,
  assignCustomerPrivilegeSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/:id/privileges — get customer privileges (merged from membership + manual)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const privileges = await getCustomerPrivileges({ tenantId: ctx.tenantId, customerId: id });
    return NextResponse.json({ data: privileges });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/customers/:id/privileges — assign manual privilege
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = assignCustomerPrivilegeSchema.safeParse({ ...body, customerId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const privilege = await assignCustomerPrivilege(ctx, parsed.data);

    return NextResponse.json({ data: privilege }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
