import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Model Pricing ────────────────────────────────────────────────
// Per-token costs in USD. Input and output priced separately.
// Prices are per million tokens (MTok).

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-3-haiku-20240307': { inputPerMTok: 0.25, outputPerMTok: 1.25 },
  'claude-3-haiku': { inputPerMTok: 0.25, outputPerMTok: 1.25 },
  'claude-3-sonnet-20240229': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-3-sonnet': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-3-opus-20240229': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'claude-3-opus': { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'claude-3-5-sonnet-20241022': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-3-5-sonnet': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  'claude-3-5-haiku-20241022': { inputPerMTok: 0.80, outputPerMTok: 4.0 },
  'claude-3-5-haiku': { inputPerMTok: 0.80, outputPerMTok: 4.0 },
  'gpt-4o': { inputPerMTok: 2.50, outputPerMTok: 10.0 },
  'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.60 },
};

// Default pricing for unknown models
const DEFAULT_PRICING: ModelPricing = { inputPerMTok: 1.0, outputPerMTok: 5.0 };

// ── Types ────────────────────────────────────────────────────────

export interface CostDashboardData {
  totalCost: number;
  totalTokens: number;
  avgCostPerQuery: number;
  costTrend: { date: string; cost: number; turns: number }[];
  modelBreakdown: { model: string; cost: number; turns: number; tokens: number }[];
  lensCostBreakdown: { lensId: string | null; cost: number; turns: number }[];
  topTenants: { tenantId: string; cost: number; turns: number }[];
}

export interface TenantCostRow {
  tenantId: string;
  totalCost: number;
  totalTurns: number;
  avgCost: number;
}

export interface CostProjection {
  projectedMonthlyCost: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  avgDailyCost: number;
  peakDayCost: number;
}

export interface AggregationResult {
  datesProcessed: number;
  tenantsProcessed: number;
}

// ── Table name constant ──────────────────────────────────────────

const COST_TABLE = 'semantic_eval_cost_daily';

// ── computeQueryCost (pure function) ─────────────────────────────

export function computeQueryCost(
  tokensInput: number,
  tokensOutput: number,
  model: string,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const inputCost = (tokensInput / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (tokensOutput / 1_000_000) * pricing.outputPerMTok;
  // Round to 8 decimal places to avoid floating point noise
  return Math.round((inputCost + outputCost) * 100_000_000) / 100_000_000;
}

// ── aggregateCostDaily ───────────────────────────────────────────
// Aggregates daily costs from eval turns into the cost_daily table.
// Uses MODEL_PRICING to compute cost from token counts.

export async function aggregateCostDaily(
  options: { tenantId?: string; dateRange?: { start: string; end: string } } = {},
): Promise<AggregationResult> {
  const { tenantId, dateRange } = options;

  const tenantFilter = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
  const dateFilter = dateRange
    ? sql`AND DATE(created_at) BETWEEN ${dateRange.start}::DATE AND ${dateRange.end}::DATE`
    : sql`AND DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'`;

  // Build a CASE expression for model pricing using known models
  // We compute cost server-side with SQL CASE for each known model
  const pricingCase = buildPricingCaseExpression();

  await db.execute(
    sql`INSERT INTO ${sql.raw(COST_TABLE)} (
      id, tenant_id, business_date,
      total_turns, total_tokens_input, total_tokens_output,
      total_cost, avg_cost_per_query,
      model_breakdown, created_at
    )
    SELECT
      gen_ulid() AS id,
      tenant_id,
      DATE(created_at) AS business_date,
      COUNT(*) AS total_turns,
      COALESCE(SUM(llm_tokens_input), 0) AS total_tokens_input,
      COALESCE(SUM(llm_tokens_output), 0) AS total_tokens_output,
      COALESCE(SUM(${sql.raw(pricingCase)}), 0)::NUMERIC(12,8) AS total_cost,
      (COALESCE(SUM(${sql.raw(pricingCase)}), 0) / NULLIF(COUNT(*), 0))::NUMERIC(12,8) AS avg_cost_per_query,
      jsonb_agg(DISTINCT jsonb_build_object(
        'model', COALESCE(llm_model, 'unknown'),
        'turns', 1,
        'tokens', COALESCE(llm_tokens_input, 0) + COALESCE(llm_tokens_output, 0)
      )) AS model_breakdown,
      NOW() AS created_at
    FROM semantic_eval_turns
    WHERE llm_tokens_input IS NOT NULL
      ${tenantFilter}
      ${dateFilter}
    GROUP BY tenant_id, DATE(created_at)
    ON CONFLICT (tenant_id, business_date) DO UPDATE SET
      total_turns = EXCLUDED.total_turns,
      total_tokens_input = EXCLUDED.total_tokens_input,
      total_tokens_output = EXCLUDED.total_tokens_output,
      total_cost = EXCLUDED.total_cost,
      avg_cost_per_query = EXCLUDED.avg_cost_per_query,
      model_breakdown = EXCLUDED.model_breakdown`,
  );

  // Return count of processed dates/tenants
  const result = await db.execute<{ dates: string; tenants: string }>(
    sql`SELECT
      COUNT(DISTINCT business_date) AS dates,
      COUNT(DISTINCT tenant_id) AS tenants
    FROM ${sql.raw(COST_TABLE)}
    WHERE 1=1 ${tenantFilter}`,
  );

  const rows = Array.from(result as Iterable<{ dates: string; tenants: string }>);
  const row = rows[0];

  return {
    datesProcessed: row ? parseInt(row.dates, 10) : 0,
    tenantsProcessed: row ? parseInt(row.tenants, 10) : 0,
  };
}

// ── getCostDashboard ─────────────────────────────────────────────

export async function getCostDashboard(
  tenantId: string | null,
  dateRange: { start: string; end: string },
): Promise<CostDashboardData> {
  const tenantFilter = tenantId
    ? sql`AND tenant_id = ${tenantId}`
    : sql``;

  const pricingCase = buildPricingCaseExpression();

  // Summary metrics from raw turns (more accurate than pre-aggregated)
  const summaryRows = await db.execute<{
    total_cost: string;
    total_tokens: string;
    total_turns: string;
  }>(
    sql`SELECT
      COALESCE(SUM(${sql.raw(pricingCase)}), 0)::NUMERIC(12,8) AS total_cost,
      COALESCE(SUM(COALESCE(llm_tokens_input, 0) + COALESCE(llm_tokens_output, 0)), 0) AS total_tokens,
      COUNT(*) AS total_turns
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND llm_tokens_input IS NOT NULL
      ${tenantFilter}`,
  );

  const summary = Array.from(summaryRows as Iterable<{
    total_cost: string;
    total_tokens: string;
    total_turns: string;
  }>)[0];

  const totalCost = summary ? Number(summary.total_cost) : 0;
  const totalTokens = summary ? parseInt(summary.total_tokens, 10) : 0;
  const totalTurns = summary ? parseInt(summary.total_turns, 10) : 0;

  // Cost trend by date
  const trendRows = await db.execute<{
    date: string;
    cost: string;
    turns: string;
  }>(
    sql`SELECT
      DATE(created_at) AS date,
      COALESCE(SUM(${sql.raw(pricingCase)}), 0)::NUMERIC(12,8) AS cost,
      COUNT(*) AS turns
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND llm_tokens_input IS NOT NULL
      ${tenantFilter}
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at)`,
  );

  // Model breakdown
  const modelRows = await db.execute<{
    model: string;
    cost: string;
    turns: string;
    tokens: string;
  }>(
    sql`SELECT
      COALESCE(llm_model, 'unknown') AS model,
      COALESCE(SUM(${sql.raw(pricingCase)}), 0)::NUMERIC(12,8) AS cost,
      COUNT(*) AS turns,
      COALESCE(SUM(COALESCE(llm_tokens_input, 0) + COALESCE(llm_tokens_output, 0)), 0) AS tokens
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND llm_tokens_input IS NOT NULL
      ${tenantFilter}
    GROUP BY llm_model
    ORDER BY cost DESC`,
  );

  // Lens cost breakdown
  const lensRows = await db.execute<{
    lens_id: string | null;
    cost: string;
    turns: string;
  }>(
    sql`SELECT
      narrative_lens_id AS lens_id,
      COALESCE(SUM(${sql.raw(pricingCase)}), 0)::NUMERIC(12,8) AS cost,
      COUNT(*) AS turns
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND llm_tokens_input IS NOT NULL
      ${tenantFilter}
    GROUP BY narrative_lens_id
    ORDER BY cost DESC`,
  );

  // Top tenants (admin-only, no tenant filter)
  const topTenantRows = tenantId
    ? []
    : Array.from(
        (await db.execute<{
          tenant_id: string;
          cost: string;
          turns: string;
        }>(
          sql`SELECT
            tenant_id,
            COALESCE(SUM(${sql.raw(pricingCase)}), 0)::NUMERIC(12,8) AS cost,
            COUNT(*) AS turns
          FROM semantic_eval_turns
          WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
            AND llm_tokens_input IS NOT NULL
          GROUP BY tenant_id
          ORDER BY cost DESC
          LIMIT 20`,
        )) as Iterable<{ tenant_id: string; cost: string; turns: string }>,
      );

  return {
    totalCost,
    totalTokens,
    avgCostPerQuery: totalTurns > 0 ? totalCost / totalTurns : 0,
    costTrend: Array.from(trendRows as Iterable<{ date: string; cost: string; turns: string }>).map(
      (r) => ({
        date: r.date,
        cost: Number(r.cost),
        turns: parseInt(r.turns, 10),
      }),
    ),
    modelBreakdown: Array.from(
      modelRows as Iterable<{ model: string; cost: string; turns: string; tokens: string }>,
    ).map((r) => ({
      model: r.model,
      cost: Number(r.cost),
      turns: parseInt(r.turns, 10),
      tokens: parseInt(r.tokens, 10),
    })),
    lensCostBreakdown: Array.from(
      lensRows as Iterable<{ lens_id: string | null; cost: string; turns: string }>,
    ).map((r) => ({
      lensId: r.lens_id,
      cost: Number(r.cost),
      turns: parseInt(r.turns, 10),
    })),
    topTenants: topTenantRows.map((r) => ({
      tenantId: r.tenant_id,
      cost: Number(r.cost),
      turns: parseInt(r.turns, 10),
    })),
  };
}

// ── getCostByTenant ──────────────────────────────────────────────

export async function getCostByTenant(
  dateRange: { start: string; end: string },
): Promise<TenantCostRow[]> {
  const pricingCase = buildPricingCaseExpression();

  const rows = await db.execute<{
    tenant_id: string;
    total_cost: string;
    total_turns: string;
    avg_cost: string;
  }>(
    sql`SELECT
      tenant_id,
      COALESCE(SUM(${sql.raw(pricingCase)}), 0)::NUMERIC(12,8) AS total_cost,
      COUNT(*) AS total_turns,
      (COALESCE(SUM(${sql.raw(pricingCase)}), 0) / NULLIF(COUNT(*), 0))::NUMERIC(12,8) AS avg_cost
    FROM semantic_eval_turns
    WHERE created_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
      AND llm_tokens_input IS NOT NULL
    GROUP BY tenant_id
    ORDER BY total_cost DESC`,
  );

  return Array.from(
    rows as Iterable<{
      tenant_id: string;
      total_cost: string;
      total_turns: string;
      avg_cost: string;
    }>,
  ).map((r) => ({
    tenantId: r.tenant_id,
    totalCost: Number(r.total_cost),
    totalTurns: parseInt(r.total_turns, 10),
    avgCost: Number(r.avg_cost),
  }));
}

// ── getCostProjection ────────────────────────────────────────────

export async function getCostProjection(
  tenantId?: string,
): Promise<CostProjection> {
  const tenantFilter = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
  const pricingCase = buildPricingCaseExpression();

  // Get daily costs for the last 30 days
  const rows = await db.execute<{
    date: string;
    daily_cost: string;
  }>(
    sql`SELECT
      DATE(created_at) AS date,
      COALESCE(SUM(${sql.raw(pricingCase)}), 0)::NUMERIC(12,8) AS daily_cost
    FROM semantic_eval_turns
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      AND llm_tokens_input IS NOT NULL
      ${tenantFilter}
    GROUP BY DATE(created_at)
    ORDER BY DATE(created_at)`,
  );

  const dailyCosts = Array.from(
    rows as Iterable<{ date: string; daily_cost: string }>,
  ).map((r) => Number(r.daily_cost));

  if (dailyCosts.length === 0) {
    return {
      projectedMonthlyCost: 0,
      trend: 'stable',
      avgDailyCost: 0,
      peakDayCost: 0,
    };
  }

  const avgDailyCost =
    dailyCosts.reduce((sum, c) => sum + c, 0) / dailyCosts.length;
  const peakDayCost = Math.max(...dailyCosts);
  const projectedMonthlyCost = avgDailyCost * 30;

  // Determine trend using first half vs second half comparison
  const midpoint = Math.floor(dailyCosts.length / 2);
  const firstHalf = dailyCosts.slice(0, midpoint);
  const secondHalf = dailyCosts.slice(midpoint);

  const firstHalfAvg =
    firstHalf.length > 0
      ? firstHalf.reduce((sum, c) => sum + c, 0) / firstHalf.length
      : 0;
  const secondHalfAvg =
    secondHalf.length > 0
      ? secondHalf.reduce((sum, c) => sum + c, 0) / secondHalf.length
      : 0;

  const changePct =
    firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

  let trend: CostProjection['trend'] = 'stable';
  if (changePct > 10) {
    trend = 'increasing';
  } else if (changePct < -10) {
    trend = 'decreasing';
  }

  return {
    projectedMonthlyCost: Math.round(projectedMonthlyCost * 100) / 100,
    trend,
    avgDailyCost: Math.round(avgDailyCost * 100_000_000) / 100_000_000,
    peakDayCost: Math.round(peakDayCost * 100_000_000) / 100_000_000,
  };
}

// ── Internal helpers ─────────────────────────────────────────────

/**
 * Builds a SQL CASE expression that computes per-row cost based on model name.
 * Returns raw SQL string for embedding in queries.
 *
 * SAFETY: All interpolated values come from the hardcoded MODEL_PRICING constant above.
 * No user input is ever interpolated. Model names and pricing numbers are static.
 */
function buildPricingCaseExpression(): string {
  const cases = Object.entries(MODEL_PRICING)
    .map(
      ([model, pricing]) =>
        `WHEN llm_model = '${model}' THEN ` +
        `(COALESCE(llm_tokens_input, 0)::NUMERIC / 1000000.0 * ${pricing.inputPerMTok}) + ` +
        `(COALESCE(llm_tokens_output, 0)::NUMERIC / 1000000.0 * ${pricing.outputPerMTok})`,
    )
    .join(' ');

  // Default pricing for unknown models
  return (
    `CASE ${cases} ELSE ` +
    `(COALESCE(llm_tokens_input, 0)::NUMERIC / 1000000.0 * ${DEFAULT_PRICING.inputPerMTok}) + ` +
    `(COALESCE(llm_tokens_output, 0)::NUMERIC / 1000000.0 * ${DEFAULT_PRICING.outputPerMTok}) END`
  );
}
