import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Daily quality aggregation ───────────────────────────────────
// Computes semantic_eval_quality_daily from semantic_eval_turns.
// Uses the same upsert-by-natural-key pattern as existing rm_ tables.
// Safe to run multiple times (idempotent via ON CONFLICT DO UPDATE).

export interface AggregationOptions {
  tenantId?: string;    // null = aggregate all tenants
  dateRange?: { start: string; end: string };
}

export interface AggregationResult {
  datesProcessed: number;
  tenantsProcessed: number;
}

export async function aggregateQualityDaily(
  options: AggregationOptions = {},
): Promise<AggregationResult> {
  const { tenantId, dateRange } = options;

  const tenantFilter = tenantId ? sql`AND tenant_id = ${tenantId}` : sql``;
  const dateFilter = dateRange
    ? sql`AND DATE(created_at) BETWEEN ${dateRange.start}::DATE AND ${dateRange.end}::DATE`
    : sql`AND DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'`;

  // Aggregate per tenant per day and upsert
  await db.execute(
    sql`INSERT INTO semantic_eval_quality_daily (
      id,
      tenant_id,
      business_date,
      total_turns,
      avg_user_rating,
      avg_admin_score,
      avg_confidence,
      avg_execution_time_ms,
      clarification_rate,
      error_rate,
      hallucination_rate,
      cache_hit_rate,
      top_failure_reasons,
      rating_distribution,
      created_at
    )
    SELECT
      gen_ulid() as id,
      tenant_id,
      DATE(created_at) as business_date,
      COUNT(*) as total_turns,
      AVG(user_rating)::NUMERIC(3,2) as avg_user_rating,
      AVG(admin_score)::NUMERIC(3,2) as avg_admin_score,
      AVG(llm_confidence)::NUMERIC(3,2) as avg_confidence,
      AVG(execution_time_ms)::INTEGER as avg_execution_time_ms,
      (COUNT(*) FILTER (WHERE was_clarification = TRUE)::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as clarification_rate,
      (COUNT(*) FILTER (WHERE execution_error IS NOT NULL)::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as error_rate,
      (COUNT(*) FILTER (WHERE admin_verdict = 'hallucination')::NUMERIC / NULLIF(COUNT(*), 0) * 100)::NUMERIC(5,2) as hallucination_rate,
      (COUNT(*) FILTER (WHERE cache_status = 'HIT')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE cache_status IS NOT NULL), 0) * 100)::NUMERIC(5,2) as cache_hit_rate,
      NULL::JSONB as top_failure_reasons,
      jsonb_build_object(
        '1', COUNT(*) FILTER (WHERE user_rating = 1),
        '2', COUNT(*) FILTER (WHERE user_rating = 2),
        '3', COUNT(*) FILTER (WHERE user_rating = 3),
        '4', COUNT(*) FILTER (WHERE user_rating = 4),
        '5', COUNT(*) FILTER (WHERE user_rating = 5)
      ) as rating_distribution,
      NOW() as created_at
    FROM semantic_eval_turns
    WHERE 1=1
      ${tenantFilter}
      ${dateFilter}
    GROUP BY tenant_id, DATE(created_at)
    ON CONFLICT (tenant_id, business_date) DO UPDATE SET
      total_turns = EXCLUDED.total_turns,
      avg_user_rating = EXCLUDED.avg_user_rating,
      avg_admin_score = EXCLUDED.avg_admin_score,
      avg_confidence = EXCLUDED.avg_confidence,
      avg_execution_time_ms = EXCLUDED.avg_execution_time_ms,
      clarification_rate = EXCLUDED.clarification_rate,
      error_rate = EXCLUDED.error_rate,
      hallucination_rate = EXCLUDED.hallucination_rate,
      cache_hit_rate = EXCLUDED.cache_hit_rate,
      rating_distribution = EXCLUDED.rating_distribution`,
  );

  // Get count of processed rows for reporting
  const result = await db.execute<{ dates: string; tenants: string }>(
    sql`SELECT
      COUNT(DISTINCT business_date) as dates,
      COUNT(DISTINCT tenant_id) as tenants
    FROM semantic_eval_quality_daily
    WHERE 1=1 ${tenantFilter}`,
  );

  const rows = Array.from(result as Iterable<{ dates: string; tenants: string }>);
  const row = rows[0];

  return {
    datesProcessed: row ? parseInt(row.dates, 10) : 0,
    tenantsProcessed: row ? parseInt(row.tenants, 10) : 0,
  };
}
