'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, ArrowDown, ArrowUp, Check, SkipForward, Clock, AlertCircle } from 'lucide-react';
import { useBatchReview } from '@/hooks/use-eval-training';
import type { ReviewAssignment } from '@/types/eval';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'skipped', label: 'Skipped' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function getPriorityClasses(priority: string): string {
  switch (priority) {
    case 'low': return 'bg-slate-600/20 text-slate-400';
    case 'normal': return 'bg-blue-500/20 text-blue-400';
    case 'high': return 'bg-yellow-500/20 text-yellow-400';
    case 'urgent': return 'bg-red-500/20 text-red-400 animate-pulse';
    default: return 'bg-slate-600/20 text-slate-400';
  }
}

function getStatusClasses(status: string): string {
  switch (status) {
    case 'pending': return 'bg-slate-600/20 text-slate-400';
    case 'in_progress': return 'bg-blue-500/20 text-blue-400';
    case 'completed': return 'bg-green-500/20 text-green-400';
    case 'skipped': return 'bg-yellow-500/20 text-yellow-400';
    default: return 'bg-slate-600/20 text-slate-400';
  }
}

function formatStatusLabel(status: string): string {
  return status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Assignment Card ──────────────────────────────────────────────

function AssignmentCard({
  assignment,
  isSelected,
  onSelect,
  onAction,
}: {
  assignment: ReviewAssignment;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (status: 'in_progress' | 'completed' | 'skipped') => void;
}) {
  return (
    <div
      className={`bg-slate-800 rounded-xl p-5 border transition-colors cursor-pointer ${
        isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/30' : 'border-slate-700 hover:border-slate-600'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white line-clamp-2">{assignment.turnUserMessage ?? '(no message)'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded capitalize ${getPriorityClasses(assignment.priority)}`}>
            {assignment.priority}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${getStatusClasses(assignment.status)}`}>
            {formatStatusLabel(assignment.status)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        {assignment.turnQualityScore != null && (
          <span className="text-xs text-slate-400">
            Quality: <span className={
              assignment.turnQualityScore > 0.7 ? 'text-green-400' :
              assignment.turnQualityScore > 0.4 ? 'text-yellow-400' : 'text-red-400'
            }>{Math.round(assignment.turnQualityScore * 100)}%</span>
          </span>
        )}
        {assignment.turnQualityFlags && assignment.turnQualityFlags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {assignment.turnQualityFlags.map((flag) => (
              <span key={flag} className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                {flag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock size={11} />
          <span>Assigned to {assignment.assignedTo}</span>
          {assignment.dueAt && (
            <span>· Due {new Date(assignment.dueAt).toLocaleDateString()}</span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {assignment.status === 'pending' && (
            <button
              onClick={() => onAction('in_progress')}
              className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Start Review
            </button>
          )}
          {(assignment.status === 'pending' || assignment.status === 'in_progress') && (
            <>
              <button
                onClick={() => onAction('skipped')}
                className="px-3 py-1.5 bg-slate-700 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-1"
              >
                <SkipForward size={11} />
                Skip
              </button>
              <button
                onClick={() => onAction('completed')}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
              >
                <Check size={11} />
                Complete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Assign Form ──────────────────────────────────────────────────

function AssignForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: { evalTurnIds: string[]; assignedTo: string; priority: 'low' | 'normal' | 'high' | 'urgent'; dueAt?: string }) => void;
  onCancel: () => void;
}) {
  const [turnIds, setTurnIds] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [dueAt, setDueAt] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ids = turnIds.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0 || !assignedTo) return;
    onSubmit({
      evalTurnIds: ids,
      assignedTo,
      priority,
      ...(dueAt && { dueAt }),
    });
  }

  const inputClass = 'w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelClass = 'block text-xs font-medium text-slate-400 mb-1';

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 space-y-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">Assign Turns for Review</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-white text-xs">
          Cancel
        </button>
      </div>

      <div>
        <label className={labelClass}>Turn IDs (one per line or comma-separated)</label>
        <textarea
          value={turnIds}
          onChange={(e) => setTurnIds(e.target.value)}
          rows={3}
          placeholder="Paste eval turn IDs here..."
          className={inputClass}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Assign To</label>
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="admin@oppsera.com"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')}
            className={inputClass}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Due Date (optional)</label>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <button
        type="submit"
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Assign Turns
      </button>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function BatchReviewPage() {
  const { data, isLoading, error, load, assign, updateStatus } = useBatchReview();
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assignedToFilter, setAssignedToFilter] = useState('');
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fetchData = useCallback(async () => {
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (assignedToFilter) params.assignedTo = assignedToFilter;
    await load(params);
  }, [load, statusFilter, priorityFilter, assignedToFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const assignments = data?.assignments ?? [];

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, assignments.length - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = assignments[selectedIndex];
        if (item && item.status === 'pending') {
          handleAction(item.id, 'in_progress');
        }
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        const item = assignments[selectedIndex];
        if (item && (item.status === 'pending' || item.status === 'in_progress')) {
          handleAction(item.id, 'skipped');
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assignments, selectedIndex]);

  async function handleAction(id: string, status: 'in_progress' | 'completed' | 'skipped') {
    try {
      await updateStatus(id, status);
      await fetchData();
    } catch {
      // error is handled by hook
    }
  }

  async function handleAssign(payload: { evalTurnIds: string[]; assignedTo: string; priority: 'low' | 'normal' | 'high' | 'urgent'; dueAt?: string }) {
    try {
      await assign(payload);
      setShowAssignForm(false);
      await fetchData();
    } catch {
      // error is handled by hook
    }
  }

  const stats = data?.stats ?? { pending: 0, inProgress: 0, completed: 0, skipped: 0 };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <ClipboardList size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Batch Review Queue</h1>
            <p className="text-sm text-slate-400 mt-0.5">Review eval turns in bulk with keyboard shortcuts</p>
          </div>
        </div>
        {!showAssignForm && (
          <button
            onClick={() => setShowAssignForm(true)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Assign Turns
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Pending</p>
          <p className="text-lg font-bold text-white">{stats.pending}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 mb-1">In Progress</p>
          <p className="text-lg font-bold text-blue-400">{stats.inProgress}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Completed</p>
          <p className="text-lg font-bold text-green-400">{stats.completed}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Skipped</p>
          <p className="text-lg font-bold text-yellow-400">{stats.skipped}</p>
        </div>
      </div>

      {/* Assign form */}
      {showAssignForm && (
        <AssignForm onSubmit={handleAssign} onCancel={() => setShowAssignForm(false)} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by assignee..."
          value={assignedToFilter}
          onChange={(e) => setAssignedToFilter(e.target.value)}
          className="flex-1 min-w-40 bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
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

      {/* List */}
      {!isLoading && (
        <div className="space-y-3">
          {assignments.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <AlertCircle size={24} className="mx-auto mb-3 text-slate-600" />
              <p>No review assignments found. Use "Assign Turns" to add turns to the queue.</p>
            </div>
          ) : (
            assignments.map((assignment, i) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                isSelected={i === selectedIndex}
                onSelect={() => setSelectedIndex(i)}
                onAction={(status) => handleAction(assignment.id, status)}
              />
            ))
          )}

          {data?.hasMore && (
            <button
              onClick={() => {
                const params: Record<string, string> = {};
                if (statusFilter) params.status = statusFilter;
                if (priorityFilter) params.priority = priorityFilter;
                if (assignedToFilter) params.assignedTo = assignedToFilter;
                if (data.cursor) params.cursor = data.cursor;
                load(params);
              }}
              className="w-full py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl hover:border-slate-600 transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}

      {/* Keyboard shortcuts */}
      <div className="mt-6 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="flex items-center gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300 font-mono">J</kbd>
            <ArrowDown size={10} />
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300 font-mono">K</kbd>
            <ArrowUp size={10} />
            Navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300 font-mono">Enter</kbd>
            Start Review
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300 font-mono">S</kbd>
            Skip
          </span>
        </div>
      </div>
    </div>
  );
}
