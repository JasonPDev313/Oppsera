import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getRatePlanPrices,
  setRatePlanPrices,
  setRatePlanPriceSchema,
} from '@oppsera/module-pms';

function extractRatePlanId(request: NextRequest): string {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const ratePlansIndex = pathParts.indexOf('rate-plans');
  return pathParts[ratePlansIndex + 1]!;
}

// GET /api/v1/pms/rate-plans/:id/prices — list prices for a rate plan
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const ratePlanId = extractRatePlanId(request);
    const url = new URL(request.url);

    const result = await getRatePlanPrices({
      tenantId: ctx.tenantId,
      ratePlanId,
      roomTypeId: url.searchParams.get('roomTypeId') ?? undefined,
      startDate: url.searchParams.get('startDate') ?? undefined,
      endDate: url.searchParams.get('endDate') ?? undefined,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.rates.view' },
);

// POST /api/v1/pms/rate-plans/:id/prices — set prices for a rate plan
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const ratePlanId = extractRatePlanId(request);
    const body = await request.json();

    // Merge the ratePlanId from the URL into the body
    const parsed = setRatePlanPriceSchema.safeParse({
      ...body,
      ratePlanId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setRatePlanPrices(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: 'pms.rates.manage' },
);
