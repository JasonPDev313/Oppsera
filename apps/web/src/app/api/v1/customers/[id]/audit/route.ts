import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getCustomerAuditTrail,
  recordCustomerAuditEntry,
  recordCustomerAuditEntrySchema,
} from '@oppsera/module-customers';
import { parseLimit } from '@/lib/api-params';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

// GET /api/v1/customers/:id/audit — customer audit trail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);

    const dateFrom = url.searchParams.get('dateFrom') ?? undefined;
    const dateTo = url.searchParams.get('dateTo') ?? undefined;
    const action = url.searchParams.get('action') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));

    const data = await getCustomerAuditTrail({
      tenantId: ctx.tenantId,
      customerId,
      dateFrom,
      dateTo,
      actionType: action,
      cursor,
      limit,
    });
    return NextResponse.json({ data: data.entries, meta: { cursor: data.cursor, hasMore: data.hasMore } });
  },
  { entitlement: 'customers', permission: 'customers.financial.view' },
);

// POST /api/v1/customers/:id/audit — record manual audit entry
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const body = await request.json();
    const parsed = recordCustomerAuditEntrySchema.safeParse({ ...body, customerId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await recordCustomerAuditEntry(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.financial.manage' , writeAccess: true },
);
