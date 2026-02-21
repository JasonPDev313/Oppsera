'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { TenantSelector } from '@/components/TenantSelector';
import { QualityKpiCard } from '@/components/QualityKpiCard';
import { useEvalDashboard } from '@/hooks/use-eval';

export default function EvalDashboardPage() {
  const [tenantId, setTenantId] = useState('');
  const { data, isLoading, error, load } = useEvalDashboard(tenantId || undefined);

  useEffect(() => {
    load();
  }, [load, tenantId]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Quality Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Aggregate quality metrics across eval turns</p>
        </div>
        <TenantSelector value={tenantId} onChange={(v) => { setTenantId(v); }} />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading && !data && (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QualityKpiCard
              label="Avg User Rating"
              value={data.avgUserRating != null ? data.avgUserRating.toFixed(1) : null}
              sub="out of 5"
            />
            <QualityKpiCard
              label="Avg Quality Score"
              value={
                data.avgQualityScore != null
                  ? `${Math.round(data.avgQualityScore * 100)}%`
                  : null
              }
            />
            <QualityKpiCard
              label="Hallucination Rate"
              value={data.hallucinationRate != null ? `${data.hallucinationRate.toFixed(1)}%` : null}
              good="down"
            />
            <QualityKpiCard
              label="Clarification Rate"
              value={data.clarificationRate != null ? `${data.clarificationRate.toFixed(1)}%` : null}
              good="down"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <QualityKpiCard
              label="Total Turns"
              value={data.totalTurns != null ? data.totalTurns.toLocaleString() : '0'}
            />
            <QualityKpiCard
              label="Reviewed"
              value={`${data.reviewedTurns ?? 0} (${(data.totalTurns ?? 0) > 0 ? Math.round(((data.reviewedTurns ?? 0) / data.totalTurns!) * 100) : 0}%)`}
            />
            <QualityKpiCard
              label="Avg Exec Time"
              value={
                data.avgExecutionTimeMs != null ? `${Math.round(data.avgExecutionTimeMs)}ms` : null
              }
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hallucination trend */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h2 className="text-sm font-semibold text-white mb-4">Hallucination Rate Trend (%)</h2>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.hallucinationTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="rate" stroke="#f87171" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Rating distribution */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h2 className="text-sm font-semibold text-white mb-4">User Rating Distribution</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.ratingDistribution}>
                  <XAxis dataKey="rating" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Exec time trend */}
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h2 className="text-sm font-semibold text-white mb-4">Avg Execution Time (ms)</h2>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.execTimeTrend}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="avgMs" stroke="#a78bfa" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* By lens */}
            {data.byLens.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
                <h2 className="text-sm font-semibold text-white mb-4">By Lens</h2>
                <div className="space-y-2">
                  {data.byLens.map((item) => (
                    <div key={item.lensId ?? 'none'} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{item.lensId ?? '(no lens)'}</span>
                      <div className="flex items-center gap-3 text-slate-400">
                        <span>{item.count} turns</span>
                        {item.avgRating != null && (
                          <span className="text-amber-400">{item.avgRating.toFixed(1)}★</span>
                        )}
                        {item.topVerdict && (
                          <span className="text-indigo-400 capitalize">{item.topVerdict}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
