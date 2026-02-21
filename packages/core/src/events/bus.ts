import type { EventEnvelope } from '@oppsera/shared';

export type EventHandler = (event: EventEnvelope) => Promise<void>;

export interface EventBus {
  publish(event: EventEnvelope): Promise<void>;
  subscribe(eventType: string, handler: EventHandler, consumerName?: string): void;
  subscribePattern(pattern: string, handler: EventHandler, consumerName?: string): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
