import { EventEnvelopeSchema } from '@oppsera/shared';
import { db, sql } from '@oppsera/db';
import type { EventBus } from './bus';

export class OutboxWorker {
  private running = false;
  private processing = false;
  private pollIntervalMs: number;
  private batchSize: number;
  private eventBus: EventBus;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors = 0;
  private lastErrorMessage = '';
  private lastStaleRecoveryAt = 0;
  private static readonly MAX_BACKOFF_MS = 30_000; // cap at 30s
  private static readonly STALE_RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
  private static readonly STALE_CLAIM_THRESHOLD_MINUTES = 10;
  // Minimum delay between batches even when busy — prevents pool exhaustion
  // during high backlog (e.g., 600+ events released after stale recovery).
  private static readonly MIN_INTER_BATCH_MS = 200;
  // Max times an event can fail before being moved to dead letters
  private static readonly MAX_RETRY_COUNT = 3;
  // Delay before first poll on cold start — let API requests use the pool first
  private static readonly STARTUP_DELAY_MS = 2_000;

  constructor(options: {
    eventBus: EventBus;
    pollIntervalMs?: number;
    batchSize?: number;
  }) {
    this.eventBus = options.eventBus;
    // Vercel serverless: slow poll (5s) to minimize pool contention.
    // The drain-outbox cron job (every minute) is the primary driver.
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    // Vercel serverless: small batches (5) prevent pool exhaustion (max: 2).
    // Each event can trigger 10+ concurrent handler DB operations.
    this.batchSize = options.batchSize ?? 5;
  }

  async start(): Promise<void> {
    this.running = true;
    console.log(
      `Outbox worker started (poll interval: ${this.pollIntervalMs}ms, batch: ${this.batchSize})`,
    );
    // Delay first poll on cold start so API requests can use the pool.
    // On Vercel, the function was invoked by a user request — let that
    // request complete before the outbox worker starts consuming connections.
    this.pollTimer = setTimeout(() => this.poll(), OutboxWorker.STARTUP_DELAY_MS);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('Outbox worker stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    // Prevent overlapping polls (Vercel can freeze/unfreeze the event loop,
    // causing a previous poll to still be running when the timer fires)
    if (this.processing) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
      return;
    }

    try {
      this.processing = true;
      // Periodically recover stale claims — events that were claimed
      // (published_at set) but never actually processed. This happens
      // when a Vercel instance claims a batch then gets frozen/killed.
      await this.recoverStaleClaims();
      const published = await this.processBatch();
      this.consecutiveErrors = 0;
      this.lastErrorMessage = '';
      // When events were published, use a breathing delay to prevent
      // nonstop pool hammering during high backlog recovery.
      // When idle, use the normal poll interval.
      const delay = published > 0 ? OutboxWorker.MIN_INTER_BATCH_MS : this.pollIntervalMs;
      this.pollTimer = setTimeout(() => this.poll(), delay);
    } catch (error) {
      this.consecutiveErrors++;
      const errMsg = error instanceof Error ? error.message : String(error);
      // Only log on first occurrence or when error message changes
      if (this.consecutiveErrors === 1 || errMsg !== this.lastErrorMessage) {
        console.error(`Outbox worker error (will retry with backoff): ${errMsg}`);
      } else if (this.consecutiveErrors === 5) {
        console.error(`Outbox worker: DB still unreachable after ${this.consecutiveErrors} attempts, suppressing further logs`);
      }
      this.lastErrorMessage = errMsg;
      // Exponential backoff: 5s, 10s, 20s, capped at 30s
      const backoff = Math.min(
        this.pollIntervalMs * Math.pow(2, this.consecutiveErrors - 1),
        OutboxWorker.MAX_BACKOFF_MS,
      );
      this.pollTimer = setTimeout(() => this.poll(), backoff);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Recover events that were claimed (published_at set) but never actually
   * delivered to consumers. This happens when a Vercel instance atomically
   * claims a batch via the CTE, then gets frozen/killed before processing.
   * The events sit with published_at != NULL forever — invisible to the
   * normal poll query (which filters WHERE published_at IS NULL).
   *
   * Events older than 1 hour are auto-deleted (stale beyond recovery).
   * Runs at most once every 5 minutes to avoid unnecessary queries.
   */
  private async recoverStaleClaims(): Promise<void> {
    const now = Date.now();
    if (now - this.lastStaleRecoveryAt < OutboxWorker.STALE_RECOVERY_INTERVAL_MS) {
      return;
    }
    this.lastStaleRecoveryAt = now;

    try {
      // First: delete events older than 1 hour — they're stale beyond recovery.
      // This prevents infinite backlog growth from frozen Vercel instances.
      const deleted = await db.execute(sql`
        DELETE FROM event_outbox
        WHERE created_at < NOW() - INTERVAL '1 hour'
        RETURNING id
      `) as unknown as Array<{ id: string }>;

      if (deleted.length > 0) {
        console.warn(`[outbox] Purged ${deleted.length} event(s) older than 1 hour`);
      }

      // Then: recover stale claims (claimed > 10 min ago but not yet processed).
      // Uses a simple time-based check instead of scanning processed_events.
      // Events that repeatedly fail will be caught by the 1-hour purge above.
      const result = await db.execute(sql`
        UPDATE event_outbox
        SET published_at = NULL
        WHERE published_at IS NOT NULL
          AND published_at < NOW() - INTERVAL '${sql.raw(String(OutboxWorker.STALE_CLAIM_THRESHOLD_MINUTES))} minutes'
        RETURNING id
      `) as unknown as Array<{ id: string }>;

      if (result.length > 0) {
        console.warn(`[outbox] Recovered ${result.length} stale claimed event(s) for reprocessing`);
      }
    } catch (err) {
      // Best-effort — don't crash the worker over stale recovery
      console.error('[outbox] Stale claim recovery failed:', err);
    }
  }

  async processBatch(): Promise<number> {
    // CRITICAL: Do NOT hold a transaction open during event publishing.
    // On Vercel serverless, the Node.js event loop can be frozen after an HTTP
    // response is sent. If frozen mid-transaction, the connection stays in
    // "idle in transaction" state indefinitely, holding FOR UPDATE locks and
    // exhausting the connection pool (max: 2). This caused a production outage
    // on 2026-02-27 where stuck outbox transactions blocked all DB access.
    //
    // Fix: Use a CTE to atomically claim rows (UPDATE ... RETURNING) in a
    // single statement — no long-held transaction. Then process events outside
    // the transaction so Vercel freezes can't leave connections stuck.

    // Step 1: Atomically claim rows — UPDATE + RETURNING in one statement.
    // FOR UPDATE SKIP LOCKED prevents duplicate processing across instances.
    // The transaction commits immediately after this single statement.
    const claimed = await db.execute(sql`
      WITH batch AS (
        SELECT id
        FROM event_outbox
        WHERE published_at IS NULL
        ORDER BY created_at ASC
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE event_outbox
      SET published_at = NOW()
      FROM batch
      WHERE event_outbox.id = batch.id
      RETURNING event_outbox.id, event_outbox.payload, event_outbox.event_type, event_outbox.event_id
    `) as unknown as Array<{ id: string; payload: unknown; event_type: string; event_id: string }>;

    if (claimed.length === 0) return 0;

    // Step 2: Process events OUTSIDE any transaction — one at a time.
    // Event consumers can take 100ms+ each (DB writes, GL posting, etc.).
    // No connection is held idle during this work.
    let publishedCount = 0;
    const deleteIds: string[] = [];

    for (const row of claimed) {
      try {
        const event = EventEnvelopeSchema.parse(row.payload);
        await this.eventBus.publish(event);
        publishedCount++;
        // Successfully processed — delete from outbox
        deleteIds.push(row.id);
      } catch (error) {
        console.error('Failed to publish outbox event:', {
          outboxId: row.id,
          eventType: row.event_type,
          eventId: row.event_id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Leave it claimed — stale recovery will pick it up after 10 min.
        // The 1-hour purge prevents infinite retry loops.
      }
    }

    // Step 3: Delete successfully processed events from outbox.
    // This is the key difference from the old approach: we DELETE on success
    // instead of leaving them forever. Prevents outbox table bloat.
    if (deleteIds.length > 0) {
      try {
        const idList = sql.join(deleteIds.map(id => sql`${id}`), sql`, `);
        await db.execute(sql`DELETE FROM event_outbox WHERE id IN (${idList})`);
      } catch (err) {
        // Best-effort — if delete fails, events stay claimed (harmless)
        console.error('[outbox] Failed to delete processed events:', err);
      }
    }

    if (publishedCount > 0) {
      console.log(`Outbox worker published ${publishedCount} events`);
    }

    return publishedCount;
  }
}
