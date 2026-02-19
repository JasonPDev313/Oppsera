import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listReceipts, createDraftReceipt, createReceiptSchema } from '@oppsera/module-inventory';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listReceipts({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? ctx.locationId,
      status: url.searchParams.get('status') ?? undefined,
      vendorId: url.searchParams.get('vendorId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
    });
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const input = createReceiptSchema.parse(body);
    const receipt = await createDraftReceipt(ctx, input);
    return NextResponse.json({ data: receipt }, { status: 201 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' },
);
