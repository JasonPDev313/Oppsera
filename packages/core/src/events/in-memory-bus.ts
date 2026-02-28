import { EventEnvelopeSchema } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';
import { eq, and } from 'drizzle-orm';
import { db, processedEvents, eventDeadLetters, guardedQuery } from '@oppsera/db';
import type { EventBus, EventHandler } from './bus';

interface NamedHandler {
  handler: EventHandler;
  consumerName: string;
}

const HANDLER_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_HANDLERS = 10;

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, NamedHandler[]>();
  private patternHandlers = new Map<string, NamedHandler[]>();
  private deadLetterQueue: Array<{
    event: EventEnvelope;
    error: Error;
    failedAt: string;
  }> = [];
  private maxRetries = 3;
  private running = false;

  subscribe(eventType: string, handler: EventHandler, consumerName?: string): void {
    const existing = this.handlers.get(eventType) || [];
    const name = consumerName ?? `${eventType}:handler_${existing.length}`;
    existing.push({ handler, consumerName: name });
    this.handlers.set(eventType, existing);
  }

  subscribePattern(pattern: string, handler: EventHandler, consumerName?: string): void {
    const existing = this.patternHandlers.get(pattern) || [];
    const name = consumerName ?? `${pattern}:handler_${existing.length}`;
    existing.push({ handler, consumerName: name });
    this.patternHandlers.set(pattern, existing);
  }

  async publish(event: EventEnvelope): Promise<void> {
    EventEnvelopeSchema.parse(event);

    const handlers = this.getMatchingHandlers(event.eventType);

    // Process handlers with concurrency limit to avoid overwhelming the DB pool
    for (let i = 0; i < handlers.length; i += MAX_CONCURRENT_HANDLERS) {
      const batch = handlers.slice(i, i + MAX_CONCURRENT_HANDLERS);
      const promises = batch.map(({ handler, consumerName }) =>
        this.dispatchWithRetry(event, handler, consumerName),
      );
      await Promise.allSettled(promises);
    }
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
    for (const entry of exact) {
      result.push(entry);
    }

    for (const [pattern, handlers] of this.patternHandlers) {
      if (this.matchPattern(pattern, eventType)) {
        for (const entry of handlers) {
          result.push(entry);
        }
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
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            handler(event),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error(`Handler timeout after ${HANDLER_TIMEOUT_MS}ms`)), HANDLER_TIMEOUT_MS);
            }),
          ]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
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
          const err = error instanceof Error ? error : new Error(String(error));

          // Keep in-memory queue for backward compat
          this.deadLetterQueue.push({
            event,
            error: err,
            failedAt: new Date().toISOString(),
          });

          // Persist to DB (best-effort — don't let DLQ insert failure crash the bus)
          try {
            await this.persistDeadLetter(event, consumerName, err, this.maxRetries);
          } catch (dlqErr) {
            console.error('Failed to persist dead letter to DB:', dlqErr);
          }

          console.error(`Event moved to dead letter queue:`, {
            eventType: event.eventType,
            eventId: event.eventId,
            consumerName,
          });
        }
      }
    }
  }

  private async persistDeadLetter(
    event: EventEnvelope,
    consumerName: string,
    error: Error,
    maxRetries: number,
  ): Promise<void> {
    const tenantId = (event.data as Record<string, unknown>)?.tenantId as string | undefined;

    await guardedQuery('bus:persistDeadLetter', () =>
      db.insert(eventDeadLetters).values({
        id: generateUlid(),
        tenantId: tenantId ?? null,
        eventId: event.eventId,
        eventType: event.eventType,
        eventData: event as unknown as Record<string, unknown>,
        consumerName,
        errorMessage: error.message,
        errorStack: error.stack ?? null,
        attemptCount: maxRetries,
        maxRetries,
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
        status: 'failed',
      }),
    );
  }

  private async checkProcessed(
    eventId: string,
    consumerName: string,
  ): Promise<boolean> {
    const result = await guardedQuery('bus:checkProcessed', () =>
      db
        .select()
        .from(processedEvents)
        .where(
          and(
            eq(processedEvents.eventId, eventId),
            eq(processedEvents.consumerName, consumerName),
          ),
        )
        .limit(1),
    );
    return result.length > 0;
  }

  private async markProcessed(
    eventId: string,
    consumerName: string,
  ): Promise<void> {
    await guardedQuery('bus:markProcessed', () =>
      db
        .insert(processedEvents)
        .values({
          id: generateUlid(),
          eventId,
          consumerName,
          processedAt: new Date(),
        })
        .onConflictDoNothing(),
    );
  }
}
