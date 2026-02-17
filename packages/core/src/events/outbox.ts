import type { EventEnvelope } from '@oppsera/shared';

export interface OutboxWriter {
  writeEvent(tx: unknown, event: EventEnvelope): Promise<void>;
}

// TODO: Implement in Milestone 2
