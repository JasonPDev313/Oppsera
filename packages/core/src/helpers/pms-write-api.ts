// ── PMS Write API — Folio mutations from POS ──────────────────────
// Cross-module write interface. Implementations live in the PMS module.
// Wired via setPmsWriteApi() in apps/web/src/lib/pms-bootstrap.ts.

// ── Input types ─────────────────────────────────────────────────

export interface FolioChargeInput {
  folioId: string;
  description: string;
  amountCents: number;
  sourceRef: string;
  clientRequestId?: string;
}

export interface FolioPaymentInput {
  folioId: string;
  description: string;
  amountCents: number;
  sourceRef: string;
  clientRequestId?: string;
}

// ── Interface ───────────────────────────────────────────────────

export interface PmsWriteApi {
  /** Post a ROOM_CHARGE folio entry (POS charge to room) */
  postFolioCharge(
    tenantId: string,
    input: FolioChargeInput,
  ): Promise<{ entryId: string }>;

  /** Post a PAYMENT folio entry (folio settlement at POS) */
  postFolioPayment(
    tenantId: string,
    input: FolioPaymentInput,
  ): Promise<{ entryId: string }>;
}

// ── Singleton ───────────────────────────────────────────────────

const GLOBAL_KEY = '__oppsera_pms_write_api__' as const;

export function getPmsWriteApi(): PmsWriteApi {
  const api = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as PmsWriteApi | undefined;
  if (!api) throw new Error('PmsWriteApi not initialized');
  return api;
}

export function setPmsWriteApi(api: PmsWriteApi): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = api;
}

export function hasPmsWriteApi(): boolean {
  return !!(globalThis as Record<string, unknown>)[GLOBAL_KEY];
}
