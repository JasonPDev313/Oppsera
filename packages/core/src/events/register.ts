import type { EventBus, EventHandler } from './bus';

export type EventRegistration = {
  eventType: string;
  consumerName: string;
  handler: EventHandler;
};

export type PatternRegistration = {
  pattern: string;
  consumerName: string;
  handler: EventHandler;
};

export interface ModuleEventRegistration {
  exact?: EventRegistration[];
  patterns?: PatternRegistration[];
}

export function registerModuleEvents(
  bus: EventBus,
  moduleName: string,
  registration: ModuleEventRegistration,
): void {
  if (registration.exact) {
    for (const reg of registration.exact) {
      const stableConsumerName = `${moduleName}/${reg.consumerName}`;
      bus.subscribe(reg.eventType, reg.handler, stableConsumerName);
      console.log(
        `Registered consumer: ${stableConsumerName} -> ${reg.eventType}`,
      );
    }
  }

  if (registration.patterns) {
    for (const reg of registration.patterns) {
      const stableConsumerName = `${moduleName}/${reg.consumerName}`;
      bus.subscribePattern(reg.pattern, reg.handler, stableConsumerName);
      console.log(
        `Registered pattern consumer: ${stableConsumerName} -> ${reg.pattern}`,
      );
    }
  }
}
