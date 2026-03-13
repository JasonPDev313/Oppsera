import { EventEnvelopeSchema } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';
import { db, sql, processedEvents, eventDeadLetters, guardedQuery } from '@oppsera/db';
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

    // Process handlers with concurrency limit to avoid overwhelming the DB pool.
    // Collect failures so the outbox worker knows delivery was incomplete and
    // can leave the row for stale-recovery retry instead of deleting it.
    const failures: Error[] = [];
    for (let i = 0; i < handlers.length; i += MAX_CONCURRENT_HANDLERS) {
      const batch = handlers.slice(i, i + MAX_CONCURRENT_HANDLERS);
      const promises = batch.map(({ handler, consumerName }) =>
        this.dispatchWithRetry(event, handler, consumerName),
      );
      const results = await Promise.allSettled(promises);
      for (const r of results) {
        if (r.status === 'rejected') {
          failures.push(r.reason instanceof Error ? r.reason : new Error(String(r.reason)));
        }
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} handler(s) failed for event ${event.eventType}`,
      );
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
    // Atomic claim-before-execute: try to insert into processed_events first.
    // If another instance already claimed this event, the INSERT returns 0 rows
    // (onConflictDoNothing) and we skip the handler entirely.
    // This prevents the check-then-act race where two instances both pass
    // checkProcessed and both execute the handler (causing duplicate GL entries, etc.).
    const claimed = await guardedQuery('bus:claimEvent', () =>
      db
        .insert(processedEvents)
        .values({
          id: generateUlid(),
          eventId: event.eventId,
          consumerName,
          processedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: processedEvents.id }),
    );
    if (claimed.length === 0) return; // already processed by another instance

    let handlerSucceeded = false;
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
        handlerSucceeded = true;
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
          let deadLetterPersisted = true;
          try {
            await this.persistDeadLetter(event, consumerName, err, this.maxRetries);
          } catch (dlqErr) {
            deadLetterPersisted = false;
            console.error('Failed to persist dead letter to DB:', dlqErr);
          }

          // If dead-letter persistence failed, the only remaining safety net is
          // the outbox stale recovery (10 min) + purge (1 hour). The unclaim
          // below will attempt to remove the processed_events row so the event
          // can be retried. If unclaim also fails, the event is permanently
          // blocked for this consumer with no DB record — log CRITICAL so
          // operators are alerted. The outbox row will be purged after 1 hour.
          if (!deadLetterPersisted) {
            // Store for deferred unclaim-failure check below
            (err as Error & { _dlqPersistFailed?: boolean })._dlqPersistFailed = true;
          }

          console.error(`Event moved to dead letter queue:`, {
            eventType: event.eventType,
            eventId: event.eventId,
            consumerName,
          });
        }
      }
    }

    // If all retries failed, remove the claim so the outbox worker can retry
    // later. Without this, the event is permanently stuck as "claimed but
    // never processed" — the outbox worker sees it in processedEvents and
    // skips it, even though the handler never succeeded.
    if (!handlerSucceeded) {
      // Check if dead-letter persistence failed (flagged above)
      const lastErr = this.deadLetterQueue.at(-1);
      const dlqPersistFailed = lastErr?.event?.eventId === event.eventId
        && (lastErr?.error as Error & { _dlqPersistFailed?: boolean })?._dlqPersistFailed === true;

      try {
        await guardedQuery('bus:unclaimEvent', () =>
          db.execute(
            sql`DELETE FROM processed_events WHERE event_id = ${event.eventId} AND consumer_name = ${consumerName}`,
          ),
        );
      } catch (unclaimErr) {
        // Unclaim failed — the processed_events row remains. Combined with a
        // failed dead-letter insert, this consumer has NO DB record and cannot
        // be retried. Log CRITICAL so operators can manually intervene.
        // Safety net: the outbox row will be purged after 1 hour by stale recovery.
        if (dlqPersistFailed) {
          console.error(
            '[CRITICAL] Dead-letter persist AND unclaim both failed — event permanently blocked for this consumer with no DB record. Manual intervention required.',
            {
              eventId: event.eventId,
              eventType: event.eventType,
              consumerName,
              unclaimError: unclaimErr instanceof Error ? unclaimErr.message : String(unclaimErr),
            },
          );
        } else {
          console.error('Failed to unclaim event after handler failure:', {
            eventId: event.eventId,
            consumerName,
            error: unclaimErr,
          });
        }
      }

      // Re-throw so publish() can signal incomplete delivery to the outbox
      // worker. Without this, publish() returns successfully and the outbox
      // deletes the row — permanently losing the event.
      throw new Error(
        `Handler ${consumerName} failed after ${this.maxRetries} retries for event ${event.eventId}`,
      );
    }
  }

  private async persistDeadLetter(
    event: EventEnvelope,
    consumerName: string,
    error: Error,
    maxRetries: number,
  ): Promise<void> {
    const tenantId = event.tenantId;

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

}
