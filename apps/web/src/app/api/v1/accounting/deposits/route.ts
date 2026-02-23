import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  listDepositSlips,
  createDepositSlip,
} from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listDepositSlips({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit')
        ? Math.min(parseInt(url.searchParams.get('limit')!, 10), 100)
        : undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const result = await createDepositSlip(ctx, {
      locationId: body.locationId,
      businessDate: body.businessDate,
      depositType: body.depositType,
      totalAmountCents: body.totalAmountCents,
      bankAccountId: body.bankAccountId,
      retailCloseBatchIds: body.retailCloseBatchIds,
      fnbCloseBatchId: body.fnbCloseBatchId,
      notes: body.notes,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
