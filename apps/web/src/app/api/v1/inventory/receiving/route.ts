import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listReceipts, createDraftReceipt, createReceiptSchema } from '@oppsera/module-inventory';
import { parseLimit } from '@/lib/api-params';
import { db, locations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

async function resolveDefaultLocationId(tenantId: string): Promise<string | undefined> {
  const loc = await db.query.locations.findFirst({
    where: and(eq(locations.tenantId, tenantId), eq(locations.isActive, true)),
    columns: { id: true },
  });
  return loc?.id;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listReceipts({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? ctx.locationId,
      status: url.searchParams.get('status') ?? undefined,
      vendorId: url.searchParams.get('vendorId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
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
    const locationId = body.locationId || ctx.locationId || await resolveDefaultLocationId(ctx.tenantId);
    const input = createReceiptSchema.parse({ ...body, locationId });
    const receipt = await createDraftReceipt(ctx, input);
    return NextResponse.json({ data: receipt }, { status: 201 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
