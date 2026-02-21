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
