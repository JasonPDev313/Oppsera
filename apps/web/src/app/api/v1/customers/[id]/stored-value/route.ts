import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getStoredValueInstruments,
  issueStoredValue,
  issueStoredValueSchema,
} from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

// GET /api/v1/customers/:id/stored-value — list instruments
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);
    const instrumentType = url.searchParams.get('instrumentType') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;

    const data = await getStoredValueInstruments({
      tenantId: ctx.tenantId,
      customerId,
      instrumentType,
      status,
    });
    return NextResponse.json({ data });
  },
  { entitlement: 'customers', permission: 'customers.stored_value.view' },
);

// POST /api/v1/customers/:id/stored-value — issue new instrument
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const body = await request.json();
    const parsed = issueStoredValueSchema.safeParse({ ...body, customerId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await issueStoredValue(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.stored_value.manage' },
);
