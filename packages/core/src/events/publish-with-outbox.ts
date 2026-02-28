import type { EventEnvelope } from '@oppsera/shared';
import { db, sql, guardedQuery } from '@oppsera/db';
import type { Database } from '@oppsera/db';
import type { RequestContext } from '../auth/context';
import { getOutboxWriter } from './index';

/**
 * Write events to the outbox within an existing transaction.
 * Unlike `publishWithOutbox`, this does NOT set RLS `set_config` or open a
 * transaction — the caller is responsible for both.  This decouples event
 * publishing from tenant-RLS infrastructure so modules remain independently
 * extractable to microservices.
 */
export async function publishEventsOnly(
  tx: Database,
  events: EventEnvelope[],
): Promise<void> {
  const outboxWriter = getOutboxWriter();
  for (const event of events) {
    await outboxWriter.writeEvent(tx, event);
  }
}

export async function publishWithOutbox<T>(
  ctx: RequestContext,
  operation: (tx: Database) => Promise<{
    result: T;
    events: EventEnvelope[];
  }>,
): Promise<T> {
  const outboxWriter = getOutboxWriter();

  // Wrap in guardedQuery so the POS hot path gets:
  // - Concurrency limiting (semaphore prevents pool oversubscription)
  // - Circuit breaker (fail-fast for 10s after pool exhaustion errors)
  // - Per-query timeout (15s Promise.race releases semaphore even if connection is stuck)
  // Previously this called db.transaction() directly, completely bypassing pool protection.
  return guardedQuery('publishWithOutbox', () =>
    db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;

      // Defense-in-depth: SET LOCAL statement_timeout inside the transaction.
      // If Vercel freezes the event loop mid-transaction, Postgres will kill the
      // statement after 15s (vs the database-level 30s default). The guardedQuery
      // Promise.race timeout (15s) is the primary defense; this is the backup.
      await tx.execute(sql`SET LOCAL statement_timeout = '15000'`);

      // Combine set_config calls into a single SQL statement to save a round-trip
      if (ctx.locationId) {
        await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true), set_config('app.current_location_id', ${ctx.locationId}, true)`);
      } else {
        await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`);
      }

      const { result, events } = await operation(txDb);

      for (const event of events) {
        await outboxWriter.writeEvent(txDb, event);
      }

      return result;
    }),
  );
}
