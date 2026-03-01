/** Domain types for the register tab sync system. */

export interface RegisterTabRow {
  id: string;
  tenantId: string;
  terminalId: string;
  tabNumber: number;
  orderId: string | null;
  label: string | null;
  employeeId: string | null;
  employeeName: string | null;
  // ── PMS integration (migration 0246) ───────────────────────
  folioId: string | null;
  guestName: string | null;
  // ── Sync foundation (migration 0244) ────────────────────────
  version: number;
  locationId: string | null;
  status: 'active' | 'held' | 'closed';
  deviceId: string | null;
  lastActivityAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
