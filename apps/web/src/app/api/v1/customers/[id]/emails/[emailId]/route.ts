import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateCustomerEmail,
  updateCustomerEmailSchema,
  removeCustomerEmail,
} from '@oppsera/module-customers';

function extractEmailId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const emailId = extractEmailId(request);
    const body = await request.json();
    const parsed = updateCustomerEmailSchema.safeParse({ ...body, emailId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const updated = await updateCustomerEmail(ctx, parsed.data);
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const emailId = extractEmailId(request);
    await removeCustomerEmail(ctx, { emailId });
    return NextResponse.json({ data: { id: emailId, deleted: true } });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
