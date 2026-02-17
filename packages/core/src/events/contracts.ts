import type { z } from 'zod';

export interface EventContract {
  eventType: string;
  dataSchema: z.ZodType<unknown>;
}

export interface ModuleContracts {
  moduleName: string;
  emits: EventContract[];
  consumes: EventContract[];
}

const contractRegistry: ModuleContracts[] = [];

export function registerContracts(contracts: ModuleContracts): void {
  contractRegistry.push(contracts);
}

export function getContractRegistry(): ModuleContracts[] {
  return [...contractRegistry];
}

export function clearContractRegistry(): void {
  contractRegistry.length = 0;
}

export function validateContracts(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const emitted = new Set<string>();

  for (const mod of contractRegistry) {
    for (const contract of mod.emits) {
      emitted.add(contract.eventType);
    }
  }

  for (const mod of contractRegistry) {
    for (const contract of mod.consumes) {
      if (!emitted.has(contract.eventType)) {
        errors.push(
          `${mod.moduleName} consumes ${contract.eventType} but no module emits it`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
