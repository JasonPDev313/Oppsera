import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  listHousekeepingAssignments,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const date = url.searchParams.get('date');

    if (!propertyId || !date) {
      throw new ValidationError('Missing required parameters', [
        ...(!propertyId ? [{ field: 'propertyId', message: 'required' }] : []),
        ...(!date ? [{ field: 'date', message: 'required' }] : []),
      ]);
    }

    const housekeeperId = url.searchParams.get('housekeeperId') ?? undefined;
    const data = await listHousekeepingAssignments(ctx.tenantId, propertyId, date, housekeeperId);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPING_VIEW },
);
