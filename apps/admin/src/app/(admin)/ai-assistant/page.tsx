'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Filter, TrendingDown, ThumbsDown, HelpCircle, Cpu } from 'lucide-react';
import { useAiSupportInbox, useAiSupportMetrics } from '@/hooks/use-ai-support';
import type { AiInboxFilters } from '@/hooks/use-ai-support';

// ── Helpers ───────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) return <span className="text-slate-500 text-xs">—</span>;
  const map: Record<string, string> = {
    high: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    low: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[confidence] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
      {confidence}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    closed: 'bg-slate-600/50 text-slate-400 border-slate-600',
    escalated: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
      {status}
    </span>
  );
}

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return <span className="text-slate-500 text-xs">—</span>;
  if (rating === 'thumbs_up') return <span className="text-emerald-400 text-sm">👍</span>;
  if (rating === 'thumbs_down') return <span className="text-red-400 text-sm">👎</span>;
  return <span className="text-slate-400 text-xs">{rating}</span>;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  icon: typeof MessageCircle;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ['', 'open', 'closed', 'escalated'];
const CONFIDENCE_OPTIONS = ['', 'high', 'medium', 'low'];
const PERIOD_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const;

// ── Page ──────────────────────────────────────────────────────────

export default function AiAssistantInboxPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [filters, setFilters] = useState<AiInboxFilters>({});
  const [tenantInput, setTenantInput] = useState('');
  const [moduleInput, setModuleInput] = useState('');

  const { metrics, isLoading: metricsLoading, load: loadMetrics } = useAiSupportMetrics(period);
  const { threads, isLoading, error, hasMore, load, loadMore } = useAiSupportInbox(filters);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const doLoad = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    doLoad();
  }, [doLoad]);

  const applyFilters = () => {
    setFilters((prev) => ({
      ...prev,
      tenantId: tenantInput || undefined,
      moduleKey: moduleInput || undefined,
    }));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageCircle size={22} className="text-indigo-400" />
            AI Assistant Inbox
          </h1>
          <p className="text-sm text-slate-400 mt-1">Monitor conversations and quality metrics</p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                period === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Questions Asked"
          value={metricsLoading ? '—' : (metrics?.questionsAsked ?? 0)}
          icon={HelpCircle}
          color="bg-indigo-600"
          sub={`Last ${period}`}
        />
        <KpiCard
          label="Low Confidence Rate"
          value={metricsLoading ? '—' : `${metrics?.lowConfidenceRate ?? 0}%`}
          icon={TrendingDown}
          color="bg-amber-600"
          sub={`${metrics?.lowConfidenceCount ?? 0} of ${metrics?.assistantMessages ?? 0} responses`}
        />
        <KpiCard
          label="Thumbs-Down Rate"
          value={metricsLoading ? '—' : `${metrics?.thumbsDownRate ?? 0}%`}
          icon={ThumbsDown}
          color="bg-red-600"
          sub={`${metrics?.thumbsDownCount ?? 0} of ${metrics?.totalFeedback ?? 0} rated`}
        />
        <KpiCard
          label="Top Module"
          value={metricsLoading ? '—' : (metrics?.topModule ?? 'N/A')}
          icon={Cpu}
          color="bg-emerald-600"
          sub="Most conversations"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
          <Filter size={14} />
          Filters
        </div>
        <div className="flex flex-wrap gap-3 flex-1">
          <input
            type="text"
            placeholder="Tenant ID"
            value={tenantInput}
            onChange={(e) => setTenantInput(e.target.value)}
            className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
          />
          <input
            type="text"
            placeholder="Module (e.g. orders)"
            value={moduleInput}
            onChange={(e) => setModuleInput(e.target.value)}
            className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
          />
          <select
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
            className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || 'All Statuses'}</option>
            ))}
          </select>
          <select
            value={filters.confidence ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, confidence: e.target.value || undefined }))}
            className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {CONFIDENCE_OPTIONS.map((c) => (
              <option key={c} value={c}>{c || 'All Confidence'}</option>
            ))}
          </select>
          <select
            value={filters.rating ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, rating: e.target.value || undefined }))}
            className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Ratings</option>
            <option value="thumbs_up">Thumbs Up</option>
            <option value="thumbs_down">Thumbs Down</option>
          </select>
          <button
            onClick={applyFilters}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setTenantInput('');
              setModuleInput('');
              setFilters({});
            }}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Thread Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">Tenant</th>
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">User</th>
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">Screen / Module</th>
                <th className="px-4 py-3 text-slate-400 font-medium">First Question</th>
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">Msgs</th>
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">Confidence</th>
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">Rating</th>
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-slate-400 font-medium whitespace-nowrap">Created</th>
              </tr>
            </thead>
            <tbody>
              {threads.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/ai-assistant/${t.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && router.push(`/ai-assistant/${t.id}`)}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="text-white font-medium text-xs">{t.tenantName}</p>
                    <p className="text-slate-500 font-mono text-xs">{t.tenantSlug}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                    {t.userId.slice(0, 10)}…
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-300 text-xs font-mono truncate max-w-[140px]">
                      {t.currentRoute ?? '—'}
                    </p>
                    {t.moduleKey && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-300 mt-0.5">
                        {t.moduleKey}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300 max-w-[240px]">
                    <p className="truncate text-xs">
                      {t.firstUserMessage ?? <span className="text-slate-500">—</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-center tabular-nums text-xs">
                    {t.messageCount}
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceBadge confidence={t.latestConfidence} />
                  </td>
                  <td className="px-4 py-3">
                    <RatingBadge rating={t.latestRating} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {threads.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    No threads found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Loading / Load More */}
      {isLoading && (
        <p className="text-center text-slate-500 text-sm py-4">Loading...</p>
      )}
      {hasMore && !isLoading && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => void loadMore()}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
