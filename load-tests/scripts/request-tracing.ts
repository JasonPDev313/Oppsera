/**
 * Request Tracing Enhancement for withTenant
 *
 * Adds SQL-level request tracing via Postgres session variables.
 * Enables correlating k6 requests with pg_stat_statements entries.
 *
 * Integration:
 *   Update packages/db/src/client.ts withTenant() to call setRequestTracing()
 *   inside the transaction, after set_config for tenant_id.
 *
 * Example withTenant update:
 *
 *   export async function withTenant<T>(
 *     tenantId: string,
 *     callback: (tx: Database) => Promise<T>,
 *     options?: { requestId?: string; source?: string }
 *   ): Promise<T> {
 *     return db.transaction(async (tx) => {
 *       await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
 *       if (options?.requestId) {
 *         await setRequestTracing(tx, options.requestId, options.source);
 *       }
 *       return callback(tx as unknown as Database);
 *     });
 *   }
 */

import { sql } from 'drizzle-orm';

/**
 * Set request tracing context in the current Postgres transaction.
 * These appear in pg_stat_activity.application_name and can be
 * correlated with k6's X-Request-Id header.
 *
 * @param tx - Drizzle transaction handle
 * @param requestId - X-Request-Id from the HTTP request
 * @param source - Request source (e.g., 'k6', 'web', 'api')
 */
export async function setRequestTracing(
  tx: any,
  requestId: string,
  source?: string,
): Promise<void> {
  // Set request ID as a session variable (visible in pg_stat_activity)
  await tx.execute(
    sql`SELECT set_config('app.request_id', ${requestId}, true)`,
  );

  // Optionally set source
  if (source) {
    await tx.execute(
      sql`SELECT set_config('app.request_source', ${source}, true)`,
    );
  }

  // Set application_name to include request ID for easier debugging
  // This is visible in pg_stat_activity without custom config
  const appName = source
    ? `oppsera:${source}:${requestId.slice(0, 12)}`
    : `oppsera:${requestId.slice(0, 20)}`;

  await tx.execute(
    sql`SET LOCAL application_name = ${appName}`,
  );
}

/**
 * SQL to query active requests with tracing info.
 * Useful for debugging connection pool issues during load tests.
 *
 * Run in psql:
 *   SELECT * FROM v_active_requests;
 */
export const CREATE_TRACING_VIEW = `
CREATE OR REPLACE VIEW v_active_requests AS
SELECT
  pid,
  application_name,
  current_setting('app.current_tenant_id', true) AS tenant_id,
  current_setting('app.request_id', true) AS request_id,
  current_setting('app.request_source', true) AS source,
  state,
  wait_event_type,
  wait_event,
  LEFT(query, 100) AS query_preview,
  now() - query_start AS query_duration,
  now() - xact_start AS xact_duration
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid != pg_backend_pid()
ORDER BY query_start DESC;
`;
