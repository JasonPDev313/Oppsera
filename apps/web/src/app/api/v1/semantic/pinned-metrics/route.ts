import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticPinnedMetrics } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createPinnedMetricSchema = z.object({
  metricSlug: z.string().min(1).max(128),
  displayName: z.string().min(1).max(200),
  config: z.object({
    showSparkline: z.boolean().optional(),
    sparklineDays: z.number().int().min(1).max(365).optional(),
    thresholdAlertAbove: z.number().optional(),
    thresholdAlertBelow: z.number().optional(),
    comparisonPeriod: z.enum(['previous_period', 'previous_year', 'none']).optional(),
    chartType: z.enum(['sparkline', 'bar', 'number']).optional(),
  }).optional(),
});

// ── GET /api/v1/semantic/pinned-metrics ───────────────────────────
// List the current user's pinned metrics, ordered by sortOrder.

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const rows = await db
      .select()
      .from(semanticPinnedMetrics)
      .where(
        and(
          eq(semanticPinnedMetrics.tenantId, ctx.tenantId),
          eq(semanticPinnedMetrics.userId, ctx.user.id),
        ),
      )
      .orderBy(semanticPinnedMetrics.sortOrder, desc(semanticPinnedMetrics.createdAt));

    return NextResponse.json({
      data: rows.map((r) => ({
        id: r.id,
        metricSlug: r.metricSlug,
        displayName: r.displayName,
        sortOrder: r.sortOrder,
        config: r.config ?? {},
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/pinned-metrics ──────────────────────────
// Pin a metric to the current user's watchlist.
// Uses a unique constraint (tenant_id, user_id, metric_slug) to prevent
// duplicate pins. Returns 409 on conflict.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createPinnedMetricSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { metricSlug, displayName, config } = parsed.data;

    // Check for existing pin (unique constraint: tenant + user + metric)
    const [existing] = await db
      .select({ id: semanticPinnedMetrics.id })
      .from(semanticPinnedMetrics)
      .where(
        and(
          eq(semanticPinnedMetrics.tenantId, ctx.tenantId),
          eq(semanticPinnedMetrics.userId, ctx.user.id),
          eq(semanticPinnedMetrics.metricSlug, metricSlug),
        ),
      );

    if (existing) {
      return NextResponse.json(
        { error: { code: 'ALREADY_PINNED', message: `Metric "${metricSlug}" is already pinned.` } },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(semanticPinnedMetrics)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        metricSlug,
        displayName,
        config: config ?? {},
      })
      .returning();

    return NextResponse.json({
      data: {
        id: row!.id,
        metricSlug: row!.metricSlug,
        displayName: row!.displayName,
        sortOrder: row!.sortOrder,
        config: row!.config ?? {},
        createdAt: row!.createdAt,
        updatedAt: row!.updatedAt,
      },
    }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
