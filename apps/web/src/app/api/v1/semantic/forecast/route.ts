import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { generateForecast } from '@oppsera/module-semantic/intelligence/predictive-forecaster';

// ── Validation ────────────────────────────────────────────────────

const forecastSchema = z.object({
  metricSlug: z.string().min(1).max(128),
  historyDays: z.number().int().min(7).max(365).default(90),
  forecastDays: z.number().int().min(1).max(90).default(30),
  method: z.enum(['linear', 'moving_average', 'exponential_smoothing']).default('linear'),
});

// ── POST /api/v1/semantic/forecast ────────────────────────────────
// Generates a time-series forecast for a metric using linear regression,
// moving average, or exponential smoothing on rm_daily_sales data.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = forecastSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { metricSlug, historyDays, forecastDays, method } = parsed.data;

    try {
      const result = await generateForecast(
        ctx.tenantId,
        metricSlug,
        {
          historyDays,
          forecastDays,
          method,
          locationId: ctx.locationId ?? undefined,
        },
      );

      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[semantic/forecast] Forecast error:', err);
      return NextResponse.json(
        { error: { code: 'FORECAST_ERROR', message: 'Unable to generate forecast. Please try again later.' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
