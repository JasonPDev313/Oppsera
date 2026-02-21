import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  searchGuests,
  createGuest,
  createGuestSchema,
} from '@oppsera/module-pms';

// GET /api/v1/pms/guests — search guests (requires ?propertyId=, optional ?q=&firstName=&lastName=&email=&phone=)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [
        { field: 'propertyId', message: 'propertyId query parameter is required' },
      ]);
    }

    const limitParam = url.searchParams.get('limit');
    const q = url.searchParams.get('q');

    const result = await searchGuests({
      tenantId: ctx.tenantId,
      propertyId,
      // If 'q' is provided, use it for both first and last name search
      firstName: q ?? url.searchParams.get('firstName') ?? undefined,
      lastName: q ? undefined : url.searchParams.get('lastName') ?? undefined,
      email: url.searchParams.get('email') ?? undefined,
      phone: url.searchParams.get('phone') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: 'pms.guests.view' },
);

// POST /api/v1/pms/guests — create guest
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createGuestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createGuest(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: 'pms.guests.manage' },
);
