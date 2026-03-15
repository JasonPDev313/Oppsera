'use client';

import { useState, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  Lightbulb,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  useFeatureGaps,
  updateFeatureGap,
  type FeatureGap,
  type FeatureGapStatus,
  type FeatureGapPriority,
  type FeatureGapSummary,
} from '@/hooks/use-ai-support';

// ── Helpers ─────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Status + Priority badges ─────────────────────────────────────

const STATUS_STYLES: Record<FeatureGapStatus, string> = {
  open: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  under_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  planned: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  shipped: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  dismissed: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const STATUS_LABELS: Record<FeatureGapStatus, string> = {
  open: 'Open',
  under_review: 'Under Review',
  planned: 'Planned',
  shipped: 'Shipped',
  dismissed: 'Dismissed',
};

const PRIORITY_STYLES: Record<FeatureGapPriority, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  low: 'bg-slate-700/50 text-slate-500 border-slate-600/20',
};

function StatusBadge({ status }: { status: FeatureGapStatus }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: FeatureGapPriority }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  );
}

// ── Summary KPI Row ──────────────────────────────────────────────

function SummaryRow({ summary }: { summary: FeatureGapSummary }) {
  const tiles = [
    {
      label: 'Total Gaps',
      value: fmtNum(summary.total),
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      sub: `${fmtNum(summary.totalOccurrences)} total asks`,
    },
    {
      label: 'Open',
      value: fmtNum(summary.openCount),
      color: summary.openCount > 0 ? 'text-blue-400' : 'text-slate-400',
      bg: summary.openCount > 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-slate-700/50 border-slate-600/30',
    },
    {
      label: 'Critical',
      value: fmtNum(summary.criticalCount),
      color: summary.criticalCount > 0 ? 'text-red-400' : 'text-slate-400',
      bg: summary.criticalCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-700/50 border-slate-600/30',
      sub: `${fmtNum(summary.highCount)} high`,
    },
    {
      label: 'Planned',
      value: fmtNum(summary.plannedCount),
      color: summary.plannedCount > 0 ? 'text-indigo-400' : 'text-slate-400',
      bg: summary.plannedCount > 0 ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-slate-700/50 border-slate-600/30',
      sub: `${fmtNum(summary.shippedCount)} shipped`,
    },
    {
      label: 'Modules Affected',
      value: fmtNum(summary.uniqueModules),
      color: 'text-slate-300',
      bg: 'bg-slate-700/50 border-slate-600/30',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      {tiles.map((tile) => (
        <div key={tile.label} className={`${tile.bg} rounded-lg border p-4`}>
          <p className="text-xs font-medium text-slate-500 mb-1">{tile.label}</p>
          <p className={`text-2xl font-bold ${tile.color}`}>{tile.value}</p>
          {tile.sub && <p className="text-xs text-slate-500 mt-1">{tile.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Expanded Row Detail ──────────────────────────────────────────

function GapDetail({
  gap,
  onUpdate,
}: {
  gap: FeatureGap;
  onUpdate: (id: string, data: { status?: FeatureGapStatus; priority?: FeatureGapPriority; adminNotes?: string }) => Promise<void>;
}) {
  const [status, setStatus] = useState<FeatureGapStatus>(gap.status);
  const [priority, setPriority] = useState<FeatureGapPriority>(gap.priority);
  const [notes, setNotes] = useState(gap.adminNotes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(gap.id, { status, priority, adminNotes: notes || undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td colSpan={7} className="px-4 py-4 bg-slate-800/80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Question details */}
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">Sample Question</h4>
            <p className="text-sm text-slate-200 bg-slate-900 rounded-lg p-3 mb-3">
              &ldquo;{gap.sampleQuestion}&rdquo;
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">First seen:</span>{' '}
                <span className="text-slate-300">{gap.firstSeenAt ? new Date(gap.firstSeenAt).toLocaleDateString() : '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Last seen:</span>{' '}
                <span className="text-slate-300">{timeAgo(gap.lastSeenAt)}</span>
              </div>
              <div>
                <span className="text-slate-500">Confidence:</span>{' '}
                <span className="text-slate-300">{gap.sampleConfidence ?? '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Normalized:</span>{' '}
                <span className="text-slate-300 font-mono text-[10px]">{gap.questionNormalized.slice(0, 60)}</span>
              </div>
            </div>

            {gap.sampleThreadId && (
              <a
                href={`/ai-assistant/${gap.sampleThreadId}`}
                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-3"
              >
                <ExternalLink size={11} />
                View Thread
              </a>
            )}
          </div>

          {/* Right: Admin controls */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor={`status-${gap.id}`} className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                <select
                  id={`status-${gap.id}`}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FeatureGapStatus)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                >
                  <option value="open">Open</option>
                  <option value="under_review">Under Review</option>
                  <option value="planned">Planned</option>
                  <option value="shipped">Shipped</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor={`priority-${gap.id}`} className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                <select
                  id={`priority-${gap.id}`}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as FeatureGapPriority)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor={`notes-${gap.id}`} className="block text-xs font-medium text-slate-400 mb-1">Admin Notes</label>
              <textarea
                id={`notes-${gap.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none"
                placeholder="e.g., Tracked in Linear as FEAT-123..."
              />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            {gap.reviewedBy && (
              <p className="text-[10px] text-slate-500">
                Last reviewed {timeAgo(gap.reviewedAt)}
              </p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

type SortMode = 'frequency' | 'recent' | 'priority';

export default function FeatureGapsPage() {
  const [statusFilter, setStatusFilter] = useState<FeatureGapStatus | ''>('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<FeatureGapPriority | ''>('');
  const [sortBy, setSortBy] = useState<SortMode>('frequency');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { gaps, summary, isLoading, error, reload } = useFeatureGaps({
    status: statusFilter || undefined,
    moduleKey: moduleFilter || undefined,
    priority: priorityFilter || undefined,
    sortBy,
  });

  // Unique modules for filter dropdown
  const modules = [...new Set(gaps.map((g) => g.moduleKey).filter(Boolean))] as string[];

  const handleUpdate = useCallback(
    async (id: string, data: { status?: FeatureGapStatus; priority?: FeatureGapPriority; adminNotes?: string }) => {
      await updateFeatureGap(id, data);
      reload();
    },
    [reload],
  );

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-6 max-w-350">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Lightbulb size={22} className="text-amber-400" />
            Feature Gaps
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Questions the AI couldn&apos;t answer — potential features, missing docs, or product gaps sorted by demand.
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Summary KPIs */}
      {summary && <SummaryRow summary={summary} />}

      {/* Insight banner */}
      {summary && summary.criticalCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{summary.criticalCount} critical gap{summary.criticalCount > 1 ? 's' : ''}</strong> detected
            — these questions are asked frequently and have no answer. Consider prioritizing.
          </p>
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Filter size={14} className="text-slate-500" />

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FeatureGapStatus | '')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="planned">Planned</option>
          <option value="shipped">Shipped</option>
          <option value="dismissed">Dismissed</option>
        </select>

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as FeatureGapPriority | '')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Module filter */}
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
        >
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <ArrowUpDown size={12} className="text-slate-500" />
          {(['frequency', 'recent', 'priority'] as SortMode[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                sortBy === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {s === 'frequency' ? 'Most Asked' : s === 'recent' ? 'Recent' : 'Priority'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && gaps.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-800 rounded-lg border border-slate-700 animate-pulse" />
          ))}
        </div>
      )}

      {/* Table */}
      {gaps.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Question</th>
                <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Module</th>
                <th className="text-right px-4 py-2 font-medium text-slate-400 text-xs">
                  <span className="flex items-center justify-end gap-1">
                    <TrendingUp size={11} />
                    Asks
                  </span>
                </th>
                <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Priority</th>
                <th className="text-left px-4 py-2 font-medium text-slate-400 text-xs">Status</th>
                <th className="text-right px-4 py-2 font-medium text-slate-400 text-xs">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {gaps.map((gap) => (
                <>
                  <tr
                    key={gap.id}
                    className="hover:bg-slate-700/40 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(gap.id)}
                  >
                    <td className="px-3 py-2.5 text-slate-500">
                      {expandedId === gap.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <span className="text-xs text-slate-200 line-clamp-2">{gap.sampleQuestion}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-slate-400">{gap.moduleKey ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-xs font-bold ${
                        gap.occurrenceCount >= 20 ? 'text-red-400' :
                        gap.occurrenceCount >= 10 ? 'text-orange-400' :
                        gap.occurrenceCount >= 5 ? 'text-amber-400' :
                        'text-slate-300'
                      }`}>
                        {gap.occurrenceCount}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <PriorityBadge priority={gap.priority} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={gap.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                      {timeAgo(gap.lastSeenAt)}
                    </td>
                  </tr>
                  {expandedId === gap.id && (
                    <GapDetail key={`detail-${gap.id}`} gap={gap} onUpdate={handleUpdate} />
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && gaps.length === 0 && !error && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-16 text-center">
          <Lightbulb className="mx-auto h-10 w-10 text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No feature gaps detected yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Gaps appear automatically when the AI assistant can&apos;t answer a question confidently.
          </p>
        </div>
      )}
    </div>
  );
}
