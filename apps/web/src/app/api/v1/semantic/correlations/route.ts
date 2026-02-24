import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { discoverCorrelations } from '@oppsera/module-semantic/intelligence/correlation-engine';

// ── Validation ────────────────────────────────────────────────────

const correlationsSchema = z.object({
  targetMetricSlug: z.string().min(1).max(128),
  days: z.number().int().min(7).max(365).default(90),
});

// ── POST /api/v1/semantic/correlations ────────────────────────────
// Discovers statistical correlations between a target metric and all
// other available metrics using Pearson correlation on rm_daily_sales.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = correlationsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { targetMetricSlug, days } = parsed.data;

    try {
      const result = await discoverCorrelations(
        ctx.tenantId,
        targetMetricSlug,
        {
          periodDays: days,
          locationId: ctx.locationId ?? undefined,
        },
      );

      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[semantic/correlations] Discovery error:', err);
      return NextResponse.json(
        { error: { code: 'CORRELATION_ERROR', message: 'Unable to compute correlations. Please try again later.' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
