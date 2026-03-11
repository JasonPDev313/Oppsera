import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listWaitlist,
  addToWaitlist,
  addToWaitlistSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'propertyId is required' } }, { status: 400 });
    }

    const result = await listWaitlist({
      tenantId: ctx.tenantId,
      propertyId,
      status: url.searchParams.get('status') ?? undefined,
      guestId: url.searchParams.get('guestId') ?? undefined,
      roomTypeId: url.searchParams.get('roomTypeId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.WAITLIST_VIEW },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = addToWaitlistSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await addToWaitlist(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.WAITLIST_MANAGE, writeAccess: true },
);
