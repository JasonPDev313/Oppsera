export { getDailySales } from './get-daily-sales';
export { getItemSales } from './get-item-sales';
export { getInventorySummary } from './get-inventory-summary';
export { getDashboardMetrics } from './get-dashboard-metrics';

export type { GetDailySalesInput, DailySalesRow } from './get-daily-sales';
export type { GetItemSalesInput, ItemSalesRow } from './get-item-sales';
export type { GetInventorySummaryInput, InventorySummaryRow } from './get-inventory-summary';
export type { GetDashboardMetricsInput, DashboardMetrics } from './get-dashboard-metrics';

// ── Custom Reports (Session 21) ──────────────────────────────────
export { getFieldCatalog } from './get-field-catalog';
export { getReport, listReports } from './get-report';
export { runReport } from './run-report';
export { previewReport } from './preview-report';
export { getDashboard, listDashboards } from './get-dashboard';

export type { FieldCatalogRow } from './get-field-catalog';
export type { ReportRow, ListReportsInput, ListReportsResult } from './get-report';
export type { RunReportInput, RunReportResult } from './run-report';
export type { PreviewReportInput, PreviewReportResult } from './preview-report';
export type { DashboardRow, ListDashboardsInput, ListDashboardsResult } from './get-dashboard';

// ── Modifier Reporting ──────────────────────────────────────────────
export { getModifierPerformance } from './get-modifier-performance';
export { getModifierGroupHealth } from './get-modifier-group-health';
export { getModifierUpsellImpact } from './get-modifier-upsell-impact';
export { getModifierDaypartHeatmap } from './get-modifier-daypart-heatmap';
export { getModifierGroupItemHeatmap } from './get-modifier-group-item-heatmap';
export { getModifierLocationHeatmap } from './get-modifier-location-heatmap';
export { getModifierWasteSignals } from './get-modifier-waste-signals';
export { getModifierComplexity } from './get-modifier-complexity';

export type { GetModifierPerformanceInput, ModifierPerformanceRow } from './get-modifier-performance';
export type { GetModifierGroupHealthInput, ModifierGroupHealthResult } from './get-modifier-group-health';
export type { GetModifierUpsellImpactInput, UpsellImpactRow } from './get-modifier-upsell-impact';
export type { GetModifierDaypartHeatmapInput, DaypartHeatmapRow } from './get-modifier-daypart-heatmap';
export type { GetModifierGroupItemHeatmapInput, GroupItemHeatmapRow } from './get-modifier-group-item-heatmap';
export type { GetModifierLocationHeatmapInput, LocationHeatmapRow } from './get-modifier-location-heatmap';
export type { GetModifierWasteSignalsInput, WasteSignalRow } from './get-modifier-waste-signals';
export type { GetModifierComplexityInput, ComplexityRow } from './get-modifier-complexity';
