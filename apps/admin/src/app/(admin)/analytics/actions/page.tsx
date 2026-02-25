'use client';

import { useState } from 'react';
import {
  RefreshCw,
  Lightbulb,
  CheckCircle,
  Eye,
  XCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import { useActionItems, useActionItemMutations } from '@/hooks/use-analytics';
import type { ActionItem } from '@/hooks/use-analytics';

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'adoption_gap', label: 'Adoption Gap' },
  { value: 'high_error', label: 'High Error Rate' },
  { value: 'performance_degradation', label: 'Perf Degradation' },
  { value: 'stale_tenant', label: 'Stale Tenant' },
  { value: 'upsell_opportunity', label: 'Upsell Opportunity' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
];

// ── Badges ───────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-400 border-red-500/30',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${styles[severity] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
      {severity}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = {
    adoption_gap: 'Adoption Gap',
    high_error: 'High Errors',
    performance_degradation: 'Perf Issue',
    stale_tenant: 'Stale Tenant',
    upsell_opportunity: 'Upsell',
  };
  const colors: Record<string, string> = {
    adoption_gap: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    high_error: 'bg-red-500/10 text-red-400 border-red-500/30',
    performance_degradation: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    stale_tenant: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    upsell_opportunity: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${colors[category] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
      {labels[category] ?? category}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    reviewed: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    actioned: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dismissed: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${colors[status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
      {status}
    </span>
  );
}

// ── Stats Cards ──────────────────────────────────────────────────

function StatsCards({ stats }: { stats: { open: number; reviewed: number; actioned: number; dismissed: number } }) {
  const cards = [
    { label: 'Open', value: stats.open, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Reviewed', value: stats.reviewed, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'Actioned', value: stats.actioned, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Dismissed', value: stats.dismissed, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
  ];
  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div key={c.label} className={`${c.bg} rounded-lg border p-4`}>
          <p className="text-xs font-medium text-slate-500">{c.label}</p>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Expandable Item Row ──────────────────────────────────────────

function ActionItemRow({
  item,
  expanded,
  onToggle,
  onAction,
  isActing,
}: {
  item: ActionItem;
  expanded: boolean;
  onToggle: () => void;
  onAction: (id: string, status: 'reviewed' | 'actioned' | 'dismissed') => void;
  isActing: boolean;
}) {
  const [notes, setNotes] = useState('');

  return (
    <>
      <tr className="hover:bg-slate-700/50 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3">
          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
        </td>
        <td className="px-4 py-3"><SeverityBadge severity={item.severity} /></td>
        <td className="px-4 py-3"><CategoryBadge category={item.category} /></td>
        <td className="px-4 py-3">
          <p className="text-xs text-slate-200 font-medium">{item.title}</p>
        </td>
        <td className="px-4 py-3">
          {item.moduleKey && (
            <Link
              href={`/analytics/modules/${item.moduleKey}`}
              className="text-indigo-400 hover:text-indigo-300 text-xs font-mono"
              onClick={(e) => e.stopPropagation()}
            >
              {item.moduleKey}
            </Link>
          )}
        </td>
        <td className="px-4 py-3">
          {item.tenantId && (
            <Link
              href={`/tenants/${item.tenantId}`}
              className="text-indigo-400 hover:text-indigo-300 text-xs font-mono"
              onClick={(e) => e.stopPropagation()}
            >
              {item.tenantId.slice(0, 8)}...
            </Link>
          )}
        </td>
        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {new Date(item.createdAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          {item.status === 'open' && (
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => onAction(item.id, 'reviewed')}
                disabled={isActing}
                className="p-1.5 rounded hover:bg-slate-600 text-amber-400 hover:text-amber-300 transition-colors"
                title="Mark as Reviewed"
              >
                <Eye size={14} />
              </button>
              <button
                onClick={() => onAction(item.id, 'actioned')}
                disabled={isActing}
                className="p-1.5 rounded hover:bg-slate-600 text-emerald-400 hover:text-emerald-300 transition-colors"
                title="Mark as Actioned"
              >
                <CheckCircle size={14} />
              </button>
              <button
                onClick={() => onAction(item.id, 'dismissed')}
                disabled={isActing}
                className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-300 transition-colors"
                title="Dismiss"
              >
                <XCircle size={14} />
              </button>
            </div>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-800/50">
          <td colSpan={9} className="px-8 py-4">
            <div className="space-y-3">
              <p className="text-xs text-slate-300">{item.description}</p>

              {/* Metadata */}
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-400 mb-2">Details</p>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(item.metadata).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-[10px] text-slate-500">{k}:</span>
                        <span className="text-xs text-slate-300 ml-1">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review notes */}
              {item.reviewNotes && (
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-400 mb-1">Review Notes</p>
                  <p className="text-xs text-slate-300">{item.reviewNotes}</p>
                </div>
              )}

              {/* Inline notes input for open items */}
              {item.status === 'open' && (
                <div className="flex gap-2 items-end">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add review notes..."
                    className="flex-1 bg-slate-900 text-slate-200 rounded-lg px-3 py-2 text-xs border border-slate-600 placeholder:text-slate-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction(item.id, 'reviewed');
                    }}
                    disabled={isActing}
                    className="px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-500 transition-colors"
                  >
                    Review
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction(item.id, 'actioned');
                    }}
                    disabled={isActing}
                    className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500 transition-colors"
                  >
                    Action
                  </button>
                </div>
              )}

              <div className="flex gap-4 text-[10px] text-slate-500">
                <span>Expires: {new Date(item.expiresAt).toLocaleDateString()}</span>
                {item.reviewedBy && <span>Reviewed by: {item.reviewedBy}</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function ActionItemsPage() {
  const [statusFilter, setStatusFilter] = useState('open');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filters = {
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    severity: severityFilter || undefined,
  };

  const { data, isLoading, error, loadMore, refresh } = useActionItems(filters);
  const { updateStatus, generateItems, isActing } = useActionItemMutations();

  const handleAction = async (id: string, status: 'reviewed' | 'actioned' | 'dismissed') => {
    const ok = await updateStatus(id, status);
    if (ok) refresh();
  };

  const handleGenerate = async () => {
    const result = await generateItems();
    if (result) {
      refresh();
    }
  };

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Action Items</h1>
          <p className="text-sm text-slate-400 mt-1">
            Auto-generated insights from usage patterns. Review, action, or dismiss.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={isActing}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            <Zap size={13} />
            Generate Insights
          </button>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {data?.stats && <StatsCards stats={data.stats} />}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Filter size={14} className="text-slate-400" />
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs border border-slate-600"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs border border-slate-600"
        >
          {SEVERITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading && !data ? (
        <div className="text-center py-16 text-slate-400">Loading action items...</div>
      ) : !data?.items?.length ? (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
          <Lightbulb className="mx-auto h-8 w-8 text-slate-600 mb-3" />
          <p className="text-slate-300 font-medium">No action items</p>
          <p className="text-xs text-slate-500 mt-1">
            Click &quot;Generate Insights&quot; to analyze usage patterns and create action items.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-4 py-3 font-medium text-slate-400">Severity</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Category</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Title</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Module</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Tenant</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Created</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {data.items.map((item) => (
                <ActionItemRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onAction={handleAction}
                  isActing={isActing}
                />
              ))}
            </tbody>
          </table>
          {data.hasMore && (
            <div className="px-4 py-3 border-t border-slate-700 text-center">
              <button onClick={loadMore} className="text-sm text-indigo-400 hover:text-indigo-300">
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
