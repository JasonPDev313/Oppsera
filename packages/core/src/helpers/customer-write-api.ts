import type { RequestContext } from '../auth/context';

// ── Input types ─────────────────────────────────────────────────

export interface EnsureCustomerInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  acquisitionSource?: string;
  /** Optional external ID link (e.g., PMS guest ID) */
  externalLink?: {
    provider: string;
    externalId: string;
    metadata?: Record<string, unknown>;
  };
}

export interface EnsureCustomerResult {
  customerId: string;
  /** true if a new customer was created, false if an existing one was found */
  created: boolean;
}

// ── Interface ───────────────────────────────────────────────────

export interface CustomerWriteApi {
  /**
   * Find an existing customer by email (or phone), or create a new one.
   * Idempotent: same email always returns the same customer.
   * Never throws — returns null on failure so callers can continue.
   */
  ensureCustomer(
    ctx: RequestContext,
    input: EnsureCustomerInput,
  ): Promise<EnsureCustomerResult | null>;
}

// ── Singleton ───────────────────────────────────────────────────

const GLOBAL_KEY = '__oppsera_customer_write_api__' as const;

export function getCustomerWriteApi(): CustomerWriteApi {
  const api = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as CustomerWriteApi | undefined;
  if (!api) throw new Error('CustomerWriteApi not initialized');
  return api;
}

export function setCustomerWriteApi(api: CustomerWriteApi): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = api;
}

/**
 * Safe check — returns false if the singleton hasn't been initialized yet.
 * Use in module-level code where initialization may not have happened (e.g., tests).
 */
export function hasCustomerWriteApi(): boolean {
  return !!(globalThis as Record<string, unknown>)[GLOBAL_KEY];
}
