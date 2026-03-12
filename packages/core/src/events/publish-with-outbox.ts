import type { EventEnvelope } from '@oppsera/shared';
import { EventEnvelopeSchema } from '@oppsera/shared';
import { db, sql, guardedQuery } from '@oppsera/db';
import type { Database } from '@oppsera/db';
import type { RequestContext } from '../auth/context';
import { getOutboxWriter, getEventBus } from './index';

/** Hard cap on events per publish — sanity guard against runaway loops */
const MAX_EVENTS_PER_PUBLISH = 50;

/** Max time (ms) to wait for inline dispatch before giving up (outbox will retry) */
const INLINE_DISPATCH_TIMEOUT_MS = 5_000;

/**
 * Detect PostgreSQL error 25001 ("SAVEPOINT can only be used in transaction blocks").
 * Supavisor transaction-mode pooler rejects SAVEPOINTs outside BEGIN...COMMIT.
 * Drizzle may occasionally issue SAVEPOINT instead of BEGIN due to session state.
 */
function isSavepointError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? '').toLowerCase();
  const code = (err as { code?: string })?.code;
  return (
    code === '25001' ||
    (msg.includes('savepoint') && msg.includes('transaction'))
  );
}

/**
 * Validate event array: schema conformance, tenant match, and cap.
 * Throws on first violation — fail loud so bugs surface in dev, not prod.
 */
function validateEvents(events: EventEnvelope[], tenantId: string): void {
  if (events.length > MAX_EVENTS_PER_PUBLISH) {
    throw new Error(
      `[publishWithOutbox] Event count ${events.length} exceeds cap of ${MAX_EVENTS_PER_PUBLISH}`,
    );
  }

  for (const event of events) {
    // Structural validation via Zod
    const parsed = EventEnvelopeSchema.safeParse(event);
    if (!parsed.success) {
      throw new Error(
        `[publishWithOutbox] Malformed event (${event.eventType ?? 'unknown'}): ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }

    // Tenant isolation — prevent cross-tenant event injection
    if (event.tenantId !== tenantId) {
      throw new Error(
        `[publishWithOutbox] Tenant mismatch: event.tenantId=${event.tenantId} vs ctx.tenantId=${tenantId}`,
      );
    }
  }
}

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
  if (events.length === 0) return;
  if (events.length > MAX_EVENTS_PER_PUBLISH) {
    throw new Error(
      `[publishEventsOnly] Event count ${events.length} exceeds cap of ${MAX_EVENTS_PER_PUBLISH}`,
    );
  }
  const outboxWriter = getOutboxWriter();
  await outboxWriter.writeEvents(tx, events);
}

/** Options for publishWithOutbox */
export interface PublishWithOutboxOptions {
  /**
   * When true, skip inline event dispatch and return a `dispatchEvents()` function
   * that the caller can schedule via `after()` from next/server.
   * Events are still durable in the outbox — the outbox worker is the safety net.
   *
   * Use this on POS hot paths where shaving 100-300ms matters.
   */
  deferDispatch?: boolean;
}

/** Result when deferDispatch is true */
export interface DeferredPublishResult<T> {
  result: T;
  /** Call this in next/server after() to dispatch events after the response */
  dispatchEvents: () => Promise<void>;
}

// Overload: deferDispatch = true → returns { result, dispatchEvents }
export function publishWithOutbox<T>(
  ctx: RequestContext,
  operation: (tx: Database) => Promise<{ result: T; events: EventEnvelope[] }>,
  options: PublishWithOutboxOptions & { deferDispatch: true },
): Promise<DeferredPublishResult<T>>;
// Overload: default → returns T
export function publishWithOutbox<T>(
  ctx: RequestContext,
  operation: (tx: Database) => Promise<{ result: T; events: EventEnvelope[] }>,
  options?: PublishWithOutboxOptions,
): Promise<T>;
// Implementation
export async function publishWithOutbox<T>(
  ctx: RequestContext,
  operation: (tx: Database) => Promise<{
    result: T;
    events: EventEnvelope[];
  }>,
  options?: PublishWithOutboxOptions,
): Promise<T | DeferredPublishResult<T>> {
  // ── Guard: tenantId must be present and non-empty ──────────
  // An empty tenantId would set RLS set_config to '' which bypasses
  // row-level security on every table — catastrophic data leak.
  if (!ctx.tenantId || typeof ctx.tenantId !== 'string' || ctx.tenantId.trim() === '') {
    throw new Error('[publishWithOutbox] ctx.tenantId is missing or empty — RLS bypass prevented');
  }

  const outboxWriter = getOutboxWriter();

  // Capture events from inside the transaction so we can dispatch them
  // immediately after commit (fast path). The outbox remains the durable
  // backup — the idempotency guard in InMemoryEventBus.dispatchWithRetry
  // prevents double execution when the outbox worker picks up the same event.
  let committedEvents: EventEnvelope[] = [];

  // Wrap in guardedQuery so the POS hot path gets:
  // - Concurrency limiting (semaphore prevents pool oversubscription)
  // - Circuit breaker (fail-fast for 10s after pool exhaustion errors)
  // - Per-query timeout (15s Promise.race releases semaphore even if connection is stuck)
  // Previously this called db.transaction() directly, completely bypassing pool protection.
  // Transaction body extracted for SAVEPOINT retry (see below).
  const runTransaction = () =>
    db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;

      // Defense-in-depth: SET LOCAL statement_timeout inside the transaction.
      // If Vercel freezes the event loop mid-transaction, Postgres will kill the
      // statement after the configured timeout (vs the database-level 30s default).
      // The guardedQuery Promise.race timeout is the primary defense; this is the backup.
      // Uses DB_QUERY_TIMEOUT env var so local dev (remote Supabase) can use a longer timeout.
      // SET doesn't accept parameterized values ($1) — must interpolate directly.
      // Sanitize to digits-only to prevent SQL injection.
      const stmtTimeout = (process.env.DB_QUERY_TIMEOUT || '15000').replace(/\D/g, '') || '15000';
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${stmtTimeout}`));

      // Combine set_config calls into a single SQL statement to save a round-trip
      if (ctx.locationId) {
        await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true), set_config('app.current_location_id', ${ctx.locationId}, true)`);
      } else {
        await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${ctx.tenantId}, true)`);
      }

      const { result, events } = await operation(txDb);

      // Validate event structure, tenant isolation, and cap before writing
      if (events.length > 0) {
        validateEvents(events, ctx.tenantId);
      }

      // Batch-insert events in a single query (saves 1 round-trip
      // per extra event — place-and-pay emits 2 events: order.placed + tender.recorded).
      if (events.length > 0) {
        await outboxWriter.writeEvents(txDb, events);
      }

      // Return events alongside result so they're captured AFTER commit
      // succeeds (see below). Previously `committedEvents = events` was set
      // here inside the callback — before Drizzle sends COMMIT. If COMMIT
      // failed, the outer variable held stale events.
      return { result, events };
    });

  // SAVEPOINT retry: Supavisor transaction-mode pooler rejects SAVEPOINTs
  // outside BEGIN...COMMIT blocks (Postgres error 25001). Drizzle can
  // occasionally issue SAVEPOINT instead of BEGIN when the connection/session
  // state is ambiguous (e.g., after inline event dispatch reuses a pool slot).
  // A single retry with a fresh guardedQuery slot forces a new connection.
  let txOut: { result: T; events: EventEnvelope[] };
  try {
    txOut = await guardedQuery('publishWithOutbox', runTransaction);
  } catch (err) {
    if (isSavepointError(err)) {
      // Brief delay lets Supavisor release the corrupted session slot back to the pool.
      // Without this, immediate retry often grabs the same session and fails identically.
      console.warn('[publishWithOutbox] SAVEPOINT error — retrying after backoff');
      await new Promise((r) => setTimeout(r, 50));
      txOut = await guardedQuery('publishWithOutbox:retry', runTransaction);
    } else {
      throw err;
    }
  }

  // Events captured AFTER commit succeeded — safe to dispatch
  const result = txOut.result;
  committedEvents = txOut.events;

  // ── Build dispatch closure ───────────────────────────────────────
  // Extracted so callers using deferDispatch can schedule it via after().
  const runDispatch = async () => {
    if (committedEvents.length === 0) return;
    const bus = getEventBus();
    const dispatchPromise = Promise.allSettled(
      committedEvents.map((event) =>
        bus.publish(event).catch((err) => {
          console.error(
            `[inline-dispatch] post-commit dispatch failed for ${event.eventType} (outbox will retry):`,
            err instanceof Error ? err.message : err,
          );
        }),
      ),
    );

    // Race against timeout — don't let slow consumers block.
    // Clear the timer when dispatch wins to avoid a misleading "Timed out" log.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn(
          `[inline-dispatch] Timed out after ${INLINE_DISPATCH_TIMEOUT_MS}ms — ${committedEvents.length} event(s) deferred to outbox worker`,
        );
        resolve();
      }, INLINE_DISPATCH_TIMEOUT_MS);
    });

    await Promise.race([
      dispatchPromise.finally(() => { if (timeoutId) clearTimeout(timeoutId); }),
      timeout,
    ]);
  };

  // ── Deferred dispatch mode ───────────────────────────────────────
  // When deferDispatch is true, skip inline dispatch and return a
  // dispatchEvents() function the caller can schedule via next/server
  // after(). Events are already durable in the outbox — the outbox
  // worker is the safety net if after() doesn't run.
  if (options?.deferDispatch) {
    return { result, dispatchEvents: runDispatch } satisfies DeferredPublishResult<T>;
  }

  // ── Inline dispatch (default) ────────────────────────────────────
  // Transaction committed → events are durable in the outbox.
  // Dispatch inline (awaited) so consumers complete within the request
  // lifecycle. This is critical on Vercel: fire-and-forget dispatch
  // races against function freeze. Awaiting adds ~100-300ms latency
  // but guarantees consumers (especially KDS ticket creation) complete.
  await runDispatch();

  return result;
}
