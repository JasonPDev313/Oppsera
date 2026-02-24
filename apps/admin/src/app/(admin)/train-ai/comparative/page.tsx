'use client';

import { useState, useEffect } from 'react';
import { BarChart3, GitCompare, Layers, Cpu } from 'lucide-react';
import { useComparativeAnalysis } from '@/hooks/use-eval-training';
import type { ComparativeMetric } from '@/types/eval';

const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

type TabKey = 'model' | 'lens' | 'provider';

const TABS: { key: TabKey; label: string; icon: typeof Cpu }[] = [
  { key: 'model', label: 'By Model', icon: Cpu },
  { key: 'lens', label: 'By Lens', icon: Layers },
  { key: 'provider', label: 'By Provider', icon: GitCompare },
];

function getRatingColor(rating: number | null): string {
  if (rating == null) return 'text-slate-500';
  if (rating >= 4.0) return 'text-green-400';
  if (rating >= 3.0) return 'text-yellow-400';
  return 'text-red-400';
}

function getQualityColor(quality: number | null): string {
  if (quality == null) return 'text-slate-500';
  if (quality >= 0.7) return 'text-green-400';
  if (quality >= 0.4) return 'text-yellow-400';
  return 'text-red-400';
}

function getLatencyColor(ms: number | null): string {
  if (ms == null) return 'text-slate-500';
  if (ms <= 1000) return 'text-green-400';
  if (ms <= 3000) return 'text-yellow-400';
  return 'text-red-400';
}

function getErrorRateColor(rate: number): string {
  if (rate <= 2) return 'text-green-400';
  if (rate <= 10) return 'text-yellow-400';
  return 'text-red-400';
}

// ── Bar Indicator ────────────────────────────────────────────────

function BarIndicator({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Comparison Table ─────────────────────────────────────────────

function ComparisonTable({ metrics }: { metrics: ComparativeMetric[] }) {
  if (metrics.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        No data available for this dimension.
      </div>
    );
  }

  const maxRating = 5;
  const maxQuality = 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left text-xs font-medium text-slate-400 py-3 px-3">Name</th>
            <th className="text-right text-xs font-medium text-slate-400 py-3 px-3 w-24">Queries</th>
            <th className="text-left text-xs font-medium text-slate-400 py-3 px-3 w-44">Avg Rating</th>
            <th className="text-left text-xs font-medium text-slate-400 py-3 px-3 w-44">Avg Quality</th>
            <th className="text-right text-xs font-medium text-slate-400 py-3 px-3 w-28">Avg Latency</th>
            <th className="text-right text-xs font-medium text-slate-400 py-3 px-3 w-24">Error Rate</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.key} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
              <td className="py-3 px-3">
                <span className="text-white font-medium">{metric.key}</span>
              </td>
              <td className="text-right py-3 px-3">
                <span className="text-slate-300">{metric.count.toLocaleString()}</span>
              </td>
              <td className="py-3 px-3">
                <div className="space-y-1">
                  <span className={`text-xs font-medium ${getRatingColor(metric.avgRating)}`}>
                    {metric.avgRating != null ? metric.avgRating.toFixed(2) : '--'}
                  </span>
                  <BarIndicator
                    value={metric.avgRating ?? 0}
                    max={maxRating}
                    color={
                      metric.avgRating != null && metric.avgRating >= 4.0 ? 'bg-green-500'
                        : metric.avgRating != null && metric.avgRating >= 3.0 ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }
                  />
                </div>
              </td>
              <td className="py-3 px-3">
                <div className="space-y-1">
                  <span className={`text-xs font-medium ${getQualityColor(metric.avgQuality)}`}>
                    {metric.avgQuality != null ? `${Math.round(metric.avgQuality * 100)}%` : '--'}
                  </span>
                  <BarIndicator
                    value={metric.avgQuality ?? 0}
                    max={maxQuality}
                    color={
                      metric.avgQuality != null && metric.avgQuality >= 0.7 ? 'bg-green-500'
                        : metric.avgQuality != null && metric.avgQuality >= 0.4 ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }
                  />
                </div>
              </td>
              <td className="text-right py-3 px-3">
                <span className={`text-xs font-medium ${getLatencyColor(metric.avgLatencyMs)}`}>
                  {metric.avgLatencyMs != null ? `${Math.round(metric.avgLatencyMs)}ms` : '--'}
                </span>
              </td>
              <td className="text-right py-3 px-3">
                <span className={`text-xs font-medium ${getErrorRateColor(metric.errorRate)}`}>
                  {metric.errorRate.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function ComparativeAnalysisPage() {
  const { data, isLoading, error, load } = useComparativeAnalysis();
  const [dateRange, setDateRange] = useState('30d');
  const [activeTab, setActiveTab] = useState<TabKey>('model');

  useEffect(() => {
    load({ dateRange });
  }, [load, dateRange]);

  function getActiveMetrics(): ComparativeMetric[] {
    if (!data) return [];
    switch (activeTab) {
      case 'model': return data.byModel;
      case 'lens': return data.byLens;
      case 'provider': return data.byProvider;
      default: return [];
    }
  }

  const metrics = getActiveMetrics();

  // Summary stats
  const totalQueries = metrics.reduce((sum, m) => sum + m.count, 0);
  const avgRating = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + (m.avgRating ?? 0) * m.count, 0) / Math.max(totalQueries, 1)
    : null;
  const avgErrorRate = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <BarChart3 size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Comparative Analysis</h1>
            <p className="text-sm text-slate-400 mt-0.5">Compare performance across models, lenses, and providers</p>
          </div>
        </div>

        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {DATE_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1">Total Queries ({activeTab})</p>
            <p className="text-lg font-bold text-white">{totalQueries.toLocaleString()}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1">Weighted Avg Rating</p>
            <p className={`text-lg font-bold ${getRatingColor(avgRating)}`}>
              {avgRating != null ? avgRating.toFixed(2) : '--'}
            </p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1">Avg Error Rate</p>
            <p className={`text-lg font-bold ${getErrorRateColor(avgErrorRate)}`}>
              {avgErrorRate.toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-slate-800/50 rounded-xl border border-slate-700 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Table */}
      {!isLoading && data && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <ComparisonTable metrics={metrics} />
        </div>
      )}
    </div>
  );
}
