import { EventEnvelopeSchema } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';
import { eq, and } from 'drizzle-orm';
import { db, processedEvents } from '@oppsera/db';
import type { EventBus, EventHandler } from './bus';

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private patternHandlers = new Map<string, EventHandler[]>();
  private deadLetterQueue: Array<{
    event: EventEnvelope;
    error: Error;
    failedAt: string;
  }> = [];
  private maxRetries = 3;
  private running = false;

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  subscribePattern(pattern: string, handler: EventHandler): void {
    const existing = this.patternHandlers.get(pattern) || [];
    existing.push(handler);
    this.patternHandlers.set(pattern, existing);
  }

  async publish(event: EventEnvelope): Promise<void> {
    EventEnvelopeSchema.parse(event);

    const handlers = this.getMatchingHandlers(event.eventType);

    const promises = handlers.map(({ handler, consumerName }) =>
      this.dispatchWithRetry(event, handler, consumerName),
    );

    await Promise.allSettled(promises);
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }

  private getMatchingHandlers(
    eventType: string,
  ): Array<{ handler: EventHandler; consumerName: string }> {
    const result: Array<{ handler: EventHandler; consumerName: string }> = [];

    const exact = this.handlers.get(eventType) || [];
    exact.forEach((handler, i) => {
      result.push({ handler, consumerName: `${eventType}:handler_${i}` });
    });

    for (const [pattern, handlers] of this.patternHandlers) {
      if (this.matchPattern(pattern, eventType)) {
        handlers.forEach((handler, i) => {
          result.push({ handler, consumerName: `${pattern}:handler_${i}` });
        });
      }
    }

    return result;
  }

  private matchPattern(pattern: string, eventType: string): boolean {
    if (pattern.endsWith('.*')) {
      const domain = pattern.slice(0, -2);
      return eventType.startsWith(domain + '.');
    }
    return pattern === eventType;
  }

  private async dispatchWithRetry(
    event: EventEnvelope,
    handler: EventHandler,
    consumerName: string,
  ): Promise<void> {
    const alreadyProcessed = await this.checkProcessed(
      event.eventId,
      consumerName,
    );
    if (alreadyProcessed) return;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await handler(event);
        await this.markProcessed(event.eventId, consumerName);
        return;
      } catch (error) {
        console.error(
          `Event handler failed (attempt ${attempt}/${this.maxRetries}):`,
          {
            eventType: event.eventType,
            eventId: event.eventId,
            consumerName,
            error,
          },
        );

        if (attempt < this.maxRetries) {
          const delay = attempt * attempt * 100;
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          this.deadLetterQueue.push({
            event,
            error: error instanceof Error ? error : new Error(String(error)),
            failedAt: new Date().toISOString(),
          });
          console.error(`Event moved to dead letter queue:`, {
            eventType: event.eventType,
            eventId: event.eventId,
            consumerName,
          });
        }
      }
    }
  }

  private async checkProcessed(
    eventId: string,
    consumerName: string,
  ): Promise<boolean> {
    const result = await db
      .select()
      .from(processedEvents)
      .where(
        and(
          eq(processedEvents.eventId, eventId),
          eq(processedEvents.consumerName, consumerName),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  private async markProcessed(
    eventId: string,
    consumerName: string,
  ): Promise<void> {
    await db
      .insert(processedEvents)
      .values({
        id: generateUlid(),
        eventId,
        consumerName,
        processedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}
