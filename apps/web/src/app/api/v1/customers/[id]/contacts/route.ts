import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomerProfile,
  addCustomerContact,
  addCustomerContactSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/:id/contacts — list customer contacts
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const profile = await getCustomerProfile({ tenantId: ctx.tenantId, customerId: id });
    return NextResponse.json({ data: profile.contacts });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/customers/:id/contacts — add customer contact
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = addCustomerContactSchema.safeParse({ ...body, customerId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const contact = await addCustomerContact(ctx, parsed.data);
    return NextResponse.json({ data: contact }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
