'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Package, RefreshCw } from 'lucide-react';
import { adminFetch } from '@/lib/api-fetch';
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Types ─────────────────────────────────────────────────────────

interface StockAlert {
  id: string;
  tenantId: string;
  tenantName: string;
  title: string;
  body: string;
  severity: string;
  metricSlug: string | null;
  metricValue: string | null;
  baselineValue: string | null;
  locationId: string | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

interface TenantBreakdown {
  tenantId: string;
  tenantName: string;
  alertCount: number;
  criticalCount: number;
  warningCount: number;
}

interface StockAlertsResponse {
  data: StockAlert[];
  meta: {
    summary: Record<string, number>;
    tenantBreakdown: TenantBreakdown[];
    daysBack: number;
    totalAlerts: number;
  };
}

// ── Page ──────────────────────────────────────────────────────────

export default function AdminStockAlertsPage() {
  const [data, setData] = useState<StockAlertsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [daysBack, setDaysBack] = useState(30);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tenantFilter) params.set('tenantId', tenantFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      params.set('daysBack', String(daysBack));
      params.set('limit', '200');
      const res = await adminFetch<StockAlertsResponse>(`/api/v1/stock-alerts?${params}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock alerts');
    } finally {
      setIsLoading(false);
    }
  }, [tenantFilter, severityFilter, daysBack]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = data?.meta.summary ?? {};
  const criticalCount = summary['critical'] ?? 0;
  const warningCount = summary['warning'] ?? 0;
  const totalAlerts = data?.meta.totalAlerts ?? 0;
  const tenantBreakdown = data?.meta.tenantBreakdown ?? [];
  const alerts = data?.data ?? [];

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Stock Alerts</h1>
          <p className="text-sm text-slate-400">
            Cross-tenant inventory alert monitoring. Shows low stock and negative stock notifications.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/10 p-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Critical</p>
              <p className="text-2xl font-bold text-slate-100">{criticalCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2">
              <Package className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Warning</p>
              <p className="text-2xl font-bold text-slate-100">{warningCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Package className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Total Alerts</p>
              <p className="text-2xl font-bold text-slate-100">{totalAlerts}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tenant Breakdown */}
      {tenantBreakdown.length > 0 && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="border-b border-slate-700 px-4 py-3">
            <h2 className="text-sm font-medium text-slate-300">Alerts by Tenant (Top 10)</h2>
          </div>
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-400">Tenant</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-slate-400">Critical</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-slate-400">Warning</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-slate-400">Total</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {tenantBreakdown.map((t) => (
                <tr key={t.tenantId} className="hover:bg-slate-700/50">
                  <td className="px-4 py-2 text-sm text-slate-200">{t.tenantName}</td>
                  <td className="px-4 py-2 text-right text-sm font-medium text-red-400">{t.criticalCount}</td>
                  <td className="px-4 py-2 text-right text-sm font-medium text-amber-400">{t.warningCount}</td>
                  <td className="px-4 py-2 text-right text-sm text-slate-200">{t.alertCount}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => setTenantFilter(t.tenantId)}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Filter
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {tenantFilter && (
          <button
            onClick={() => setTenantFilter('')}
            className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-400"
          >
            Tenant: {tenantBreakdown.find((t) => t.tenantId === tenantFilter)?.tenantName ?? tenantFilter}
            <span className="ml-1 cursor-pointer">&times;</span>
          </button>
        )}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical Only</option>
          <option value="warning">Warning Only</option>
        </select>
        <select
          value={daysBack}
          onChange={(e) => setDaysBack(Number(e.target.value))}
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Alert Table */}
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">Loading stock alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 py-12">
          <Package className="h-8 w-8 text-slate-500" />
          <p className="text-sm text-slate-400">No stock alerts found for the selected period.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Alert</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-400">Level</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-slate-400">Threshold</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        alert.severity === 'critical'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {alert.severity === 'critical' ? 'Critical' : 'Warning'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">{alert.tenantName}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-200">{alert.title}</p>
                    <p className="text-xs text-slate-400 line-clamp-1">{alert.body}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-200">{alert.metricValue ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-400">{alert.baselineValue ?? '—'}</td>
                  <td className="px-4 py-3">
                    {alert.isDismissed ? (
                      <span className="text-xs text-slate-500">Dismissed</span>
                    ) : alert.isRead ? (
                      <span className="text-xs text-slate-400">Read</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400 border border-indigo-500/30">
                        Unread
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {timeAgo(alert.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
