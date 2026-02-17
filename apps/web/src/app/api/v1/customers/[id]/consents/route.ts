import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { recordConsent, recordConsentSchema } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/:id/consents — record customer consent
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = recordConsentSchema.safeParse({ ...body, customerId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const consent = await recordConsent(ctx, parsed.data);
    return NextResponse.json({ data: consent }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
