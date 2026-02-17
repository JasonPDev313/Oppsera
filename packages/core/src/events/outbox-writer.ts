import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { eventOutbox } from '@oppsera/db';
import type { Database } from '@oppsera/db';
import type { OutboxWriter } from './outbox';

export class DrizzleOutboxWriter implements OutboxWriter {
  async writeEvent(tx: Database, event: EventEnvelope): Promise<void> {
    await tx.insert(eventOutbox).values({
      id: generateUlid(),
      tenantId: event.tenantId,
      eventType: event.eventType,
      eventId: event.eventId,
      idempotencyKey: event.idempotencyKey,
      payload: event,
      occurredAt: new Date(event.occurredAt),
      publishedAt: null,
    });
  }
}
