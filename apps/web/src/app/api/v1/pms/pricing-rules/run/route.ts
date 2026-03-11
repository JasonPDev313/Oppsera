import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  runPricingEngine,
  runPricingEngineSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// POST /api/v1/pms/pricing-rules/run — execute pricing engine for date range
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = runPricingEngineSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await runPricingEngine(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REVENUE_MANAGE, writeAccess: true },
);
