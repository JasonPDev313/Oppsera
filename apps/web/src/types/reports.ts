// ── Reporting Types (Session 20) ──────────────────────────────

/** Dashboard KPI metrics — all monetary values in cents */
export interface DashboardMetrics {
  todaySales: number;
  todayOrders: number;
  todayVoids: number;
  lowStockCount: number;
  activeCustomers7d: number;
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

/** Department-level spend for a customer */
export interface DepartmentSpend {
  departmentId: string;
  departmentName: string;
  totalSpend: number;
}

/** Customer spending row with department breakdown */
export interface CustomerSpendingRow {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  departments: DepartmentSpend[];
  totalSpend: number;
}

/** Summary KPIs for the customer spending report */
export interface CustomerSpendingSummary {
  totalCustomers: number;
  totalSpend: number;
  avgSpendPerCustomer: number;
  topDepartment: { name: string; total: number } | null;
}

/** Full result from customer spending query */
export interface CustomerSpendingResult {
  summary: CustomerSpendingSummary;
  customers: CustomerSpendingRow[];
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
