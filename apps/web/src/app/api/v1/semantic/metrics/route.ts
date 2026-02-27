import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listMetrics } from '@oppsera/module-semantic/registry';
import { db, semanticMetrics } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createMetricSchema = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/, 'Slug must be lowercase with underscores'),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  sqlExpression: z.string().min(1).max(2000),
  aggregation: z.enum(['sum', 'count', 'avg', 'min', 'max', 'count_distinct']).default('sum'),
  format: z.enum(['currency', 'number', 'percent', 'integer']).default('number'),
});

// ── GET /api/v1/semantic/metrics ──────────────────────────────────
// Returns system metrics + tenant custom metrics merged together.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const domain = new URL(request.url).searchParams.get('domain') ?? undefined;

    // System metrics from registry cache
    const systemMetrics = await listMetrics(domain);

    // Custom tenant metrics from DB
    const customRows = await db
      .select()
      .from(semanticMetrics)
      .where(
        and(
          eq(semanticMetrics.tenantId, ctx.tenantId),
          eq(semanticMetrics.isActive, true),
        ),
      );

    const data = [
      ...systemMetrics.map((m) => ({
        slug: m.slug,
        displayName: m.displayName,
        description: m.description ?? '',
        sqlExpression: m.sqlExpression,
        aggregation: m.sqlAggregation,
        format: m.dataType === 'currency' ? 'currency' : m.dataType === 'percent' ? 'percent' : m.dataType === 'integer' ? 'integer' : 'number',
        isSystem: true,
      })),
      ...customRows.map((m) => ({
        slug: m.slug,
        displayName: m.displayName,
        description: m.description ?? '',
        sqlExpression: m.sqlExpression,
        aggregation: m.sqlAggregation,
        format: m.dataType === 'currency' ? 'currency' : m.dataType === 'percent' ? 'percent' : m.dataType === 'integer' ? 'integer' : 'number',
        isSystem: false,
      })),
    ];

    return NextResponse.json({ data, meta: { count: data.length } });
  },
  {
    entitlement: 'semantic',
    permission: 'semantic.view',
    cache: 'private, max-age=60',
  },
);

// ── POST /api/v1/semantic/metrics ─────────────────────────────────
// Create or update a custom tenant metric. System metrics cannot be modified.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createMetricSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { slug, displayName, description, sqlExpression, aggregation, format } = parsed.data;

    // Check if slug conflicts with a system metric
    const [systemConflict] = await db
      .select({ id: semanticMetrics.id })
      .from(semanticMetrics)
      .where(and(eq(semanticMetrics.slug, slug), isNull(semanticMetrics.tenantId)));

    if (systemConflict) {
      return NextResponse.json(
        { error: { code: 'SLUG_CONFLICT', message: `Slug "${slug}" is reserved by a system metric.` } },
        { status: 409 },
      );
    }

    // Map format → dataType for DB
    const dataType = format === 'currency' ? 'currency' : format === 'percent' ? 'percent' : format === 'integer' ? 'integer' : 'number';

    // Upsert: check if tenant already has this slug
    const [existing] = await db
      .select({ id: semanticMetrics.id })
      .from(semanticMetrics)
      .where(
        and(
          eq(semanticMetrics.tenantId, ctx.tenantId),
          eq(semanticMetrics.slug, slug),
        ),
      );

    if (existing) {
      // Update
      const [updated] = await db
        .update(semanticMetrics)
        .set({
          displayName,
          description: description ?? '',
          sqlExpression,
          sqlAggregation: aggregation,
          dataType,
          updatedAt: new Date(),
        })
        .where(eq(semanticMetrics.id, existing.id))
        .returning();

      return NextResponse.json({ data: { slug: updated!.slug, updated: true } });
    }

    // Insert new custom metric
    const [created] = await db
      .insert(semanticMetrics)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        slug,
        displayName,
        description: description ?? '',
        domain: 'custom',
        sqlExpression,
        sqlTable: 'rm_daily_sales', // default; custom metrics define their own expression
        sqlAggregation: aggregation,
        dataType,
      })
      .returning();

    return NextResponse.json({ data: { slug: created!.slug, created: true } }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
