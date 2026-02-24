import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticPinnedMetrics } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updatePinnedMetricSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  displayName: z.string().min(1).max(200).optional(),
  config: z.object({
    showSparkline: z.boolean().optional(),
    sparklineDays: z.number().int().min(1).max(365).optional(),
    thresholdAlertAbove: z.number().nullable().optional(),
    thresholdAlertBelow: z.number().nullable().optional(),
    comparisonPeriod: z.enum(['previous_period', 'previous_year', 'none']).optional(),
    chartType: z.enum(['sparkline', 'bar', 'number']).optional(),
  }).optional(),
});

// ── PATCH /api/v1/semantic/pinned-metrics/[id] ────────────────────
// Update sort order, display name, or config for a pinned metric.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updatePinnedMetricSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
    if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName;
    if (parsed.data.config !== undefined) updates.config = parsed.data.config;

    const [row] = await db
      .update(semanticPinnedMetrics)
      .set(updates)
      .where(
        and(
          eq(semanticPinnedMetrics.id, id),
          eq(semanticPinnedMetrics.tenantId, ctx.tenantId),
          eq(semanticPinnedMetrics.userId, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Pinned metric not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        metricSlug: row.metricSlug,
        displayName: row.displayName,
        sortOrder: row.sortOrder,
        config: row.config ?? {},
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);

// ── DELETE /api/v1/semantic/pinned-metrics/[id] ───────────────────
// Unpin a metric. Hard delete since pinned metrics are user-scoped
// and non-critical.

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const [row] = await db
      .delete(semanticPinnedMetrics)
      .where(
        and(
          eq(semanticPinnedMetrics.id, id),
          eq(semanticPinnedMetrics.tenantId, ctx.tenantId),
          eq(semanticPinnedMetrics.userId, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Pinned metric not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
