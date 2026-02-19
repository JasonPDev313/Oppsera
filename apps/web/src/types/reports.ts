// ── Reporting Types (Session 20) ──────────────────────────────

/** Dashboard KPI metrics — all monetary values in cents */
export interface DashboardMetrics {
  todaySales: number;
  todayOrders: number;
  todayVoids: number;
  lowStockCount: number;
  activeCustomers30d: number;
}

/** Daily sales summary row — monetary values in cents */
export interface DailySalesRow {
  businessDate: string;
  locationId: string | null;
  orderCount: number;
  grossSales: number;
  discountTotal: number;
  taxTotal: number;
  netSales: number;
  tenderCash: number;
  tenderCard: number;
  voidCount: number;
  voidTotal: number;
  avgOrderValue: number;
}

/** Item-level sales aggregation — monetary values in cents */
export interface ItemSalesRow {
  catalogItemId: string;
  catalogItemName: string;
  quantitySold: number;
  grossRevenue: number;
  quantityVoided: number;
  voidRevenue: number;
}

/** Inventory snapshot row */
export interface InventorySummaryRow {
  locationId: string;
  inventoryItemId: string;
  itemName: string;
  onHand: number;
  lowStockThreshold: number;
  isBelowThreshold: boolean;
}
