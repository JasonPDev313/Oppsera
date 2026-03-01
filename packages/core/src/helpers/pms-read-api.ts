// ── PMS Read API — Sync lookups for POS hot path ──────────────────
// Cross-module read-only interface. Implementations live in the PMS module.
// Wired via setPmsReadApi() in apps/web/src/lib/pms-bootstrap.ts.

// ── Result types ────────────────────────────────────────────────

export interface PosGuestResult {
  guestId: string;
  firstName: string;
  lastName: string;
  roomNumber: string;
  reservationId: string;
  folioId: string | null;
  isVip: boolean;
  checkInDate: string;
  checkOutDate: string;
}

export interface PosFolioSummary {
  folioId: string;
  guestId: string;
  guestName: string;
  roomNumber: string;
  reservationId: string;
  balanceCents: number;
  totalCents: number;
  paymentCents: number;
  status: string;
  checkInDate: string;
  checkOutDate: string;
}

// ── Interface ───────────────────────────────────────────────────

export interface PmsReadApi {
  /** Search checked-in guests by name or room number */
  searchCheckedInGuests(
    tenantId: string,
    query: string,
    locationId?: string,
  ): Promise<PosGuestResult[]>;

  /** Exact lookup by room number */
  getCheckedInGuestByRoom(
    tenantId: string,
    roomNumber: string,
    locationId?: string,
  ): Promise<PosGuestResult | null>;

  /** Get the active (OPEN) folio for a checked-in guest */
  getActiveFolioForGuest(
    tenantId: string,
    guestId: string,
  ): Promise<PosFolioSummary | null>;

  /** Get a folio summary by folio ID (for POS display) */
  getFolioSummaryForPOS(
    tenantId: string,
    folioId: string,
  ): Promise<PosFolioSummary | null>;
}

// ── Singleton ───────────────────────────────────────────────────

const GLOBAL_KEY = '__oppsera_pms_read_api__' as const;

export function getPmsReadApi(): PmsReadApi {
  const api = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as PmsReadApi | undefined;
  if (!api) throw new Error('PmsReadApi not initialized');
  return api;
}

export function setPmsReadApi(api: PmsReadApi): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = api;
}

export function hasPmsReadApi(): boolean {
  return !!(globalThis as Record<string, unknown>)[GLOBAL_KEY];
}
