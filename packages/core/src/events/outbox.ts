import type { EventEnvelope } from '@oppsera/shared';

export interface OutboxWriter {
  writeEvent(tx: unknown, event: EventEnvelope): Promise<void>;
  /** Batch-insert multiple events in a single query. */
  writeEvents(tx: unknown, events: EventEnvelope[]): Promise<void>;
}

// TODO: Implement in Milestone 2
