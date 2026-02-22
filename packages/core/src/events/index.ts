import type { EventBus } from './bus';
import type { OutboxWriter } from './outbox';
import { InMemoryEventBus } from './in-memory-bus';
import { DrizzleOutboxWriter } from './outbox-writer';
import { OutboxWorker } from './outbox-worker';

let eventBus: EventBus | null = null;
let outboxWorker: OutboxWorker | null = null;
let outboxWriter: OutboxWriter | null = null;

export function getEventBus(): EventBus {
  if (!eventBus) {
    eventBus = new InMemoryEventBus();
  }
  return eventBus;
}

export function setEventBus(bus: EventBus): void {
  eventBus = bus;
}

export function getOutboxWriter(): OutboxWriter {
  if (!outboxWriter) {
    outboxWriter = new DrizzleOutboxWriter();
  }
  return outboxWriter;
}

export function setOutboxWriter(writer: OutboxWriter): void {
  outboxWriter = writer;
}

export function getOutboxWorker(): OutboxWorker {
  if (!outboxWorker) {
    outboxWorker = new OutboxWorker({ eventBus: getEventBus() });
  }
  return outboxWorker;
}

export function setOutboxWorker(worker: OutboxWorker): void {
  outboxWorker = worker;
}

export async function initializeEventSystem(): Promise<void> {
  const bus = getEventBus();
  const worker = getOutboxWorker();

  await bus.start();
  await worker.start();

  console.log('Event system initialized');
}

export async function shutdownEventSystem(): Promise<void> {
  const bus = getEventBus();
  const worker = getOutboxWorker();

  await worker.stop();
  await bus.stop();

  console.log('Event system shut down');
}

export type { EventHandler, EventBus } from './bus';
export type { OutboxWriter } from './outbox';
export { InMemoryEventBus } from './in-memory-bus';
export { DrizzleOutboxWriter } from './outbox-writer';
export { OutboxWorker } from './outbox-worker';
export { buildEvent, buildEventFromContext } from './build-event';
export { publishWithOutbox } from './publish-with-outbox';
export { registerModuleEvents } from './register';
export type {
  EventRegistration,
  PatternRegistration,
  ModuleEventRegistration,
} from './register';
export {
  registerContracts,
  getContractRegistry,
  clearContractRegistry,
  validateContracts,
} from './contracts';
export type { EventContract, ModuleContracts } from './contracts';
export {
  listDeadLetters,
  getDeadLetter,
  getDeadLetterStats,
  retryDeadLetter,
  resolveDeadLetter,
  discardDeadLetter,
} from './dead-letter-service';
export type {
  DeadLetterEntry,
  DeadLetterStats,
  ListDeadLettersInput,
} from './dead-letter-service';
