'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuthContext } from '@/components/auth-provider';
import { useDashboard } from '@/hooks/use-dashboards';
import { usePermissions } from '@/hooks/use-permissions';
import { useReportFilters } from '@/hooks/use-report-filters';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { DashboardTile } from '@/components/dashboards/dashboard-tile';
import type { RunReportResult } from '@/types/custom-reports';

// ── Constants ────────────────────────────────────────────────
const ROW_HEIGHT_PX = 80;
const GRID_COLS = 12;
const REFRESH_INTERVAL_MS = 60_000;

// ── Props ────────────────────────────────────────────────────
interface DashboardViewerProps {
  dashboardId: string;
}

// ── Component ────────────────────────────────────────────────
export function DashboardViewer({ dashboardId }: DashboardViewerProps) {
  const router = useRouter();
  const { locations } = useAuthContext();
  const { data: dashboard, isLoading: isDashboardLoading } = useDashboard(dashboardId);
  const { can } = usePermissions();
  const filters = useReportFilters();

  const [tileData, setTileData] = useState<Map<number, RunReportResult>>(new Map());
  const [tileLoading, setTileLoading] = useState<Set<number>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Track whether we are currently refreshing all tiles
  const refreshingRef = useRef(false);

  // ── Fetch all tile data ──────────────────────────────────
  const fetchAllTileData = useCallback(async () => {
    if (!dashboard || dashboard.tiles.length === 0) return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    // Mark all tiles as loading
    const loadingSet = new Set(dashboard.tiles.map((_, i) => i));
    setTileLoading(loadingSet);

    // Build date override filters from the shared filter bar
    const overrideFilters = [
      { fieldKey: 'business_date', op: 'gte' as const, value: filters.dateFrom },
      { fieldKey: 'business_date', op: 'lte' as const, value: filters.dateTo },
    ];

    const results = await Promise.allSettled(
      dashboard.tiles.map(async (tile, idx) => {
        const res = await apiFetch<{ data: RunReportResult }>(
          `/api/v1/reports/custom/${tile.reportId}/run`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              overrides: { filters: overrideFilters },
            }),
          },
        );
        return { idx, result: res.data };
      }),
    );

    const nextData = new Map<number, RunReportResult>();
    for (const entry of results) {
      if (entry.status === 'fulfilled') {
        nextData.set(entry.value.idx, entry.value.result);
      }
    }

    setTileData(nextData);
    setTileLoading(new Set());
    setLastRefreshed(new Date());
    refreshingRef.current = false;
  }, [dashboard, filters.dateFrom, filters.dateTo]);

  // Fetch on mount and when dashboard loads
  useEffect(() => {
    fetchAllTileData();
  }, [fetchAllTileData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!dashboard || dashboard.tiles.length === 0) return;

    const interval = setInterval(fetchAllTileData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dashboard, fetchAllTileData]);

  // ── Compute grid rows ────────────────────────────────────
  const maxRow = dashboard
    ? dashboard.tiles.reduce(
        (max, t) => Math.max(max, t.position.y + t.size.h),
        4,
      )
    : 4;

  // ── Loading state ────────────────────────────────────────
  if (isDashboardLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg bg-gray-200"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <p className="text-sm text-gray-500">Dashboard not found.</p>
        <button
          type="button"
          onClick={() => router.push('/dashboards')}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Back to Dashboards
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {dashboard.name}
          </h1>
          {dashboard.description && (
            <p className="mt-1 text-sm text-gray-500">
              {dashboard.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          {can('reports.custom.manage') && (
            <button
              type="button"
              onClick={() => router.push(`/dashboards/${dashboardId}/edit`)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Shared Filter Bar */}
      <ReportFilterBar
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        preset={filters.preset}
        onDateChange={filters.setDateRange}
        locationId={filters.locationId}
        onLocationChange={filters.setLocationId}
        locations={locations}
        isLoading={tileLoading.size > 0}
        onRefresh={fetchAllTileData}
        onReset={filters.reset}
      />

      {/* Grid */}
      {dashboard.tiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-20">
          <p className="text-sm text-gray-500">
            This dashboard has no tiles.
          </p>
          {can('reports.custom.manage') && (
            <button
              type="button"
              onClick={() => router.push(`/dashboards/${dashboardId}/edit`)}
              className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Add Tiles
            </button>
          )}
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${maxRow}, ${ROW_HEIGHT_PX}px)`,
          }}
        >
          {dashboard.tiles.map((tile, idx) => (
            <div
              key={`${idx}-${tile.reportId}`}
              style={{
                gridColumn: `${tile.position.x + 1} / span ${tile.size.w}`,
                gridRow: `${tile.position.y + 1} / span ${tile.size.h}`,
                height: tile.size.h * ROW_HEIGHT_PX,
              }}
            >
              <DashboardTile
                tile={tile}
                data={tileData.get(idx) ?? null}
                isLoading={tileLoading.has(idx)}
                isEditing={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
