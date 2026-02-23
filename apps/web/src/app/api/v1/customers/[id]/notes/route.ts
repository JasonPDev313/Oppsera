import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomerNotesList,
  addCustomerNoteV2,
  addCustomerNoteV2Schema,
} from '@oppsera/module-customers';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

// GET /api/v1/customers/:id/notes — list customer notes
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = url.searchParams.get('limit')
      ? Number(url.searchParams.get('limit'))
      : undefined;
    const pinnedOnly = url.searchParams.get('pinnedOnly') === 'true' ? true : undefined;

    const result = await getCustomerNotesList({
      tenantId: ctx.tenantId,
      customerId,
      cursor,
      limit,
      pinnedOnly,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/customers/:id/notes — add customer note (V2)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const body = await request.json();
    const parsed = addCustomerNoteV2Schema.safeParse({ ...body, customerId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const note = await addCustomerNoteV2(ctx, parsed.data);

    return NextResponse.json({ data: note }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
