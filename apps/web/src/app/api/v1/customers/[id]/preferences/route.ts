import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomerPreferences,
  setCustomerPreference,
  setCustomerPreferenceSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/customers/:id/preferences — get customer preferences
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const prefs = await getCustomerPreferences({ tenantId: ctx.tenantId, customerId: id });
    return NextResponse.json({ data: prefs });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/customers/:id/preferences — set a customer preference
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = setCustomerPreferenceSchema.safeParse({ ...body, customerId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const pref = await setCustomerPreference(ctx, parsed.data);
    return NextResponse.json({ data: pref }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
