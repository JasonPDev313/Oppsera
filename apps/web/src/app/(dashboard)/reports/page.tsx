'use client';

import { useState, useCallback } from 'react';
import { BarChart3 } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import {
  useReportsDashboard,
  useDailySales,
  useItemSales,
  useInventorySummary,
} from '@/hooks/use-reports';
import { useReportFilters } from '@/hooks/use-report-filters';
import { MetricCards } from '@/components/reports/metric-cards';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { SalesTab } from '@/components/reports/sales-tab';
import { ItemsTab } from '@/components/reports/items-tab';
import { InventoryTab } from '@/components/reports/inventory-tab';

// ── Tab types ────────────────────────────────────────────────────

type TabKey = 'sales' | 'items' | 'inventory';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'items', label: 'Items' },
  { key: 'inventory', label: 'Inventory' },
];

// ── Page ─────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { locations } = useAuthContext();

  // State
  const [activeTab, setActiveTab] = useState<TabKey>('sales');
  const [belowThresholdOnly, setBelowThresholdOnly] = useState(false);
  const filters = useReportFilters();

  // Hooks
  const dashboard = useReportsDashboard(filters.selectedLocationId);
  const dailySales = useDailySales({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    locationId: filters.selectedLocationId,
  });
  const itemSales = useItemSales({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    locationId: filters.selectedLocationId,
    sortBy: 'grossRevenue',
    sortDir: 'desc',
  });
  const inventory = useInventorySummary({
    locationId: filters.selectedLocationId,
    belowThresholdOnly,
  });

  const handleRefresh = useCallback(() => {
    dashboard.mutate();
    dailySales.mutate();
    itemSales.mutate();
    inventory.mutate();
  }, [dashboard, dailySales, itemSales, inventory]);

  const isLoading =
    dashboard.isLoading || dailySales.isLoading || itemSales.isLoading || inventory.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-sm text-gray-500">Track sales, items, and inventory performance</p>
        </div>
      </div>

      {/* Shared Filter Bar (always visible — date range, location, refresh, reset) */}
      <ReportFilterBar
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        preset={filters.preset}
        onDateChange={filters.setDateRange}
        locationId={filters.locationId}
        onLocationChange={filters.setLocationId}
        locations={locations}
        isLoading={isLoading}
        onRefresh={handleRefresh}
        onReset={filters.reset}
      />

      {/* Metric Cards */}
      <MetricCards data={dashboard.data} isLoading={dashboard.isLoading} />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'sales' && (
        <SalesTab
          data={dailySales.data}
          isLoading={dailySales.isLoading}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          locationId={filters.selectedLocationId}
        />
      )}
      {activeTab === 'items' && (
        <ItemsTab
          data={itemSales.data}
          isLoading={itemSales.isLoading}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          locationId={filters.selectedLocationId}
        />
      )}
      {activeTab === 'inventory' && (
        <InventoryTab
          data={inventory.data}
          isLoading={inventory.isLoading}
          belowThresholdOnly={belowThresholdOnly}
          onToggleThreshold={setBelowThresholdOnly}
        />
      )}
    </div>
  );
}
