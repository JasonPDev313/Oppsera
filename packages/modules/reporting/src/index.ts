export const MODULE_KEY = 'reporting' as const;
export const MODULE_NAME = 'Reporting & Analytics';
export const MODULE_VERSION = '0.5.0';

// ── Business Date Utility ─────────────────────────────────────
export { computeBusinessDate } from './business-date';

// ── Event Consumers ───────────────────────────────────────────
export {
  handleOrderPlaced,
  handleOrderVoided,
  handleTenderRecorded,
  handleInventoryMovement,
} from './consumers';

// ── Query Services ────────────────────────────────────────────
export {
  getDailySales,
  getItemSales,
  getInventorySummary,
  getDashboardMetrics,
  getFieldCatalog,
  getReport,
  listReports,
  runReport,
  previewReport,
  getDashboard,
  listDashboards,
} from './queries';

export type {
  GetDailySalesInput,
  DailySalesRow,
  GetItemSalesInput,
  ItemSalesRow,
  GetInventorySummaryInput,
  InventorySummaryRow,
  GetDashboardMetricsInput,
  DashboardMetrics,
  FieldCatalogRow,
  ReportRow,
  ListReportsInput,
  ListReportsResult,
  RunReportInput,
  RunReportResult,
  PreviewReportInput,
  PreviewReportResult,
  DashboardRow,
  ListDashboardsInput,
  ListDashboardsResult,
} from './queries';

// ── Commands ─────────────────────────────────────────────────
export { saveReport, deleteReport, saveDashboard, deleteDashboard } from './commands';
export type { SaveReportInput } from './commands';
export type { SaveDashboardInput } from './commands';

// ── Report Query Compiler (Semantic Layer) ───────────────────
export { compileReport, resolveDatasets } from './compiler';
export type {
  ReportFilter,
  ReportDefinitionBody,
  DashboardTile,
  FieldCatalogEntry,
  CompileReportInput,
  CompiledQuery,
} from './compiler';

// ── CSV Export ────────────────────────────────────────────────
export { toCsv } from './csv-export';
export type { CsvColumn } from './csv-export';

// ── Tile Cache ────────────────────────────────────────────────
export { TileCache, buildTileCacheKey, getTileCache, setTileCache } from './cache';

// Session 17: Read model schema + migrations + RLS
// Schema: packages/db/src/schema/reporting.ts (4 rm_ tables)
// Migration: packages/db/migrations/0049_reporting_read_models.sql
//
// Session 18: Event consumers (idempotent + business date logic)
// Consumers: order.placed.v1, order.voided.v1, tender.recorded.v1, inventory.movement.created.v1
//
// Session 19: Query services, CSV export, API routes
// Queries: getDailySales, getItemSales, getInventorySummary, getDashboardMetrics
// Export: toCsv (RFC 4180, UTF-8 BOM)
// Routes: /api/v1/reports/{daily-sales,item-sales,inventory-summary,dashboard,daily-sales/export,item-sales/export}
//
// Session 20: Frontend — Dashboard Home + Reports Pages
// Components: MetricCards, SalesTab, ItemsTab, InventoryTab, DateRangePicker
// Hooks: useReportsDashboard, useDailySales, useItemSales, useInventorySummary
//
// Session 21: Custom Report Builder Backend (Semantic Layer)
// Schema: reporting_field_catalog (system), report_definitions, dashboard_definitions
// Migration: 0050_custom_report_builder.sql
// Compiler: compileReport — translates definitions into parameterized SQL
// Commands: saveReport, deleteReport, saveDashboard, deleteDashboard
// Queries: getFieldCatalog, getReport, listReports, runReport, getDashboard, listDashboards
// Routes: /api/v1/reports/{fields,custom,custom/[id],custom/[id]/run,custom/[id]/export}
//         /api/v1/dashboards/{,/[id]}
//
// Session 22: Custom Report Builder Frontend + Performance
// Cache: TileCache (in-memory TTL) for dashboard tile results
// Schema: report_snapshots (V2-ready)
// Migration: 0051_report_snapshots.sql
// Frontend: Report builder, dashboard builder, saved lists, viewer
