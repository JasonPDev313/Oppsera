import postgres from 'postgres';
import type { CompiledQuery } from '../compiler/types';
import type { QueryResult } from './types';
import { ExecutionError } from './types';

// ── Constants ─────────────────────────────────────────────────────

const DEFAULT_EXECUTION_TIMEOUT_MS = 30_000; // 30s

// ── postgres.js singleton ─────────────────────────────────────────
// Uses a dedicated postgres.js connection (not the shared Drizzle client)
// so we can use tx.unsafe() for $N positional parameters from compiled SQL,
// and tx.unsafe() for SET LOCAL which doesn't support parameterized values
// in PostgreSQL's extended query protocol.

const globalForExec = globalThis as unknown as { __semantic_exec_pg?: postgres.Sql };

function getExecPg(): postgres.Sql {
  if (!globalForExec.__semantic_exec_pg) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    globalForExec.__semantic_exec_pg = postgres(url, {
      max: 2,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 300,
    });
  }
  return globalForExec.__semantic_exec_pg;
}

// ── Result fingerprint ────────────────────────────────────────────

interface ResultFingerprint {
  rowCount: number;
  minDate: string | null;
  maxDate: string | null;
  nullRate: number;
  columnCount: number;
}

function computeFingerprint(
  rows: Record<string, unknown>[],
): ResultFingerprint {
  const rowCount = rows.length;
  const columnCount = rowCount > 0 ? Object.keys(rows[0]!).length : 0;

  let totalCells = 0;
  let nullCells = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rows) {
    for (const [key, val] of Object.entries(row)) {
      totalCells++;
      if (val === null || val === undefined) {
        nullCells++;
      }
      // Track date range if we see date-like columns
      if (
        (key === 'date' || key.endsWith('_date') || key.endsWith('_at')) &&
        typeof val === 'string'
      ) {
        if (!minDate || val < minDate) minDate = val;
        if (!maxDate || val > maxDate) maxDate = val;
      }
    }
  }

  const nullRate = totalCells > 0 ? nullCells / totalCells : 0;

  return { rowCount, minDate, maxDate, nullRate, columnCount };
}

// ── Read model backfill ──────────────────────────────────────────
// When semantic queries return 0 rows from rm_* read model tables,
// the read models may simply not have been populated (e.g., seed data,
// consumers not yet run). This auto-backfill populates them from
// operational tables so subsequent queries return real data.
//
// Runs at most once per tenant per process lifetime.

const _backfilledTenants = new Set<string>();

async function ensureReadModelsPopulated(
  pg: postgres.Sql,
  tenantId: string,
  primaryTable: string,
): Promise<boolean> {
  // Only backfill for known read model tables
  if (!primaryTable.startsWith('rm_')) return false;

  // Skip if we already backfilled this tenant in this process
  if (_backfilledTenants.has(tenantId)) return false;

  try {
    const didBackfill = await pg.begin(async (tx) => {
      await tx.unsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // Check if rm_daily_sales has any rows for this tenant
      const [rmCheck] = await tx.unsafe(
        `SELECT 1 AS has_data FROM rm_daily_sales WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );
      if (rmCheck) return false; // read models already populated

      // Check if operational orders exist
      const [orderCheck] = await tx.unsafe(
        `SELECT 1 AS has_data FROM orders WHERE tenant_id = $1 AND status IN ('placed', 'paid') LIMIT 1`,
        [tenantId],
      );
      if (!orderCheck) return false; // no orders to backfill from

      console.log(`[semantic] Auto-backfilling read models for tenant ${tenantId}...`);

      // Backfill rm_daily_sales from orders + tenders (cents → dollars)
      await tx.unsafe(`
        DELETE FROM rm_daily_sales WHERE tenant_id = $1
      `, [tenantId]);

      await tx.unsafe(`
        WITH order_agg AS (
          SELECT
            tenant_id, location_id, business_date,
            count(*) FILTER (WHERE status IN ('placed', 'paid'))::int AS order_count,
            coalesce(sum(subtotal) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS gross_sales,
            coalesce(sum(discount_total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS discount_total,
            coalesce(sum(tax_total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS tax_total,
            coalesce(sum(total) FILTER (WHERE status IN ('placed', 'paid')), 0) / 100.0 AS net_sales,
            count(*) FILTER (WHERE status = 'voided')::int AS void_count,
            coalesce(sum(total) FILTER (WHERE status = 'voided'), 0) / 100.0 AS void_total
          FROM orders
          WHERE tenant_id = $1
            AND status IN ('placed', 'paid', 'voided')
            AND business_date IS NOT NULL
          GROUP BY tenant_id, location_id, business_date
        ),
        tender_agg AS (
          SELECT
            t.tenant_id, o.location_id, o.business_date,
            coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'cash' AND t.status = 'captured'), 0) / 100.0 AS tender_cash,
            coalesce(sum(t.amount) FILTER (WHERE t.tender_type = 'card' AND t.status = 'captured'), 0) / 100.0 AS tender_card
          FROM tenders t
          JOIN orders o ON o.id = t.order_id
          WHERE t.tenant_id = $1 AND t.status = 'captured' AND o.business_date IS NOT NULL
          GROUP BY t.tenant_id, o.location_id, o.business_date
        )
        INSERT INTO rm_daily_sales (
          id, tenant_id, location_id, business_date,
          order_count, gross_sales, discount_total, tax_total, net_sales,
          tender_cash, tender_card, void_count, void_total, avg_order_value, updated_at
        )
        SELECT
          gen_random_uuid()::text, oa.tenant_id, oa.location_id, oa.business_date,
          oa.order_count, oa.gross_sales, oa.discount_total, oa.tax_total, oa.net_sales,
          coalesce(ta.tender_cash, 0), coalesce(ta.tender_card, 0),
          oa.void_count, oa.void_total,
          CASE WHEN oa.order_count > 0 THEN oa.net_sales / oa.order_count ELSE 0 END,
          NOW()
        FROM order_agg oa
        LEFT JOIN tender_agg ta
          ON ta.tenant_id = oa.tenant_id
          AND ta.location_id = oa.location_id
          AND ta.business_date = oa.business_date
      `, [tenantId]);

      // Backfill rm_item_sales from order_lines (cents → dollars)
      await tx.unsafe(`
        DELETE FROM rm_item_sales WHERE tenant_id = $1
      `, [tenantId]);

      await tx.unsafe(`
        INSERT INTO rm_item_sales (
          id, tenant_id, location_id, business_date,
          catalog_item_id, catalog_item_name,
          quantity_sold, gross_revenue, quantity_voided, void_revenue, updated_at
        )
        SELECT
          gen_random_uuid()::text, ol.tenant_id, o.location_id, o.business_date,
          ol.catalog_item_id, max(ol.catalog_item_name),
          coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status IN ('placed', 'paid')), 0),
          coalesce(sum(ol.line_total) FILTER (WHERE o.status IN ('placed', 'paid')), 0) / 100.0,
          coalesce(sum(ol.qty::numeric) FILTER (WHERE o.status = 'voided'), 0),
          coalesce(sum(ol.line_total) FILTER (WHERE o.status = 'voided'), 0) / 100.0,
          NOW()
        FROM order_lines ol
        JOIN orders o ON o.id = ol.order_id
        WHERE ol.tenant_id = $1
          AND o.status IN ('placed', 'paid', 'voided')
          AND o.business_date IS NOT NULL
        GROUP BY ol.tenant_id, o.location_id, o.business_date, ol.catalog_item_id
      `, [tenantId]);

      console.log(`[semantic] Auto-backfill complete for tenant ${tenantId}`);
      return true;
    });

    _backfilledTenants.add(tenantId);
    return didBackfill;
  } catch (err) {
    console.warn('[semantic] Auto-backfill failed (non-blocking):', err);
    _backfilledTenants.add(tenantId); // don't retry on failure
    return false;
  }
}

// ── Executor ──────────────────────────────────────────────────────

export interface ExecuteOptions {
  tenantId: string;
  timeoutMs?: number;
}

export async function executeCompiledQuery(
  compiled: CompiledQuery,
  opts: ExecuteOptions,
): Promise<QueryResult> {
  const { tenantId, timeoutMs = DEFAULT_EXECUTION_TIMEOUT_MS } = opts;

  const startMs = Date.now();
  const pg = getExecPg();

  let rows: Record<string, unknown>[];
  try {
    const rawResult = await pg.begin(async (tx) => {
      // Set tenant context for RLS
      await tx.unsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // SET LOCAL does not support $N parameterized values in PostgreSQL's
      // extended query protocol — use unsafe() with a literal string value.
      await tx.unsafe(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);

      // Execute the compiled query. The compiler emits $N positional placeholders;
      // postgres.js unsafe() accepts (rawSql, params[]) natively.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return tx.unsafe(compiled.sql, compiled.params as any[]);
    });

    // postgres.js returns a RowList — convert to plain array
    rows = Array.from(rawResult as Iterable<Record<string, unknown>>);
  } catch (err) {
    const msg = String(err);
    if (
      msg.includes('statement timeout') ||
      msg.includes('canceling statement') ||
      msg.includes('query_canceled')
    ) {
      throw new ExecutionError(
        `Query timed out after ${timeoutMs}ms`,
        'QUERY_TIMEOUT',
      );
    }
    if (msg.includes('too many') || msg.includes('memory')) {
      throw new ExecutionError(
        `Query result too large: ${msg}`,
        'RESULT_TOO_LARGE',
      );
    }
    throw new ExecutionError(`Query execution failed: ${msg}`, 'QUERY_ERROR');
  }

  // If 0 rows from a read model table, check if read models need backfilling
  if (rows.length === 0 && compiled.primaryTable.startsWith('rm_')) {
    const didBackfill = await ensureReadModelsPopulated(pg, tenantId, compiled.primaryTable);
    if (didBackfill) {
      // Retry the original query after backfill
      try {
        const retryResult = await pg.begin(async (tx) => {
          await tx.unsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
          await tx.unsafe(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return tx.unsafe(compiled.sql, compiled.params as any[]);
        });
        rows = Array.from(retryResult as Iterable<Record<string, unknown>>);
        console.log(`[semantic] Retry after backfill returned ${rows.length} rows`);
      } catch {
        // If retry fails, continue with original 0 rows
      }
    }
  }

  const executionTimeMs = Date.now() - startMs;

  // The compiler already applied LIMIT — rowCount = rows in result
  const rowCount = rows.length;
  const truncated = rowCount >= (compiled.params[compiled.params.length - 1] as number);

  const fingerprint = computeFingerprint(rows);

  return {
    rows,
    rowCount,
    executionTimeMs,
    truncated,
    fingerprint: `${fingerprint.rowCount}:${fingerprint.columnCount}:${fingerprint.nullRate.toFixed(2)}`,
  };
}
