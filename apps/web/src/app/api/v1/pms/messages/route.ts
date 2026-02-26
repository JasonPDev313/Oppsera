import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  listMessageLog,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';
import { parseLimit } from '@/lib/api-params';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
      throw new ValidationError('propertyId is required', [{ field: 'propertyId', message: 'required' }]);
    }
    const data = await listMessageLog(ctx.tenantId, propertyId, {
      reservationId: url.searchParams.get('reservationId') ?? undefined,
      guestId: url.searchParams.get('guestId') ?? undefined,
      channel: url.searchParams.get('channel') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });
    return NextResponse.json({ data: data.items, meta: { cursor: data.cursor, hasMore: data.hasMore } });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.MESSAGES_VIEW },
);
