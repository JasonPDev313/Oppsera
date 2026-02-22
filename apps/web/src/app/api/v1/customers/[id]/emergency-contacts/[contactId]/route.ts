import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateEmergencyContact,
  updateEmergencyContactSchema,
  removeEmergencyContact,
} from '@oppsera/module-customers';

function extractContactId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const contactId = extractContactId(request);
    const body = await request.json();
    const parsed = updateEmergencyContactSchema.safeParse({ ...body, contactId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const updated = await updateEmergencyContact(ctx, parsed.data);
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const contactId = extractContactId(request);
    await removeEmergencyContact(ctx, { contactId });
    return NextResponse.json({ data: { id: contactId, deleted: true } });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
