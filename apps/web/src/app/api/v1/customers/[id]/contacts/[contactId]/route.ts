import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateCustomerContact, updateCustomerContactSchema } from '@oppsera/module-customers';

function extractIds(request: NextRequest): { customerId: string; contactId: string } {
  const parts = new URL(request.url).pathname.split('/');
  return {
    customerId: parts[parts.length - 3]!,
    contactId: parts[parts.length - 1]!,
  };
}

// PATCH /api/v1/customers/:id/contacts/:contactId — update customer contact
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { customerId, contactId } = extractIds(request);
    const body = await request.json();
    const parsed = updateCustomerContactSchema.safeParse({
      ...body,
      customerId,
      contactId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const contact = await updateCustomerContact(ctx, parsed.data);
    return NextResponse.json({ data: contact });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
