import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getRatePlan,
  updateRatePlan,
  updateRatePlanSchema,
} from '@oppsera/module-pms';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const ratePlansIndex = pathParts.indexOf('rate-plans');
  return pathParts[ratePlansIndex + 1]!;
}

// GET /api/v1/pms/rate-plans/:id — get rate plan detail (with prices)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getRatePlan(ctx.tenantId, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.rates.view' },
);

// PATCH /api/v1/pms/rate-plans/:id — update rate plan
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateRatePlanSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateRatePlan(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.rates.manage' },
);
