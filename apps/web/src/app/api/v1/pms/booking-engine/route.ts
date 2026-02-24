import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getBookingEngineConfig,
  updateBookingEngineConfig,
  updateBookingEngineConfigSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/booking-engine?propertyId=
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [
        { field: 'propertyId', message: 'required' },
      ]);
    }

    const data = await getBookingEngineConfig(ctx.tenantId, propertyId);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CHANNELS_VIEW },
);

// PUT /api/v1/pms/booking-engine
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updateBookingEngineConfigSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateBookingEngineConfig(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CHANNELS_MANAGE, writeAccess: true },
);
