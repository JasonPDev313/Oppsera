'use client';

import { useState, useEffect } from 'react';
import { FlaskConical, Play, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useRegressionRuns, useRegressionTrend, useRegressionRun } from '@/hooks/use-eval-training';
import type { RegressionRun, RegressionResult } from '@/types/eval';

const CATEGORY_OPTIONS = ['', 'sales', 'inventory', 'customer', 'golf', 'comparison', 'trend', 'anomaly'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  running: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

const RESULT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  passed: { bg: 'bg-green-500/20', text: 'text-green-400' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  errored: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
};

function TrendChart({ data }: { data: { runId: string; name: string | null; passRate: number | null; totalExamples: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500 italic text-center py-8">No regression runs yet</p>;
  }
  const maxExamples = Math.max(...data.map((d) => d.totalExamples), 1);

  return (
    <div className="flex items-end gap-1.5 h-32">
      {data.map((run) => {
        const passRate = run.passRate ?? 0;
        const barHeight = Math.max((run.totalExamples / maxExamples) * 100, 4);
        const passH = (passRate / 100) * barHeight;
        const failH = barHeight - passH;
        return (
          <div key={run.runId} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
              <div
                className="w-full bg-red-500/60 rounded-t-sm"
                style={{ height: `${failH}%` }}
              />
              <div
                className="w-full bg-green-500/80 rounded-b-sm"
                style={{ height: `${passH}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-500 truncate w-full text-center">
              {passRate.toFixed(0)}%
            </span>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {run.name ?? run.runId.slice(0, 8)}
              <br />
              {run.totalExamples} examples, {passRate.toFixed(1)}% pass
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RunResultsTable({ runId }: { runId: string }) {
  const { data, isLoading, error, load } = useRegressionRun(runId);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-400 py-4">{error}</p>;
  }

  if (!data || data.results.length === 0) {
    return <p className="text-xs text-slate-500 py-4 italic">No results available</p>;
  }

  return (
    <div className="overflow-auto max-h-80">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left text-slate-400 font-medium px-3 py-2">Status</th>
            <th className="text-left text-slate-400 font-medium px-3 py-2">Example</th>
            <th className="text-left text-slate-400 font-medium px-3 py-2">Plan Match</th>
            <th className="text-left text-slate-400 font-medium px-3 py-2">SQL Match</th>
            <th className="text-left text-slate-400 font-medium px-3 py-2">Latency</th>
            <th className="text-left text-slate-400 font-medium px-3 py-2">Rows</th>
            <th className="text-left text-slate-400 font-medium px-3 py-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((r: RegressionResult) => {
            const statusColor = RESULT_STATUS_COLORS[r.status] ?? { bg: 'bg-orange-500/20', text: 'text-orange-400' };
            return (
              <tr key={r.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                <td className="px-3 py-2">
                  <span className={`${statusColor.bg} ${statusColor.text} px-2 py-0.5 rounded text-xs`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-300 font-mono truncate max-w-[160px]">
                  {r.exampleId.slice(0, 12)}...
                </td>
                <td className="px-3 py-2">
                  {r.planMatch == null ? (
                    <span className="text-slate-500">-</span>
                  ) : r.planMatch ? (
                    <CheckCircle size={14} className="text-green-400" />
                  ) : (
                    <XCircle size={14} className="text-red-400" />
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.sqlMatch == null ? (
                    <span className="text-slate-500">-</span>
                  ) : r.sqlMatch ? (
                    <CheckCircle size={14} className="text-green-400" />
                  ) : (
                    <XCircle size={14} className="text-red-400" />
                  )}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  {r.executionTimeMs != null ? `${r.executionTimeMs}ms` : '-'}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  {r.rowCount ?? '-'}
                </td>
                <td className="px-3 py-2 text-red-400 truncate max-w-[200px]">
                  {r.executionError ?? '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunCard({ run }: { run: RegressionRun }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[run.status] ?? { bg: 'bg-yellow-500/20', text: 'text-yellow-400' };
  const passRate = run.passRate ?? 0;
  const total = run.totalExamples || 1;
  const passedPct = (run.passed / total) * 100;
  const failedPct = (run.failed / total) * 100;
  const erroredPct = (run.errored / total) * 100;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start justify-between gap-3 p-5 hover:bg-slate-700/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {expanded ? (
            <ChevronDown size={14} className="text-slate-400 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-400 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-white truncate">{run.name ?? `Run ${run.id.slice(0, 8)}`}</p>
              <span className={`text-xs ${statusColor.bg} ${statusColor.text} px-2 py-0.5 rounded`}>
                {run.status}
              </span>
              {run.categoryFilter && (
                <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">
                  {run.categoryFilter}
                </span>
              )}
            </div>

            {/* Pass rate bar */}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden flex">
                <div className="bg-green-500 h-full" style={{ width: `${passedPct}%` }} />
                <div className="bg-red-500 h-full" style={{ width: `${failedPct}%` }} />
                <div className="bg-orange-500 h-full" style={{ width: `${erroredPct}%` }} />
              </div>
              <span className="text-xs text-slate-400 shrink-0 w-12 text-right">
                {passRate.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <CheckCircle size={12} className="text-green-400" />
            {run.passed}
          </span>
          <span className="flex items-center gap-1">
            <XCircle size={12} className="text-red-400" />
            {run.failed}
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle size={12} className="text-orange-400" />
            {run.errored}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {run.avgLatencyMs != null ? `${Math.round(run.avgLatencyMs)}ms` : '-'}
          </span>
          <span className="text-slate-500">
            {new Date(run.createdAt).toLocaleDateString()}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-700 pt-4">
          <RunResultsTable runId={run.id} />
        </div>
      )}
    </div>
  );
}

export default function RegressionPage() {
  const { data, isLoading, error, load, startRun } = useRegressionRuns();
  const { data: trendData, load: loadTrend } = useRegressionTrend();

  const [showNewRun, setShowNewRun] = useState(false);
  const [runName, setRunName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    load();
    loadTrend();
  }, [load, loadTrend]);

  const handleStartRun = async () => {
    setIsStarting(true);
    try {
      await startRun({
        name: runName.trim() || undefined,
        categoryFilter: categoryFilter || undefined,
      });
      setShowNewRun(false);
      setRunName('');
      setCategoryFilter('');
      load();
      loadTrend();
    } catch {
      // error handled by hook
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Regression Testing</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track pass/fail trends across golden examples</p>
        </div>
        <button
          onClick={() => setShowNewRun((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Play size={12} />
          Start New Run
        </button>
      </div>

      {/* New run form */}
      {showNewRun && (
        <div className="mb-6 bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h3 className="text-sm font-semibold text-white mb-3">Configure New Run</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-400 mb-1.5">Run Name (optional)</label>
              <input
                type="text"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="e.g. Pre-deploy check"
                className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Category Filter</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.filter(Boolean).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleStartRun}
              disabled={isStarting}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {isStarting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FlaskConical size={14} />
              )}
              {isStarting ? 'Starting...' : 'Run'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Trend chart */}
      {trendData.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">Pass Rate Trend (last 20 runs)</h2>
          <TrendChart data={trendData} />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Run list */}
      {!isLoading && data && (
        <div className="space-y-3">
          {data.runs.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              No regression runs yet. Start your first run above.
            </div>
          ) : (
            data.runs.map((run) => <RunCard key={run.id} run={run} />)
          )}
        </div>
      )}
    </div>
  );
}
