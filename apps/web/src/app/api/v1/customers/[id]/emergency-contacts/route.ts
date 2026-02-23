import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomerContacts360,
  addEmergencyContact,
  addEmergencyContactSchema,
} from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const contacts = await getCustomerContacts360({ tenantId: ctx.tenantId, customerId });
    return NextResponse.json({ data: contacts.emergencyContacts });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const body = await request.json();
    const parsed = addEmergencyContactSchema.safeParse({ ...body, customerId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const contact = await addEmergencyContact(ctx, parsed.data);
    return NextResponse.json({ data: contact }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
