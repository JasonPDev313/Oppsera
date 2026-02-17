import { EventEnvelopeSchema } from '@oppsera/shared';
import { eq, isNull, asc } from 'drizzle-orm';
import { db, eventOutbox } from '@oppsera/db';
import type { EventBus } from './bus';

export class OutboxWorker {
  private running = false;
  private pollIntervalMs: number;
  private batchSize: number;
  private eventBus: EventBus;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

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
      const delay = published > 0 ? 0 : this.pollIntervalMs;
      this.pollTimer = setTimeout(() => this.poll(), delay);
    } catch (error) {
      console.error('Outbox worker error:', error);
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs * 10);
    }
  }

  async processBatch(): Promise<number> {
    const unpublished = await db
      .select()
      .from(eventOutbox)
      .where(isNull(eventOutbox.publishedAt))
      .orderBy(asc(eventOutbox.createdAt))
      .limit(this.batchSize);

    if (unpublished.length === 0) return 0;

    let publishedCount = 0;

    for (const row of unpublished) {
      try {
        const event = EventEnvelopeSchema.parse(row.payload);

        await this.eventBus.publish(event);

        await db
          .update(eventOutbox)
          .set({ publishedAt: new Date() })
          .where(eq(eventOutbox.id, row.id));

        publishedCount++;
      } catch (error) {
        console.error('Failed to publish outbox event:', {
          outboxId: row.id,
          eventType: row.eventType,
          eventId: row.eventId,
          error,
        });
      }
    }

    if (publishedCount > 0) {
      console.log(`Outbox worker published ${publishedCount} events`);
    }

    return publishedCount;
  }
}
