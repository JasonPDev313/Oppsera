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
  private static readonly MAX_BACKOFF_MS = 30_000; // cap at 30s

  constructor(options: {
    eventBus: EventBus;
    pollIntervalMs?: number;
    batchSize?: number;
  }) {
    this.eventBus = options.eventBus;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.batchSize = options.batchSize ?? 50;
  }

  async start(): Promise<void> {
    this.running = true;
    console.log(
      `Outbox worker started (poll interval: ${this.pollIntervalMs}ms)`,
    );
    this.poll();
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
      const published = await this.processBatch();
      this.consecutiveErrors = 0;
      this.lastErrorMessage = '';
      const delay = published > 0 ? 0 : this.pollIntervalMs;
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
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
      const backoff = Math.min(
        this.pollIntervalMs * 10 * Math.pow(2, this.consecutiveErrors - 1),
        OutboxWorker.MAX_BACKOFF_MS,
      );
      this.pollTimer = setTimeout(() => this.poll(), backoff);
    } finally {
      this.processing = false;
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

    // Step 2: Process events OUTSIDE any transaction.
    // Event consumers can take 100ms+ each (DB writes, GL posting, etc.).
    // No connection is held idle during this work.
    let publishedCount = 0;
    const failedIds: string[] = [];

    for (const row of claimed) {
      try {
        const event = EventEnvelopeSchema.parse(row.payload);
        await this.eventBus.publish(event);
        publishedCount++;
      } catch (error) {
        console.error('Failed to publish outbox event:', {
          outboxId: row.id,
          eventType: row.event_type,
          eventId: row.event_id,
          error,
        });
        // Mark failed rows for unclaiming so they can be retried
        failedIds.push(row.id);
      }
    }

    // Step 3: Unclaim any rows that failed to publish so they can be retried.
    // Reset published_at to NULL so the next poll picks them up.
    if (failedIds.length > 0) {
      try {
        const idList = sql.join(failedIds.map(id => sql`${id}`), sql`, `);
        await db.execute(sql`
          UPDATE event_outbox
          SET published_at = NULL
          WHERE id IN (${idList})
        `);
      } catch (err) {
        // Best-effort unclaim — if this fails, rows stay "claimed" but
        // that's better than crashing the worker. They'll eventually be
        // picked up by the drain-jobs cron or manual intervention.
        console.error('[outbox] Failed to unclaim failed rows:', err);
      }
    }

    if (publishedCount > 0) {
      console.log(`Outbox worker published ${publishedCount} events`);
    }

    return publishedCount;
  }
}
