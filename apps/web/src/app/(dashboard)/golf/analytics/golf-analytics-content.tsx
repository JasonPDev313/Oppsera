'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useTenantTier } from '@/hooks/use-erp-config';
import { useGolfDashboard } from '@/hooks/use-golf-reports';
import { useReportFilters } from '@/hooks/use-report-filters';
import { GolfMetricCards } from '@/components/golf-reports/golf-metric-cards';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { UtilizationTab } from '@/components/golf-reports/utilization-tab';
import { RevenueTab } from '@/components/golf-reports/revenue-tab';
import { PaceOpsTab } from '@/components/golf-reports/pace-ops-tab';
import { ChannelsTab } from '@/components/golf-reports/channels-tab';
import { CustomersTab } from '@/components/golf-reports/customers-tab';

type TabKey = 'utilization' | 'revenue' | 'pace' | 'channels' | 'customers';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'utilization', label: 'Utilization' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'pace', label: 'Pace & Ops' },
  { key: 'channels', label: 'Channels' },
  { key: 'customers', label: 'Customers' },
];

export default function GolfAnalyticsContent() {
  const { locations } = useAuthContext();
  const router = useRouter();
  const { tier, isLoading: tierLoading } = useTenantTier();
  const [activeTab, setActiveTab] = useState<TabKey>('utilization');
  const filters = useReportFilters({ defaultPreset: 'last_30_days' });

  // Redirect non-golf tenants
  const isGolfTenant = tier?.businessVertical === 'golf' || tier?.businessVertical === 'hybrid';
  if (!tierLoading && tier && !isGolfTenant) {
    router.replace('/dashboard');
    return null;
  }

  const dashboard = useGolfDashboard(
    undefined, // courseId — future use
    filters.selectedLocationId,
  );

  const handleRefresh = useCallback(() => {
    dashboard.mutate();
  }, [dashboard]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
          <Flag className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Golf Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Track utilization, revenue, pace, and customer performance
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <ReportFilterBar
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        preset={filters.preset}
        onDateChange={filters.setDateRange}
        locationId={filters.locationId}
        onLocationChange={filters.setLocationId}
        locations={locations}
        isLoading={dashboard.isLoading}
        onRefresh={handleRefresh}
        onReset={filters.reset}
      />

      {/* KPI Cards */}
      <GolfMetricCards data={dashboard.data} isLoading={dashboard.isLoading} />

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'utilization' && (
        <UtilizationTab
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          locationId={filters.selectedLocationId}
        />
      )}
      {activeTab === 'revenue' && (
        <RevenueTab
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          locationId={filters.selectedLocationId}
        />
      )}
      {activeTab === 'pace' && (
        <PaceOpsTab
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          locationId={filters.selectedLocationId}
        />
      )}
      {activeTab === 'channels' && (
        <ChannelsTab
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          locationId={filters.selectedLocationId}
        />
      )}
      {activeTab === 'customers' && <CustomersTab />}
    </div>
  );
}
