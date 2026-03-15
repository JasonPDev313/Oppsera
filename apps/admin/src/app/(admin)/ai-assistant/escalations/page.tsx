'use client';

import { Fragment, useState, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Headphones,
  RefreshCw,
  User,
} from 'lucide-react';
import {
  useEscalations,
  updateEscalation,
  type Escalation,
  type EscalationStatus,
  type EscalationPriority,
  type EscalationSummary,
} from '@/hooks/use-ai-support';

// ── Helpers ─────────────────────────────────────────────────────────

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

function fmtNum(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Status + Priority badges ─────────────────────────────────────

const STATUS_STYLES: Record<EscalationStatus, string> = {
  open: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  assigned: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const STATUS_LABELS: Record<EscalationStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_STYLES: Record<EscalationPriority, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  low: 'bg-slate-700/50 text-slate-500 border-slate-600/20',
};

const PRIORITY_LABELS: Record<EscalationPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function StatusBadge({ status }: { status: EscalationStatus }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: EscalationPriority }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

// ── Summary KPI Row ──────────────────────────────────────────────

function SummaryRow({ summary }: { summary: EscalationSummary }) {
  const tiles = [
    {
      label: 'Total',
      value: fmtNum(summary.total),
      color: 'text-slate-300',
      bg: 'bg-slate-700/50 border-slate-600/30',
    },
    {
      label: 'Open',
      value: fmtNum(summary.openCount),
      color: summary.openCount > 0 ? 'text-blue-400' : 'text-slate-400',
      bg: summary.openCount > 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-slate-700/50 border-slate-600/30',
      sub: `${fmtNum(summary.assignedCount)} assigned`,
    },
    {
      label: 'Critical',
      value: fmtNum(summary.criticalCount),
      color: summary.criticalCount > 0 ? 'text-red-400' : 'text-slate-400',
      bg: summary.criticalCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-700/50 border-slate-600/30',
      sub: `${fmtNum(summary.highCount)} high`,
    },
    {
      label: 'Resolved',
      value: fmtNum(summary.resolvedCount),
      color: summary.resolvedCount > 0 ? 'text-emerald-400' : 'text-slate-400',
      bg: summary.resolvedCount > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-700/50 border-slate-600/30',
      sub: `${fmtNum(summary.closedCount)} closed`,
    },
    {
      label: 'Avg Resolution',
      value: summary.avgResolutionMinutes != null
        ? summary.avgResolutionMinutes >= 60
          ? `${(summary.avgResolutionMinutes / 60).toFixed(1)}h`
          : `${Math.round(summary.avgResolutionMinutes)}m`
        : '—',
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

interface EscalationDetailProps {
  escalation: Escalation;
  onUpdate: (id: string, data: { status?: EscalationStatus; priority?: EscalationPriority; assignedTo?: string; resolutionNotes?: string }) => Promise<void>;
}

function EscalationDetail({ escalation: esc, onUpdate }: EscalationDetailProps) {
  const [status, setStatus] = useState<EscalationStatus>(esc.status);
  const [priority, setPriority] = useState<EscalationPriority>(esc.priority);
  const [assignedTo, setAssignedTo] = useState(esc.assignedTo ?? '');
  const [resolutionNotes, setResolutionNotes] = useState(esc.resolutionNotes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(esc.id, {
        status,
        priority,
        assignedTo: assignedTo || undefined,
        resolutionNotes: resolutionNotes || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td colSpan={7} className="px-4 py-4 bg-slate-800/80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Escalation details */}
          <div>
            <h4 className="text-xs font-medium text-slate-400 mb-2">User Request</h4>
            {esc.firstUserMessage && (
              <p className="text-sm text-slate-200 bg-slate-900 rounded-lg p-3 mb-3">
                &ldquo;{esc.firstUserMessage}&rdquo;
              </p>
            )}

            {esc.summary && (
              <>
                <h4 className="text-xs font-medium text-slate-400 mb-2">AI Summary</h4>
                <p className="text-sm text-slate-300 bg-slate-900/60 rounded-lg p-3 mb-3 italic">
                  {esc.summary}
                </p>
              </>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Reason:</span>{' '}
                <span className="text-slate-300">{esc.reason}</span>
              </div>
              <div>
                <span className="text-slate-500">Created:</span>{' '}
                <span className="text-slate-300">{timeAgo(esc.createdAt)}</span>
              </div>
              {esc.moduleKey && (
                <div>
                  <span className="text-slate-500">Module:</span>{' '}
                  <span className="text-slate-300">{esc.moduleKey}</span>
                </div>
              )}
              {esc.currentRoute && (
                <div>
                  <span className="text-slate-500">Route:</span>{' '}
                  <span className="text-slate-300 font-mono text-[10px]">{esc.currentRoute}</span>
                </div>
              )}
            </div>

            <a
              href={`/ai-assistant/${esc.threadId}`}
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-3"
            >
              <ExternalLink size={11} />
              View Thread
            </a>
          </div>

          {/* Right: Admin controls */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor={`status-${esc.id}`} className="block text-xs font-medium text-slate-400 mb-1">
                  Status
                </label>
                <select
                  id={`status-${esc.id}`}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EscalationStatus)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                >
                  <option value="open">Open</option>
                  <option value="assigned">Assigned</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor={`priority-${esc.id}`} className="block text-xs font-medium text-slate-400 mb-1">
                  Priority
                </label>
                <select
                  id={`priority-${esc.id}`}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as EscalationPriority)}
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
              <label htmlFor={`assignedTo-${esc.id}`} className="block text-xs font-medium text-slate-400 mb-1">
                Assign To (user ID or email)
              </label>
              <input
                id={`assignedTo-${esc.id}`}
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                placeholder="e.g. support@example.com"
              />
            </div>

            <div>
              <label htmlFor={`notes-${esc.id}`} className="block text-xs font-medium text-slate-400 mb-1">
                Resolution Notes
              </label>
              <textarea
                id={`notes-${esc.id}`}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none"
                placeholder="How was this resolved?"
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

            {esc.resolvedAt && (
              <p className="text-[10px] text-slate-500">
                Resolved {timeAgo(esc.resolvedAt)}
              </p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function EscalationsPage() {
  const [statusFilter, setStatusFilter] = useState<EscalationStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<EscalationPriority | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { escalations, summary, isLoading, error, reload } = useEscalations({
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
  });

  const handleUpdate = useCallback(
    async (id: string, data: Parameters<typeof updateEscalation>[1]) => {
      await updateEscalation(id, data);
      reload();
    },
    [reload],
  );

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Headphones className="text-indigo-400" size={22} />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Escalations</h1>
            <p className="text-sm text-slate-400">Human agent handoff requests from the AI assistant</p>
          </div>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      {summary && <SummaryRow summary={summary} />}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Filter size={14} className="text-slate-500" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EscalationStatus | '')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as EscalationPriority | '')}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300"
        >
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-4">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 w-8" />
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Request</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Module</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Assigned</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500 text-sm">
                  Loading escalations...
                </td>
              </tr>
            )}

            {!isLoading && escalations.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={24} />
                  <p className="text-slate-400 text-sm">No escalations found</p>
                  <p className="text-slate-500 text-xs mt-1">
                    {statusFilter ? 'Try clearing the status filter' : 'All clear!'}
                  </p>
                </td>
              </tr>
            )}

            {!isLoading &&
              escalations.map((esc) => (
                <Fragment key={esc.id}>
                  <tr
                    onClick={() => toggleExpand(esc.id)}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-500">
                      {expandedId === esc.id ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-sm text-slate-200 truncate">
                        {esc.firstUserMessage ?? esc.summary ?? '(no message)'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                        {esc.threadId.slice(-8)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={esc.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={esc.priority} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {esc.moduleKey ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {esc.assignedTo ? (
                        <span className="flex items-center gap-1">
                          <User size={11} />
                          {esc.assignedTo.length > 16
                            ? `${esc.assignedTo.slice(0, 16)}…`
                            : esc.assignedTo}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {timeAgo(esc.createdAt)}
                      </span>
                    </td>
                  </tr>

                  {expandedId === esc.id && (
                    <EscalationDetail
                      key={`detail-${esc.id}`}
                      escalation={esc}
                      onUpdate={handleUpdate}
                    />
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>

      {escalations.length > 0 && (
        <p className="text-xs text-slate-500 mt-3 text-right">
          {escalations.length} escalation{escalations.length !== 1 ? 's' : ''} shown
        </p>
      )}
    </div>
  );
}
