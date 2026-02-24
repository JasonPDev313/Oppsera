import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getRateRestrictions,
  setRateRestrictions,
  clearRateRestrictions,
  setRateRestrictionsSchema,
  clearRateRestrictionsSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/restrictions?propertyId=&startDate=&endDate=&roomTypeId?=&ratePlanId?=
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!propertyId || !startDate || !endDate) {
      throw new ValidationError('Missing required parameters', [
        ...(!propertyId ? [{ field: 'propertyId', message: 'propertyId is required' }] : []),
        ...(!startDate ? [{ field: 'startDate', message: 'startDate is required' }] : []),
        ...(!endDate ? [{ field: 'endDate', message: 'endDate is required' }] : []),
      ]);
    }

    const restrictions = await getRateRestrictions({
      tenantId: ctx.tenantId,
      propertyId,
      startDate,
      endDate,
      roomTypeId: url.searchParams.get('roomTypeId') ?? undefined,
      ratePlanId: url.searchParams.get('ratePlanId') ?? undefined,
    });

    return NextResponse.json({ data: restrictions });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.RESTRICTIONS_VIEW },
);

// POST /api/v1/pms/restrictions — set restrictions for dates
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = setRateRestrictionsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setRateRestrictions(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.RESTRICTIONS_MANAGE, writeAccess: true },
);

// DELETE /api/v1/pms/restrictions — clear restrictions for date range
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = clearRateRestrictionsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await clearRateRestrictions(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.RESTRICTIONS_MANAGE, writeAccess: true },
);
