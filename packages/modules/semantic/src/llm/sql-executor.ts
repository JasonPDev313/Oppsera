import postgres from 'postgres';
import type { QueryResult } from './types';
import { ExecutionError } from './types';

// ── SQL Executor (Mode B) ────────────────────────────────────────
// Executes LLM-generated SQL with maximum safety:
//   1. RLS via set_config (tenant isolation)
//   2. Read-only transaction (SET LOCAL default_transaction_read_only)
//   3. Statement timeout (15s, tighter than metrics mode)
//   4. Single $1 param for tenant_id

const SQL_MODE_TIMEOUT_MS = 15_000; // 15s — tighter than metrics mode (30s)

// ── postgres.js singleton (shared with executor.ts) ──────────────

const globalForSqlExec = globalThis as unknown as { __semantic_exec_pg?: postgres.Sql };

function getExecPg(): postgres.Sql {
  if (!globalForSqlExec.__semantic_exec_pg) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    globalForSqlExec.__semantic_exec_pg = postgres(url, {
      max: 2,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 300,
    });
  }
  return globalForSqlExec.__semantic_exec_pg;
}

// ── Executor ─────────────────────────────────────────────────────

export interface SqlExecuteOptions {
  tenantId: string;
  timeoutMs?: number;
}

export async function executeSqlQuery(
  sql: string,
  opts: SqlExecuteOptions,
): Promise<QueryResult> {
  const { tenantId, timeoutMs = SQL_MODE_TIMEOUT_MS } = opts;
  const startMs = Date.now();
  const pg = getExecPg();

  let rows: Record<string, unknown>[];
  try {
    const rawResult = await pg.begin(async (tx) => {
      // Set tenant context for RLS
      await tx.unsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);

      // Read-only transaction — extra safety layer
      await tx.unsafe(`SET LOCAL default_transaction_read_only = on`);

      // Statement timeout
      await tx.unsafe(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);

      // Execute the LLM-generated SQL with tenant_id as $1
      return tx.unsafe(sql, [tenantId]);
    });

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
    if (msg.includes('cannot execute') && msg.includes('read-only')) {
      throw new ExecutionError(
        'Query attempted a write operation in read-only mode',
        'QUERY_ERROR',
      );
    }
    throw new ExecutionError(`Query execution failed: ${msg}`, 'QUERY_ERROR');
  }

  const executionTimeMs = Date.now() - startMs;
  const rowCount = rows.length;

  return {
    rows,
    rowCount,
    executionTimeMs,
    truncated: false, // LLM-generated SQL includes its own LIMIT
  };
}
