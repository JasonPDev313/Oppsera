'use client';

import { useState, useEffect } from 'react';
import { DollarSign, Zap, Calculator, TrendingUp } from 'lucide-react';
import { useCostAnalytics } from '@/hooks/use-eval-training';
import type { CostDaily } from '@/types/eval';

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function KpiCard({ icon: Icon, label, value, sub }: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-indigo-400" />
        <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function DailyCostChart({ data }: { data: CostDaily[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500 italic text-center py-8">No cost data for this period</p>;
  }

  const maxCost = Math.max(...data.map((d) => d.totalCostUsd), 0.0001);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-40">
        {data.map((day) => {
          const heightPct = Math.max((day.totalCostUsd / maxCost) * 100, 2);
          return (
            <div
              key={day.id}
              className="flex-1 flex flex-col items-center justify-end group relative"
              style={{ height: '100%' }}
            >
              <div
                className="w-full bg-indigo-500/70 hover:bg-indigo-500 rounded-t-sm transition-colors cursor-default"
                style={{ height: `${heightPct}%` }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <p className="font-medium">{day.businessDate}</p>
                <p className="text-slate-300">${day.totalCostUsd.toFixed(4)}</p>
                <p className="text-slate-400">{day.totalTurns} queries</p>
              </div>
            </div>
          );
        })}
      </div>
      {/* X-axis labels - show first, middle, last */}
      <div className="flex justify-between text-[9px] text-slate-500 px-0.5">
        <span>{data[0]?.businessDate ?? ''}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.businessDate ?? ''}</span>}
        {data.length > 1 && <span>{data[data.length - 1]?.businessDate ?? ''}</span>}
      </div>
    </div>
  );
}

function BreakdownTable({ title, data }: {
  title: string;
  data: Record<string, unknown> | null;
}) {
  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  const entries = Object.entries(data).sort((a, b) => {
    const aVal = typeof a[1] === 'object' && a[1] != null && 'cost' in a[1] ? Number((a[1] as { cost: number }).cost) : 0;
    const bVal = typeof b[1] === 'object' && b[1] != null && 'cost' in b[1] ? Number((b[1] as { cost: number }).cost) : 0;
    return bVal - aVal;
  });

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left text-slate-400 font-medium px-2 py-2">Name</th>
            <th className="text-right text-slate-400 font-medium px-2 py-2">Cost</th>
            <th className="text-right text-slate-400 font-medium px-2 py-2">Queries</th>
            <th className="text-right text-slate-400 font-medium px-2 py-2">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, val]) => {
            const item = val as { cost?: number; turns?: number; tokens?: number } | null;
            return (
              <tr key={key} className="border-b border-slate-800 hover:bg-slate-700/30">
                <td className="text-slate-300 px-2 py-2 font-medium">{key}</td>
                <td className="text-slate-300 px-2 py-2 text-right font-mono">
                  ${(item?.cost ?? 0).toFixed(4)}
                </td>
                <td className="text-slate-400 px-2 py-2 text-right">
                  {(item?.turns ?? 0).toLocaleString()}
                </td>
                <td className="text-slate-400 px-2 py-2 text-right">
                  {(item?.tokens ?? 0).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function CostPage() {
  const { data, isLoading, error, load } = useCostAnalytics();

  const [range, setRange] = useState('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (showCustom && customStart && customEnd) {
      load({ startDate: customStart, endDate: customEnd });
    } else if (!showCustom) {
      load({ days: range });
    }
  }, [load, range, showCustom, customStart, customEnd]);

  // Aggregate model and lens breakdowns across all daily data
  const aggregatedModelBreakdown: Record<string, { cost: number; turns: number; tokens: number }> = {};
  const aggregatedLensBreakdown: Record<string, { cost: number; turns: number; tokens: number }> = {};

  if (data?.dailyData) {
    for (const day of data.dailyData) {
      if (day.modelBreakdown) {
        for (const [key, val] of Object.entries(day.modelBreakdown)) {
          const v = val as { cost?: number; turns?: number; tokens?: number } | null;
          if (!aggregatedModelBreakdown[key]) {
            aggregatedModelBreakdown[key] = { cost: 0, turns: 0, tokens: 0 };
          }
          aggregatedModelBreakdown[key].cost += v?.cost ?? 0;
          aggregatedModelBreakdown[key].turns += v?.turns ?? 0;
          aggregatedModelBreakdown[key].tokens += v?.tokens ?? 0;
        }
      }
      if (day.lensBreakdown) {
        for (const [key, val] of Object.entries(day.lensBreakdown)) {
          const v = val as { cost?: number; turns?: number; tokens?: number } | null;
          if (!aggregatedLensBreakdown[key]) {
            aggregatedLensBreakdown[key] = { cost: 0, turns: 0, tokens: 0 };
          }
          aggregatedLensBreakdown[key].cost += v?.cost ?? 0;
          aggregatedLensBreakdown[key].turns += v?.turns ?? 0;
          aggregatedLensBreakdown[key].tokens += v?.tokens ?? 0;
        }
      }
    }
  }

  const rangeLabel = showCustom
    ? `${customStart} to ${customEnd}`
    : RANGE_OPTIONS.find((o) => o.value === range)?.label ?? '';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Cost & Token Analytics</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track AI usage costs and token consumption</p>
        </div>
      </div>

      {/* Date range selector */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setRange(opt.value); setShowCustom(false); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              !showCustom && range === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showCustom
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
          }`}
        >
          Custom
        </button>

        {showCustom && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-500">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
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
            <KpiCard
              icon={DollarSign}
              label="Total Cost"
              value={`$${data.totalCostUsd.toFixed(4)}`}
              sub={rangeLabel}
            />
            <KpiCard
              icon={Zap}
              label="Total Queries"
              value={data.totalTurns.toLocaleString()}
              sub={rangeLabel}
            />
            <KpiCard
              icon={Calculator}
              label="Avg Cost / Query"
              value={`$${data.avgCostPerQuery.toFixed(6)}`}
            />
            <KpiCard
              icon={TrendingUp}
              label="Total Tokens"
              value={(data.totalTokensInput + data.totalTokensOutput).toLocaleString()}
              sub={`${data.totalTokensInput.toLocaleString()} in / ${data.totalTokensOutput.toLocaleString()} out`}
            />
          </div>

          {/* Daily cost chart */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h2 className="text-sm font-semibold text-white mb-4">Daily Cost</h2>
            <DailyCostChart data={data.dailyData} />
          </div>

          {/* Breakdown tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BreakdownTable
              title="Cost by Model"
              data={Object.keys(aggregatedModelBreakdown).length > 0 ? aggregatedModelBreakdown : null}
            />
            <BreakdownTable
              title="Cost by Lens"
              data={Object.keys(aggregatedLensBreakdown).length > 0 ? aggregatedLensBreakdown : null}
            />
          </div>

          {/* Token usage stats */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h3 className="text-sm font-semibold text-white mb-4">Token Usage Summary</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400">Input Tokens</p>
                <p className="text-lg font-bold text-white mt-1">{data.totalTokensInput.toLocaleString()}</p>
                <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full"
                    style={{
                      width: `${(data.totalTokensInput / Math.max(data.totalTokensInput + data.totalTokensOutput, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400">Output Tokens</p>
                <p className="text-lg font-bold text-white mt-1">{data.totalTokensOutput.toLocaleString()}</p>
                <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-emerald-500 h-1.5 rounded-full"
                    style={{
                      width: `${(data.totalTokensOutput / Math.max(data.totalTokensInput + data.totalTokensOutput, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400">IO Ratio</p>
                <p className="text-lg font-bold text-white mt-1">
                  {data.totalTokensOutput > 0
                    ? `${(data.totalTokensInput / data.totalTokensOutput).toFixed(1)}:1`
                    : '-'}
                </p>
                <p className="text-[10px] text-slate-500 mt-2">Input to output</p>
              </div>
            </div>
          </div>

          {/* Per-day detail table */}
          {data.dailyData.length > 0 && (
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <h3 className="text-sm font-semibold text-white mb-3">Daily Detail</h3>
              <div className="overflow-auto max-h-80">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left text-slate-400 font-medium px-2 py-2">Date</th>
                      <th className="text-right text-slate-400 font-medium px-2 py-2">Queries</th>
                      <th className="text-right text-slate-400 font-medium px-2 py-2">Cost</th>
                      <th className="text-right text-slate-400 font-medium px-2 py-2">Avg Cost</th>
                      <th className="text-right text-slate-400 font-medium px-2 py-2">Tokens In</th>
                      <th className="text-right text-slate-400 font-medium px-2 py-2">Tokens Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyData.map((day) => (
                      <tr key={day.id} className="border-b border-slate-800 hover:bg-slate-700/30">
                        <td className="text-slate-300 px-2 py-2 font-medium">{day.businessDate}</td>
                        <td className="text-slate-300 px-2 py-2 text-right">{day.totalTurns}</td>
                        <td className="text-slate-300 px-2 py-2 text-right font-mono">${day.totalCostUsd.toFixed(4)}</td>
                        <td className="text-slate-400 px-2 py-2 text-right font-mono">
                          {day.avgCostPerQuery != null ? `$${day.avgCostPerQuery.toFixed(6)}` : '-'}
                        </td>
                        <td className="text-slate-400 px-2 py-2 text-right">{day.totalTokensInput.toLocaleString()}</td>
                        <td className="text-slate-400 px-2 py-2 text-right">{day.totalTokensOutput.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
