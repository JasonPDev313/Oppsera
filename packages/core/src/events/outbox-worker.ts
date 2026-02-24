import { EventEnvelopeSchema } from '@oppsera/shared';
import { db, sql } from '@oppsera/db';
import type { EventBus } from './bus';

export class OutboxWorker {
  private running = false;
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

    try {
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
    }
  }

  async processBatch(): Promise<number> {
    // Use FOR UPDATE SKIP LOCKED inside a transaction to prevent duplicate
    // publishes when multiple workers (or Vercel instances) run concurrently.
    return db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`
        SELECT id, payload, event_type, event_id
        FROM event_outbox
        WHERE published_at IS NULL
        ORDER BY created_at ASC
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      `) as unknown as Array<{ id: string; payload: unknown; event_type: string; event_id: string }>;

      if (claimed.length === 0) return 0;

      let publishedCount = 0;
      const publishedIds: string[] = [];

      for (const row of claimed) {
        try {
          const event = EventEnvelopeSchema.parse(row.payload);
          await this.eventBus.publish(event);
          publishedIds.push(row.id);
          publishedCount++;
        } catch (error) {
          console.error('Failed to publish outbox event:', {
            outboxId: row.id,
            eventType: row.event_type,
            eventId: row.event_id,
            error,
          });
        }
      }

      // Batch-mark all successfully published rows in a single UPDATE
      if (publishedIds.length > 0) {
        const idList = sql.join(publishedIds.map(id => sql`${id}`), sql`, `);
        await tx.execute(sql`
          UPDATE event_outbox
          SET published_at = NOW()
          WHERE id IN (${idList})
        `);
      }

      if (publishedCount > 0) {
        console.log(`Outbox worker published ${publishedCount} events`);
      }

      return publishedCount;
    });
  }
}
