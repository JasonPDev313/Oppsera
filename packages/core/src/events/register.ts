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
      bus.subscribe(reg.eventType, reg.handler);
      console.log(
        `Registered consumer: ${moduleName}/${reg.consumerName} -> ${reg.eventType}`,
      );
    }
  }

  if (registration.patterns) {
    for (const reg of registration.patterns) {
      bus.subscribePattern(reg.pattern, reg.handler);
      console.log(
        `Registered pattern consumer: ${moduleName}/${reg.consumerName} -> ${reg.pattern}`,
      );
    }
  }
}
