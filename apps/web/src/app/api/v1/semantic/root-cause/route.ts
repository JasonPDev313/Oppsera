import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { analyzeRootCause } from '@oppsera/module-semantic/intelligence/root-cause-analyzer';

// ── Validation ────────────────────────────────────────────────────

const rootCauseSchema = z.object({
  metricSlug: z.string().min(1).max(128),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  comparisonStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  comparisonEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
});

// ── POST /api/v1/semantic/root-cause ──────────────────────────────
// Analyzes why a metric changed between two time periods by decomposing
// the total change across location, day-of-week, and item category dimensions.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = rootCauseSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { metricSlug, startDate, endDate, comparisonStartDate, comparisonEndDate } = parsed.data;

    // Validate date range
    if (endDate < startDate) {
      throw new ValidationError('Validation failed', [
        { field: 'endDate', message: 'endDate must be on or after startDate' },
      ]);
    }

    // Validate comparison dates are both present or both absent
    if ((comparisonStartDate && !comparisonEndDate) || (!comparisonStartDate && comparisonEndDate)) {
      throw new ValidationError('Validation failed', [
        { field: 'comparisonStartDate', message: 'Both comparisonStartDate and comparisonEndDate must be provided together' },
      ]);
    }

    if (comparisonStartDate && comparisonEndDate && comparisonEndDate < comparisonStartDate) {
      throw new ValidationError('Validation failed', [
        { field: 'comparisonEndDate', message: 'comparisonEndDate must be on or after comparisonStartDate' },
      ]);
    }

    try {
      const result = await analyzeRootCause(
        ctx.tenantId,
        metricSlug,
        { start: startDate, end: endDate },
        {
          locationId: ctx.locationId ?? undefined,
          comparisonRange: comparisonStartDate && comparisonEndDate
            ? { start: comparisonStartDate, end: comparisonEndDate }
            : undefined,
        },
      );

      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[semantic/root-cause] Analysis error:', err);
      return NextResponse.json(
        { error: { code: 'ANALYSIS_ERROR', message: 'Unable to perform root cause analysis. Please try again later.' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
