'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  RefreshCw,
  Activity,
  Building2,
  Users,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useModuleAnalytics } from '@/hooks/use-analytics';

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

// ── Page ─────────────────────────────────────────────────────────

export default function ModuleAnalyticsPage() {
  const params = useParams();
  const moduleKey = params.moduleKey as string;
  const [period, setPeriod] = useState<'7d' | '30d'>('30d');
  const { data, isLoading, error, refresh } = useModuleAnalytics(moduleKey, period);

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Breadcrumb + Header */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
        <Link href="/analytics" className="hover:text-slate-200 flex items-center gap-1">
          <ArrowLeft size={14} />
          Analytics
        </Link>
        <span>/</span>
        <span className="text-slate-200">{moduleKey}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{moduleKey}</h1>
          <p className="text-sm text-slate-400 mt-1">Module usage deep-dive</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(['7d', '30d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button onClick={refresh} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors">
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isLoading && !data && (
        <div className="text-center py-16 text-slate-400">Loading module analytics...</div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Total Requests', value: fmt(data.kpis.totalRequests), icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
              { label: 'Unique Tenants', value: fmt(data.kpis.uniqueTenants), icon: Building2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              { label: 'Unique Users', value: fmt(data.kpis.uniqueUsers), icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
              { label: 'Avg Latency', value: fmtMs(data.kpis.avgLatencyMs), icon: Clock, color: data.kpis.avgLatencyMs > 500 ? 'text-amber-400' : 'text-blue-400', bg: data.kpis.avgLatencyMs > 500 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20' },
              { label: 'Error Rate', value: fmtPct(data.kpis.errorRate), icon: AlertTriangle, color: data.kpis.errorRate > 5 ? 'text-red-400' : 'text-emerald-400', bg: data.kpis.errorRate > 5 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20' },
            ].map((c) => (
              <div key={c.label} className={`${c.bg} rounded-lg border p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-slate-500">{c.label}</p>
                  <c.icon size={14} className={c.color} />
                </div>
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Usage over time (CSS bar chart) */}
          {data.dailyUsage.length > 0 && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 mb-6">
              <h3 className="text-sm font-medium text-slate-300 mb-3">Usage Over Time</h3>
              <div className="flex items-end gap-0.5 h-24">
                {data.dailyUsage.map((d) => {
                  const maxReq = Math.max(...data.dailyUsage.map((x) => x.requestCount), 1);
                  const pct = (d.requestCount / maxReq) * 100;
                  const hasErrors = d.errorCount > 0;
                  return (
                    <div key={d.usageDate} className="flex-1 flex flex-col justify-end h-full">
                      {hasErrors && (
                        <div
                          className="bg-red-500 rounded-t-sm opacity-70"
                          style={{ height: `${(d.errorCount / Math.max(...data.dailyUsage.map((x) => x.requestCount), 1)) * 100}%` }}
                        />
                      )}
                      <div
                        className="bg-indigo-500 rounded-t-sm opacity-70 hover:opacity-100 transition-opacity"
                        style={{ height: `${Math.max(pct - (hasErrors ? (d.errorCount / Math.max(...data.dailyUsage.map((x) => x.requestCount), 1)) * 100 : 0), 2)}%` }}
                        title={`${d.usageDate}: ${d.requestCount} req, ${d.errorCount} errors`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-slate-500">{data.dailyUsage[0]?.usageDate}</span>
                <span className="text-[10px] text-slate-500">{data.dailyUsage[data.dailyUsage.length - 1]?.usageDate}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* Top Workflows */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700">
                <h3 className="text-sm font-medium text-slate-300">Top Workflows</h3>
              </div>
              {data.topWorkflows.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">No workflow data</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="text-left px-4 py-2 font-medium text-slate-400">Workflow</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-400">Requests</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-400">Errors</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-400">Users</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {data.topWorkflows.map((w) => (
                      <tr key={w.workflowKey} className="hover:bg-slate-700/50">
                        <td className="px-4 py-2.5">
                          <p className="text-xs text-slate-300">{w.workflowName}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{w.workflowKey}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-300 text-xs font-mono">{fmt(w.requestCount)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-xs font-mono ${w.errorCount > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                            {w.errorCount}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{w.uniqueUsers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top Tenants */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700">
                <h3 className="text-sm font-medium text-slate-300">Top Tenants</h3>
              </div>
              {data.topTenants.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">No tenant data</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/50">
                      <th className="text-left px-4 py-2 font-medium text-slate-400">#</th>
                      <th className="text-left px-4 py-2 font-medium text-slate-400">Tenant</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-400">Requests</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {data.topTenants.map((t, i) => (
                      <tr key={t.tenantId} className="hover:bg-slate-700/50">
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <Link href={`/tenants/${t.tenantId}`} className="text-indigo-400 hover:text-indigo-300 text-xs font-medium">
                            {t.tenantName || t.tenantId.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-300 text-xs font-mono">{fmt(t.requestCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {!isLoading && !data && !error && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No data for module &quot;{moduleKey}&quot;</p>
        </div>
      )}
    </div>
  );
}
