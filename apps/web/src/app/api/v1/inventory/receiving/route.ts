import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listReceipts, createDraftReceipt, createReceiptSchema } from '@oppsera/module-inventory';
import { parseLimit } from '@/lib/api-params';
import { db, locations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

/**
 * Resolve the default (first active) location for a tenant.
 * Used as a fallback when no locationId is provided in the request body
 * or the auth context.
 *
 * TOCTOU NOTE: This query runs outside the createDraftReceipt transaction.
 * This is acceptable because location IDs are stable — locations are rarely
 * deactivated, and even if one is deactivated between this read and the
 * subsequent insert, the receipt command will validate the locationId against
 * active locations and return a proper NOT_FOUND / INVALID error. There is
 * no correctness risk from this pre-transaction read.
 */
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
    const parsed = createReceiptSchema.safeParse({ ...body, locationId });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }
    const receipt = await createDraftReceipt(ctx, parsed.data);
    return NextResponse.json({ data: receipt }, { status: 201 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' , writeAccess: true },
);
