import { setReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';
import type { ReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';
import {
  getOrdersSummary,
  getTaxBreakdown,
  getTaxRemittanceData,
  getCompTotals,
  getOrderAuditCount,
} from '@oppsera/module-orders';
import {
  getTendersSummary,
  getTenderAuditTrail,
  getUnmatchedTenders,
  getTenderAuditCount,
  listSettlements,
  getSettlementDetail,
  getSettlementStatusCounts,
  getDrawerSessionStatus,
  getRetailCloseStatus,
  getCashOnHand,
  getOverShortTotal,
  getTipBalances,
  listTipPayouts,
  getPendingTipCount,
  getOutstandingTipsCents,
  getDepositStatus,
  getLocationCloseStatus,
  getTenderForGlRepost,
  getAchPendingCount,
  getAchReturnSummary,
  getAchSettlementSummary,
} from '@oppsera/module-payments';
import {
  getInventoryMovementsSummary,
  getReceivingPurchasesTotals,
} from '@oppsera/module-inventory';
import {
  getFnbCloseStatus,
} from '@oppsera/module-fnb';

/**
 * Wire the ReconciliationReadApi singleton so accounting queries
 * can read operational data without importing module packages directly.
 *
 * Implementations are provided by the owning modules:
 *   - Orders domain (5 methods)  → @oppsera/module-orders
 *   - Payments domain (21 methods) → @oppsera/module-payments
 *   - Inventory domain (2 methods) → @oppsera/module-inventory
 *   - F&B domain (1 method)      → @oppsera/module-fnb
 */
export async function initializeReconciliationReadApi(): Promise<void> {
  const api: ReconciliationReadApi = {
    // ── Orders Domain ─────────────────────────────────────────
    getOrdersSummary,
    getTaxBreakdown,
    getTaxRemittanceData,
    getCompTotals,
    getOrderAuditCount,

    // ── Tenders Domain ──────────────────────────────────────────
    getTendersSummary,
    getTenderAuditTrail,
    getUnmatchedTenders,
    getTenderAuditCount,

    // ── Settlements Domain ──────────────────────────────────────
    listSettlements,
    getSettlementDetail,
    getSettlementStatusCounts,

    // ── Cash Operations Domain ──────────────────────────────────
    getDrawerSessionStatus,
    getRetailCloseStatus,
    getCashOnHand,
    getOverShortTotal,

    // ── Tips Domain ─────────────────────────────────────────────
    getTipBalances,
    listTipPayouts,
    getPendingTipCount,
    getOutstandingTipsCents,

    // ── Deposits Domain ─────────────────────────────────────────
    getDepositStatus,

    // ── Location Close ──────────────────────────────────────────
    getLocationCloseStatus,

    // ── F&B Domain ──────────────────────────────────────────────
    getFnbCloseStatus,

    // ── Inventory Domain ────────────────────────────────────────
    getInventoryMovementsSummary,
    getReceivingPurchasesTotals,

    // ── GL Remap Domain ───────────────────────────────────────
    getTenderForGlRepost,

    // ── ACH Domain ────────────────────────────────────────────
    getAchPendingCount,
    getAchReturnSummary,
    getAchSettlementSummary,
  };

  setReconciliationReadApi(api);
}
