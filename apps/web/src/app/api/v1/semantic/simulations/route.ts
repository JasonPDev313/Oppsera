import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, sql, semanticSimulations } from '@oppsera/db';
import type { SimulationScenario } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const scenarioSchema = z.object({
  name: z.string().min(1).max(200),
  adjustments: z.array(z.object({
    variable: z.string().min(1).max(128),
    changeType: z.enum(['absolute', 'percentage']),
    changeValue: z.number(),
  })).min(1).max(10),
});

const createSimulationSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  simulationType: z.enum(['what_if', 'sensitivity', 'scenario_comparison']),
  baseMetricSlug: z.string().min(1).max(128),
  scenarios: z.array(scenarioSchema).min(1).max(5),
  isSaved: z.boolean().default(false),
});

// ── GET /api/v1/semantic/simulations ──────────────────────────────
// List saved simulations for the current tenant.
// Supports:
//   ?savedOnly=true (default: false) — show only saved simulations
//   ?simulationType=what_if — filter by type
//   ?limit=50&cursor=xxx — cursor pagination

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const savedOnly = url.searchParams.get('savedOnly') === 'true';
    const simulationType = url.searchParams.get('simulationType') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [eq(semanticSimulations.tenantId, ctx.tenantId)];
    if (savedOnly) {
      conditions.push(eq(semanticSimulations.isSaved, true));
    }
    if (simulationType) {
      conditions.push(eq(semanticSimulations.simulationType, simulationType));
    }
    if (cursor) {
      const { lt } = await import('drizzle-orm');
      conditions.push(lt(semanticSimulations.id, cursor));
    }

    const rows = await db
      .select()
      .from(semanticSimulations)
      .where(and(...conditions))
      .orderBy(desc(semanticSimulations.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      data: items.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description ?? null,
        simulationType: s.simulationType,
        baseMetricSlug: s.baseMetricSlug,
        baseValue: Number(s.baseValue),
        scenarios: s.scenarios,
        bestScenario: s.bestScenario ?? null,
        isSaved: s.isSaved,
        createdBy: s.createdBy,
        createdAt: s.createdAt,
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1]!.id : null,
        hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/simulations ─────────────────────────────
// Run a new what-if simulation. Fetches the base metric value from read models,
// then computes projected values for each scenario.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createSimulationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { title, description, simulationType, baseMetricSlug, scenarios, isSaved } = parsed.data;

    // Fetch current base value from read models (last 30 days as baseline)
    let baseValue = 0;
    const metricExprMap: Record<string, string> = {
      net_sales: 'COALESCE(SUM(net_sales), 0)',
      gross_sales: 'COALESCE(SUM(gross_sales), 0)',
      order_count: 'COALESCE(SUM(order_count), 0)',
      avg_order_value: 'CASE WHEN SUM(order_count) > 0 THEN SUM(net_sales) / SUM(order_count) ELSE 0 END',
      void_count: 'COALESCE(SUM(void_count), 0)',
      discount_total: 'COALESCE(SUM(discount_total), 0)',
      tax_total: 'COALESCE(SUM(tax_total), 0)',
    };

    const sqlExpr = metricExprMap[baseMetricSlug];
    if (sqlExpr) {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0]!;
        const todayStr = new Date().toISOString().split('T')[0]!;

        const result = await db.execute(sql`
          SELECT ${sql.raw(sqlExpr)} AS value
          FROM rm_daily_sales
          WHERE tenant_id = ${ctx.tenantId}
            AND business_date >= ${startDate}
            AND business_date <= ${todayStr}
        `);

        const rows = Array.from(result as Iterable<{ value: string | number }>);
        if (rows.length > 0 && rows[0]!.value !== null) {
          baseValue = Number(rows[0]!.value);
        }
      } catch (err) {
        console.warn(`[semantic/simulations] Failed to fetch base value for ${baseMetricSlug}:`, err);
      }
    }

    // Compute projected values for each scenario
    const computedScenarios: SimulationScenario[] = scenarios.map((scenario) => {
      let projectedValue = baseValue;

      for (const adj of scenario.adjustments) {
        if (adj.changeType === 'percentage') {
          projectedValue = projectedValue * (1 + adj.changeValue / 100);
        } else {
          projectedValue = projectedValue + adj.changeValue;
        }
      }

      return {
        name: scenario.name,
        adjustments: scenario.adjustments,
        projectedValue: Math.round(projectedValue * 100) / 100,
        narrative: null, // Could be populated by a future LLM call
      };
    });

    // Determine best scenario (highest projected value for metrics where higher is better)
    const bestScenario = computedScenarios.reduce((best, current) => {
      if (current.projectedValue !== null && (best.projectedValue === null || current.projectedValue > best.projectedValue)) {
        return current;
      }
      return best;
    }, computedScenarios[0]!);

    const [row] = await db
      .insert(semanticSimulations)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        title,
        description: description ?? null,
        simulationType,
        baseMetricSlug,
        baseValue: baseValue.toFixed(4),
        scenarios: computedScenarios,
        bestScenario: bestScenario.name,
        isSaved,
        createdBy: ctx.user.id,
      })
      .returning();

    return NextResponse.json({
      data: {
        id: row!.id,
        title: row!.title,
        description: row!.description ?? null,
        simulationType: row!.simulationType,
        baseMetricSlug: row!.baseMetricSlug,
        baseValue: Number(row!.baseValue),
        scenarios: row!.scenarios,
        bestScenario: row!.bestScenario ?? null,
        isSaved: row!.isSaved,
        createdBy: row!.createdBy,
        createdAt: row!.createdAt,
      },
    }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
