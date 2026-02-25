'use client';

import { useState } from 'react';
import {
  RefreshCw,
  Activity,
  Building2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import { usePlatformDashboard } from '@/hooks/use-analytics';
import type { PlatformDashboardData } from '@/hooks/use-analytics';

// ── Helpers ──────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtMs(ms: number): string {
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ── KPI Cards ────────────────────────────────────────────────────

function KpiCards({ kpis }: { kpis: PlatformDashboardData['kpis'] }) {
  const cards = [
    { label: 'Total Requests', value: fmt(kpis.totalRequests), icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Active Tenants', value: fmt(kpis.activeTenants), icon: Building2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Error Rate', value: fmtPct(kpis.errorRate), icon: AlertTriangle, color: kpis.errorRate > 5 ? 'text-red-400' : 'text-emerald-400', bg: kpis.errorRate > 5 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Avg Latency', value: fmtMs(kpis.avgLatencyMs), icon: Clock, color: kpis.avgLatencyMs > 500 ? 'text-amber-400' : 'text-blue-400', bg: kpis.avgLatencyMs > 500 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20' },
  ];
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-lg border p-4`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500">{c.label}</p>
            <c.icon size={14} className={c.color} />
          </div>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Error Trend Sparkline (CSS bars) ─────────────────────────────

function ErrorTrend({ data }: { data: PlatformDashboardData['errorTrend'] }) {
  if (data.length === 0) return null;
  const maxRate = Math.max(...data.map((d) => d.errorRate), 0.01);
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 mb-6">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Error Rate Trend (30d)</h3>
      <div className="flex items-end gap-0.5 h-20">
        {data.map((d) => {
          const pct = (d.errorRate / maxRate) * 100;
          const color = d.errorRate > 5 ? 'bg-red-500' : d.errorRate > 2 ? 'bg-amber-500' : 'bg-emerald-500';
          return (
            <div
              key={d.usageDate}
              className={`flex-1 ${color} rounded-t-sm opacity-70 hover:opacity-100 transition-opacity`}
              style={{ height: `${Math.max(pct, 2)}%` }}
              title={`${d.usageDate}: ${fmtPct(d.errorRate)} (${d.requestCount} req)`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-slate-500">{data[0]?.usageDate}</span>
        <span className="text-[10px] text-slate-500">{data[data.length - 1]?.usageDate}</span>
      </div>
    </div>
  );
}

// ── Hourly Traffic (CSS bars) ────────────────────────────────────

function HourlyTraffic({ data }: { data: PlatformDashboardData['hourlyTraffic'] }) {
  if (data.length === 0) return null;
  const maxReq = Math.max(...data.map((d) => d.requestCount), 1);
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 mb-6">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Hourly Traffic (Today)</h3>
      <div className="flex items-end gap-0.5 h-16">
        {data.map((d) => {
          const pct = (d.requestCount / maxReq) * 100;
          return (
            <div
              key={d.hour}
              className="flex-1 bg-indigo-500 rounded-t-sm opacity-70 hover:opacity-100 transition-opacity"
              style={{ height: `${Math.max(pct, 2)}%` }}
              title={`${String(d.hour).padStart(2, '0')}:00 — ${d.requestCount} requests`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-slate-500">00:00</span>
        <span className="text-[10px] text-slate-500">12:00</span>
        <span className="text-[10px] text-slate-500">23:00</span>
      </div>
    </div>
  );
}

// ── Module Ranking Table ─────────────────────────────────────────

function ModuleRanking({ data }: { data: PlatformDashboardData['moduleRanking'] }) {
  if (data.length === 0) return <EmptyState message="No module data yet" />;
  const maxReq = data[0]?.requestCount ?? 1;
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Top Modules</h3>
        <span className="text-xs text-slate-500">Top 15</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800/50">
            <th className="text-left px-4 py-2 font-medium text-slate-400">#</th>
            <th className="text-left px-4 py-2 font-medium text-slate-400">Module</th>
            <th className="text-right px-4 py-2 font-medium text-slate-400">Requests</th>
            <th className="text-right px-4 py-2 font-medium text-slate-400">Errors</th>
            <th className="text-right px-4 py-2 font-medium text-slate-400">Tenants</th>
            <th className="px-4 py-2 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {data.map((m, i) => (
            <tr key={m.moduleKey} className="hover:bg-slate-700/50 transition-colors">
              <td className="px-4 py-2.5 text-slate-500 text-xs">{i + 1}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/analytics/modules/${m.moduleKey}`}
                      className="text-indigo-400 hover:text-indigo-300 font-medium text-xs"
                    >
                      {m.moduleKey}
                    </Link>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${(m.requestCount / maxReq) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2.5 text-right text-slate-300 text-xs font-mono">{fmt(m.requestCount)}</td>
              <td className="px-4 py-2.5 text-right">
                <span className={`text-xs font-mono ${m.errorCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                  {fmt(m.errorCount)}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{m.uniqueTenants}</td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/analytics/modules/${m.moduleKey}`} className="text-slate-500 hover:text-slate-300">
                  <ArrowRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tenant Ranking Table ─────────────────────────────────────────

function TenantRanking({ data }: { data: PlatformDashboardData['tenantRanking'] }) {
  if (data.length === 0) return <EmptyState message="No tenant data yet" />;
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-300">Top Tenants</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800/50">
            <th className="text-left px-4 py-2 font-medium text-slate-400">#</th>
            <th className="text-left px-4 py-2 font-medium text-slate-400">Tenant</th>
            <th className="text-right px-4 py-2 font-medium text-slate-400">Requests</th>
            <th className="text-right px-4 py-2 font-medium text-slate-400">Last Active</th>
            <th className="px-4 py-2 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {data.map((t, i) => (
            <tr key={t.tenantId} className="hover:bg-slate-700/50 transition-colors">
              <td className="px-4 py-2.5 text-slate-500 text-xs">{i + 1}</td>
              <td className="px-4 py-2.5">
                <Link
                  href={`/tenants/${t.tenantId}`}
                  className="text-indigo-400 hover:text-indigo-300 text-xs font-medium"
                >
                  {t.tenantName || t.tenantId.slice(0, 8)}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right text-slate-300 text-xs font-mono">{fmt(t.requestCount)}</td>
              <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{t.lastActiveAt}</td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/tenants/${t.tenantId}`} className="text-slate-500 hover:text-slate-300">
                  <ArrowRight size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Adoption Rates ───────────────────────────────────────────────

function AdoptionRates({ data }: { data: PlatformDashboardData['adoptionRates'] }) {
  if (data.length === 0) return null;
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">Module Adoption Rates</h3>
      <div className="space-y-3">
        {data.map((a) => (
          <div key={a.moduleKey}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">{a.moduleKey}</span>
              <span className="text-xs text-slate-300 font-medium">
                {fmtPct(a.adoptionPct)} ({a.activeTenants}/{a.totalTenants})
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${a.adoptionPct > 50 ? 'bg-emerald-500' : a.adoptionPct > 25 ? 'bg-amber-500' : 'bg-slate-500'}`}
                style={{ width: `${a.adoptionPct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
      <Activity className="mx-auto h-8 w-8 text-slate-600 mb-3" />
      <p className="text-slate-400 text-sm">{message}</p>
      <p className="text-xs text-slate-500 mt-1">Usage data will appear after requests flow through the system.</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState<'1d' | '7d' | '30d'>('30d');
  const { data, isLoading, error, refresh } = usePlatformDashboard(period);

  const handleExport = (type: 'daily' | 'workflow') => {
    const url = `/api/v1/analytics/export?type=${type}&days=${period === '1d' ? 1 : period === '7d' ? 7 : 30}`;
    window.open(url, '_blank');
  };

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Usage Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">
            Platform-wide usage metrics, module adoption, and tenant activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex gap-1">
            {(['1d', '7d', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {/* Export */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors">
              <Download size={13} />
              Export
            </button>
            <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-10 hidden group-hover:block">
              <button onClick={() => handleExport('daily')} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 rounded-t-lg">Daily Usage CSV</button>
              <button onClick={() => handleExport('workflow')} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 rounded-b-lg">Workflow Usage CSV</button>
            </div>
          </div>
          {/* Refresh */}
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && !data && (
        <div className="text-center py-16 text-slate-400">Loading analytics...</div>
      )}

      {/* Content */}
      {data && (
        <>
          <KpiCards kpis={data.kpis} />

          <div className="grid grid-cols-2 gap-6 mb-6">
            <ErrorTrend data={data.errorTrend} />
            <HourlyTraffic data={data.hourlyTraffic} />
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <ModuleRanking data={data.moduleRanking} />
            <TenantRanking data={data.tenantRanking} />
          </div>

          <AdoptionRates data={data.adoptionRates} />
        </>
      )}

      {!isLoading && !data && !error && <EmptyState message="No usage data collected yet" />}
    </div>
  );
}
