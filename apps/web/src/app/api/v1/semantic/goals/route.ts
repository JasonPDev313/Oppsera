import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc, lt } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticMetricGoals } from '@oppsera/db';
import { parseLimit } from '@/lib/api-params';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createGoalSchema = z.object({
  metricSlug: z.string().min(1).max(128),
  targetValue: z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Must be a numeric string with up to 4 decimal places'),
  periodType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  locationId: z.string().max(128).optional(),
  notes: z.string().max(1000).optional(),
});

// ── GET /api/v1/semantic/goals ────────────────────────────────────
// List active goals for the current tenant. Supports:
//   ?activeOnly=true (default: true)
//   ?metricSlug=net_sales (filter by metric)
//   ?periodType=monthly (filter by period)
//   ?limit=50&cursor=xxx (cursor pagination)

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('activeOnly') !== 'false';
    const metricSlug = url.searchParams.get('metricSlug') ?? undefined;
    const periodType = url.searchParams.get('periodType') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [eq(semanticMetricGoals.tenantId, ctx.tenantId)];
    if (activeOnly) {
      conditions.push(eq(semanticMetricGoals.isActive, true));
    }
    if (metricSlug) {
      conditions.push(eq(semanticMetricGoals.metricSlug, metricSlug));
    }
    if (periodType) {
      conditions.push(eq(semanticMetricGoals.periodType, periodType));
    }
    if (cursor) {
      conditions.push(lt(semanticMetricGoals.id, cursor));
    }

    const rows = await db
      .select()
      .from(semanticMetricGoals)
      .where(and(...conditions))
      .orderBy(desc(semanticMetricGoals.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      data: items.map((g) => ({
        id: g.id,
        metricSlug: g.metricSlug,
        targetValue: g.targetValue,
        periodType: g.periodType,
        periodStart: g.periodStart,
        periodEnd: g.periodEnd,
        locationId: g.locationId ?? null,
        createdBy: g.createdBy ?? null,
        notes: g.notes ?? null,
        isActive: g.isActive,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1]!.id : null,
        hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/goals ───────────────────────────────────
// Create a new metric goal for tracking pacing.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createGoalSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { metricSlug, targetValue, periodType, periodStart, periodEnd, locationId, notes } = parsed.data;

    // Validate date range
    if (periodEnd <= periodStart) {
      throw new ValidationError('Validation failed', [
        { field: 'periodEnd', message: 'periodEnd must be after periodStart' },
      ]);
    }

    const [row] = await db
      .insert(semanticMetricGoals)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        metricSlug,
        targetValue,
        periodType,
        periodStart,
        periodEnd,
        locationId: locationId ?? null,
        createdBy: ctx.user.id,
        notes: notes ?? null,
      })
      .returning();

    return NextResponse.json({ data: row }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
