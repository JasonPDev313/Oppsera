'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  MessageSquarePlus, Search, Filter, RefreshCw, ChevronDown, ChevronRight,
  X, Clock, User, Building2, Sparkles, Zap, Bug, ArrowUpDown, TrendingUp,
  Gauge, CheckCircle2, Loader2, Download, Tag, AlertTriangle, Bell,
  BarChart3, Square, CheckSquare, Users, FileText,
} from 'lucide-react';
import {
  useFeatureRequests, computeSmartScore, isStale, getAgeDays,
} from '@/hooks/use-feature-requests';
import { adminFetch } from '@/lib/api-fetch';
import type {
  FeatureRequest, SmartScore, SimilarRequest, SubmitterHistoryItem,
} from '@/hooks/use-feature-requests';

// ── Constants ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; classes: string; dotColor: string }> = {
  submitted: { label: 'Submitted', classes: 'bg-blue-500/20 text-blue-400', dotColor: 'bg-blue-400' },
  under_review: { label: 'Under Review', classes: 'bg-amber-500/20 text-amber-400', dotColor: 'bg-amber-400' },
  planned: { label: 'Planned', classes: 'bg-indigo-500/20 text-indigo-400', dotColor: 'bg-indigo-400' },
  in_progress: { label: 'In Progress', classes: 'bg-purple-500/20 text-purple-400', dotColor: 'bg-purple-400' },
  completed: { label: 'Completed', classes: 'bg-green-500/20 text-green-400', dotColor: 'bg-green-400' },
  declined: { label: 'Declined', classes: 'bg-red-500/20 text-red-400', dotColor: 'bg-red-400' },
};

const PRIORITY_CONFIG: Record<string, { label: string; classes: string }> = {
  critical: { label: 'Critical', classes: 'bg-red-500/20 text-red-400 ring-red-500/30' },
  high: { label: 'High', classes: 'bg-amber-500/20 text-amber-400 ring-amber-500/30' },
  medium: { label: 'Medium', classes: 'bg-blue-500/20 text-blue-400 ring-blue-500/30' },
  low: { label: 'Low', classes: 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30' },
};

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string }> = {
  trivial: { label: 'Trivial', color: 'text-emerald-400' },
  easy: { label: 'Easy', color: 'text-green-400' },
  moderate: { label: 'Moderate', color: 'text-amber-400' },
  hard: { label: 'Hard', color: 'text-orange-400' },
  complex: { label: 'Complex', color: 'text-red-400' },
};

const TYPE_CFG: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  feature: { icon: Sparkles, color: 'text-indigo-400', label: 'Feature' },
  enhancement: { icon: Zap, color: 'text-amber-400', label: 'Enhancement' },
  bug: { icon: Bug, color: 'text-red-400', label: 'Bug' },
};

const PRESET_TAGS = ['quick-win', 'needs-spec', 'v2', 'ux', 'backend', 'infra', 'customer-facing', 'internal', 'deferred'];
type SortKey = 'date' | 'priority_rank' | 'impact' | 'difficulty';

// ── Helpers ──────────────────────────────────────────────────────

function relativeTime(d: string | null): string {
  if (!d) return 'unknown';
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Page ─────────────────────────────────────────────────────────

export default function FeatureRequestsPage() {
  const {
    items, stats, moduleStats, isLoading, error, filters, setFilters,
    hasMore, loadMore, refresh, updateStatus, updateOne, exportCsv,
  } = useFeatureRequests();

  const [sortKey, setSortKey] = useState<SortKey>('priority_rank');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [showModuleChart, setShowModuleChart] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  // Clear notification after 3s
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 3000);
    return () => clearTimeout(t);
  }, [notification]);

  const scoredItems = useMemo(() => items.map(item => ({ ...item, score: computeSmartScore(item) })), [items]);

  const sortedItems = useMemo(() => {
    const copy = [...scoredItems];
    switch (sortKey) {
      case 'date': copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case 'priority_rank': copy.sort((a, b) => b.score.priorityRank - a.score.priorityRank); break;
      case 'impact': copy.sort((a, b) => b.score.impactScore - a.score.impactScore); break;
      case 'difficulty': copy.sort((a, b) => a.score.difficultyScore - b.score.difficultyScore); break;
    }
    return copy;
  }, [scoredItems, sortKey]);

  const selectedItem = useMemo(() => sortedItems.find(i => i.id === selectedId) ?? null, [sortedItems, selectedId]);
  const handleSearch = useCallback(() => { setFilters(prev => ({ ...prev, search: searchInput || undefined })); }, [searchInput, setFilters]);
  const handleStatusFilter = useCallback((s: string | undefined) => { setFilters(prev => ({ ...prev, status: s })); setStatusDropdownOpen(false); }, [setFilters]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === sortedItems.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sortedItems.map(i => i.id)));
  }, [sortedItems, selectedIds.size]);

  const handleBulkAction = useCallback(async (status: string) => {
    if (selectedIds.size === 0) return;
    setBulkAction(status);
    try {
      await updateStatus(Array.from(selectedIds), status);
      setNotification(`${selectedIds.size} requests → ${STATUS_CONFIG[status]?.label ?? status}`);
      setSelectedIds(new Set());
    } finally {
      setBulkAction(null);
    }
  }, [selectedIds, updateStatus]);

  const handleUpdateOne = useCallback(async (id: string, updates: { status?: string; priority?: string; adminNotes?: string; tags?: string[] }) => {
    const result = await updateOne(id, updates);
    if (result.notificationQueued) {
      setNotification(`Status updated → notification queued for submitter`);
    }
    return result.data;
  }, [updateOne]);

  return (
    <div className="flex h-full">
      {/* Main list */}
      <div className={`flex-1 flex flex-col min-w-0 ${selectedItem ? 'max-w-[55%]' : ''}`}>
        <div className="p-6 pb-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
                <MessageSquarePlus size={22} className="text-indigo-400" />
                Feature Requests
              </h1>
              <p className="text-sm text-slate-400 mt-1">Triage, prioritize, and track user-submitted requests</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors">
                <Download size={13} /> Export CSV
              </button>
              <button onClick={refresh} disabled={isLoading} className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg text-xs hover:bg-slate-600 transition-colors disabled:opacity-50">
                <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* Notification toast */}
          {notification && (
            <div className="mb-3 flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-4 py-2 text-xs text-indigo-400">
              <Bell size={13} /> {notification}
            </div>
          )}

          {/* Stats cards */}
          {stats && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {([
                ['submitted', stats.submitted], ['under_review', stats.underReview],
                ['planned', stats.planned], ['in_progress', stats.inProgress],
                ['completed', stats.completed], ['declined', stats.declined],
              ] as [string, number][]).map(([key, count]) => {
                const cfg = STATUS_CONFIG[key]!;
                return (
                  <button key={key} onClick={() => handleStatusFilter(filters.status === key ? undefined : key)}
                    className={`rounded-lg border px-3 py-2 text-center transition-all ${filters.status === key ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-800 hover:border-slate-600'}`}
                  >
                    <p className="text-lg font-bold text-white tabular-nums">{count}</p>
                    <p className="text-[10px] text-slate-400">{cfg.label}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Module breakdown chart */}
          {showModuleChart && moduleStats.length > 0 && (
            <div className="mb-4 bg-slate-800 rounded-xl border border-slate-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <BarChart3 size={13} className="text-indigo-400" /> Requests by Module
                </h3>
                <button onClick={() => setShowModuleChart(false)} className="text-slate-500 hover:text-slate-300 p-0.5"><X size={12} /></button>
              </div>
              <div className="space-y-1.5">
                {moduleStats.slice(0, 8).map(ms => {
                  const maxCount = moduleStats[0]?.count ?? 1;
                  const pct = Math.max((ms.count / maxCount) * 100, 4);
                  return (
                    <button key={ms.module} onClick={() => setFilters(prev => ({ ...prev, module: prev.module === ms.module ? undefined : ms.module }))}
                      className={`w-full flex items-center gap-2 group ${filters.module === ms.module ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                    >
                      <span className="w-24 text-[10px] text-slate-400 truncate text-right">{ms.module}</span>
                      <div className="flex-1 h-4 bg-slate-700/50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500/60 group-hover:bg-indigo-500/80 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-[10px] text-slate-400 tabular-nums">{ms.count}</span>
                      <span className="w-8 text-[10px] text-emerald-400 tabular-nums">{ms.open}</span>
                    </button>
                  );
                })}
                <div className="flex items-center gap-2 text-[10px] text-slate-600 pl-[104px]">
                  <span>Total</span>
                  <span className="flex-1" />
                  <span className="w-8 text-right">open</span>
                </div>
              </div>
            </div>
          )}

          {/* Search + filters + sort + bulk */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search requests..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="relative">
              <button onClick={() => setStatusDropdownOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 hover:border-slate-600"
              >
                <Filter size={13} />
                {filters.status ? STATUS_CONFIG[filters.status]?.label ?? filters.status : 'All Status'}
                <ChevronDown size={12} />
              </button>
              {statusDropdownOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20">
                  <button onClick={() => handleStatusFilter(undefined)} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 rounded-t-lg">All Status</button>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button key={key} onClick={() => handleStatusFilter(key)} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 last:rounded-b-lg flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />{cfg.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg">
              <ArrowUpDown size={12} className="text-slate-500" />
              {([
                ['priority_rank', 'Smart Rank'], ['impact', 'Impact'], ['difficulty', 'Easiest'], ['date', 'Newest'],
              ] as [SortKey, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setSortKey(key)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${sortKey === key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* Bulk actions toolbar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-4 py-2">
              <span className="text-xs text-indigo-400 font-medium">{selectedIds.size} selected</span>
              <span className="text-slate-600">|</span>
              {['under_review', 'planned', 'completed', 'declined'].map(s => (
                <button key={s} onClick={() => handleBulkAction(s)} disabled={!!bulkAction}
                  className="px-2 py-1 rounded text-[10px] font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {bulkAction === s ? <Loader2 size={10} className="animate-spin" /> : STATUS_CONFIG[s]?.label}
                </button>
              ))}
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-300">Clear</button>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isLoading && items.length === 0 && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-slate-800 rounded-xl border border-slate-700 p-4 animate-pulse">
                  <div className="h-4 w-48 bg-slate-700 rounded mb-3" />
                  <div className="h-3 w-72 bg-slate-700/50 rounded mb-2" />
                  <div className="h-3 w-32 bg-slate-700/50 rounded" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
              <MessageSquarePlus className="mx-auto h-8 w-8 text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">No feature requests found</p>
              <p className="text-xs text-slate-500 mt-1">{filters.status || filters.search ? 'Try changing your filters.' : 'Feature requests from users will appear here.'}</p>
            </div>
          )}

          {/* Select all row */}
          {sortedItems.length > 0 && (
            <button type="button" onClick={selectAll} className="flex items-center gap-2 mb-2 text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
              {selectedIds.size === sortedItems.length ? <CheckSquare size={12} className="text-indigo-400" /> : <Square size={12} />}
              {selectedIds.size === sortedItems.length ? 'Deselect all' : 'Select all'}
            </button>
          )}

          <div className="space-y-2">
            {sortedItems.map(item => (
              <FeatureRequestRow
                key={item.id}
                item={item}
                score={item.score}
                isSelected={selectedId === item.id}
                isChecked={selectedIds.has(item.id)}
                onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
                onCheck={() => toggleSelect(item.id)}
              />
            ))}
          </div>

          {hasMore && (
            <button onClick={loadMore} className="mt-4 w-full py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
              Load more
            </button>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          score={selectedItem.score}
          onClose={() => setSelectedId(null)}
          onUpdate={handleUpdateOne}
          onSelectRequest={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}

// ── Row Component ────────────────────────────────────────────────

function FeatureRequestRow({
  item, score, isSelected, isChecked, onSelect, onCheck,
}: {
  item: FeatureRequest;
  score: SmartScore;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onCheck: () => void;
}) {
  const statusCfg = STATUS_CONFIG[item.status] ?? { label: item.status, classes: 'bg-slate-700 text-slate-400', dotColor: 'bg-slate-400' };
  const priorityCfg = PRIORITY_CONFIG[item.priority] ?? { label: item.priority, classes: '' };
  const typeCfg = TYPE_CFG[item.requestType] ?? TYPE_CFG.feature!;
  const TypeIcon = typeCfg.icon;
  const diffCfg = DIFFICULTY_CONFIG[score.difficulty]!;
  const stale = isStale(item);
  const ageDays = getAgeDays(item.createdAt);

  return (
    <div className={`flex items-start gap-2 bg-slate-800 rounded-xl border p-4 transition-all hover:border-slate-600 ${
      isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/30' : stale ? 'border-amber-500/40' : 'border-slate-700'
    }`}>
      {/* Checkbox */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onCheck(); }} className="mt-1 shrink-0 text-slate-500 hover:text-indigo-400 transition-colors">
        {isChecked ? <CheckSquare size={14} className="text-indigo-400" /> : <Square size={14} />}
      </button>

      {/* Main clickable area */}
      <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0"><TypeIcon size={16} className={typeCfg.color} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-white truncate">{item.title}</p>
              <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.classes}`}>{statusCfg.label}</span>
              {stale && (
                <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400">
                  <AlertTriangle size={9} /> {ageDays}d stale
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 line-clamp-1 mb-2">{item.description}</p>
            <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
              <span className="flex items-center gap-1"><Building2 size={10} />{item.tenantName ?? item.tenantId.slice(0, 8) + '...'}</span>
              <span className="flex items-center gap-1"><User size={10} />{item.submittedByName ?? item.submittedByEmail ?? 'Unknown'}</span>
              <span className="flex items-center gap-1"><Clock size={10} />{relativeTime(item.createdAt)}</span>
              <span className="text-slate-600">|</span>
              <span className={`font-medium ${priorityCfg.classes} rounded-full px-1.5 py-0 ring-1 ring-inset`}>{priorityCfg.label}</span>
              <span className="text-slate-600">|</span>
              <span>{item.module}{item.submodule ? ` > ${item.submodule}` : ''}</span>
              {item.tags && item.tags.length > 0 && (
                <>
                  <span className="text-slate-600">|</span>
                  {item.tags.slice(0, 3).map(t => (
                    <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-slate-700 px-1.5 py-0 text-[9px] text-slate-400">
                      <Tag size={7} />{t}
                    </span>
                  ))}
                  {item.tags.length > 3 && <span className="text-slate-600">+{item.tags.length - 3}</span>}
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={11} className="text-slate-500" />
              <span className="text-[10px] font-bold text-indigo-400 tabular-nums">{score.priorityRank}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge size={11} className="text-slate-500" />
              <span className={`text-[10px] font-medium ${diffCfg.color}`}>{diffCfg.label}</span>
            </div>
            {item.voteCount > 0 && (
              <span className="text-[10px] text-slate-500">{item.voteCount} votes</span>
            )}
            <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors mt-0.5" />
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────

function DetailPanel({
  item, score, onClose, onUpdate, onSelectRequest,
}: {
  item: FeatureRequest & { score: SmartScore };
  score: SmartScore;
  onClose: () => void;
  onUpdate: (id: string, updates: { status?: string; priority?: string; adminNotes?: string; tags?: string[] }) => Promise<FeatureRequest>;
  onSelectRequest: (id: string) => void;
}) {
  const [editNotes, setEditNotes] = useState(item.adminNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [editTags, setEditTags] = useState<string[]>(item.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [similar, setSimilar] = useState<SimilarRequest[]>([]);
  const [submitterHistory, setSubmitterHistory] = useState<SubmitterHistoryItem[]>([]);

  // Sync local state when item changes
  useEffect(() => { setEditNotes(item.adminNotes ?? ''); setEditTags(item.tags ?? []); }, [item.id, item.adminNotes, item.tags]);

  // Fetch detail data (similar + history)
  useEffect(() => {
    const controller = new AbortController();
    setSimilar([]); setSubmitterHistory([]);
    adminFetch<{ similar?: SimilarRequest[]; submitterHistory?: SubmitterHistoryItem[] }>(
      `/api/v1/feature-requests/${item.id}`, { signal: controller.signal },
    )
      .then(json => {
        setSimilar(json.similar ?? []);
        setSubmitterHistory(json.submitterHistory ?? []);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [item.id]);

  const statusCfg = STATUS_CONFIG[item.status] ?? { label: item.status, classes: '', dotColor: '' };
  const priorityCfg = PRIORITY_CONFIG[item.priority] ?? { label: item.priority, classes: '' };
  const typeCfg = TYPE_CFG[item.requestType] ?? TYPE_CFG.feature!;
  const TypeIcon = typeCfg.icon;
  const diffCfg = DIFFICULTY_CONFIG[score.difficulty]!;

  const handleStatusChange = async (s: string) => {
    setStatusChanging(true);
    try { await onUpdate(item.id, { status: s }); } finally { setStatusChanging(false); }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try { await onUpdate(item.id, { adminNotes: editNotes }); } finally { setSaving(false); }
  };

  const addTag = (t: string) => {
    const tag = t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tag || editTags.includes(tag)) return;
    const newTags = [...editTags, tag];
    setEditTags(newTags);
    setTagInput('');
    onUpdate(item.id, { tags: newTags });
  };

  const removeTag = (t: string) => {
    const newTags = editTags.filter(tag => tag !== t);
    setEditTags(newTags);
    onUpdate(item.id, { tags: newTags });
  };

  return (
    <div className="w-[45%] border-l border-slate-700 bg-slate-900/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2 min-w-0">
          <TypeIcon size={16} className={typeCfg.color} />
          <h2 className="text-sm font-semibold text-white truncate">{item.title}</h2>
        </div>
        <button onClick={onClose} className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700" aria-label="Close"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeCfg.color}`}>
            <TypeIcon size={12} />{typeCfg.label}
          </span>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityCfg.classes}`}>{priorityCfg.label}</span>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.classes}`}>{statusCfg.label}</span>
          {isStale(item) && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400">
              <AlertTriangle size={9} /> Stale ({getAgeDays(item.createdAt)}d)
            </span>
          )}
        </div>

        {/* Smart Score Card */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h3 className="text-xs font-medium text-slate-300 mb-3 flex items-center gap-1.5"><TrendingUp size={13} className="text-indigo-400" /> Smart Analysis</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center"><p className="text-2xl font-bold text-indigo-400 tabular-nums">{score.priorityRank}</p><p className="text-[10px] text-slate-500">Priority Rank</p></div>
            <div className="text-center"><p className={`text-lg font-bold ${diffCfg.color}`}>{diffCfg.label}</p><p className="text-[10px] text-slate-500">Difficulty</p></div>
            <div className="text-center"><p className="text-lg font-bold text-amber-400">{score.impact}</p><p className="text-[10px] text-slate-500">Impact</p></div>
          </div>
          <div className="space-y-2">
            <ScoreBar label="Difficulty" value={score.difficultyScore} gradient />
            <ScoreBar label="Impact" value={score.impactScore} />
          </div>
          {score.reasoning.length > 0 && (
            <div className="mt-3 space-y-1">
              {score.reasoning.map((r, i) => (<p key={i} className="text-[10px] text-slate-500">• {r}</p>))}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-3">
          <DetailField label="Module" value={item.submodule ? `${item.module} > ${item.submodule}` : item.module} />
          <DetailField label="Submitted By" value={`${item.submittedByName ?? 'Unknown'} (${item.submittedByEmail ?? 'no email'})`} />
          <DetailField label="Tenant" value={item.tenantName ?? item.tenantId} mono={!item.tenantName} />
          <DetailField label="Date" value={formatDate(item.createdAt)} />
          {item.voteCount > 0 && <DetailField label="Votes" value={String(item.voteCount)} />}
        </div>

        {/* Tags */}
        <div>
          <h3 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1"><Tag size={12} /> Tags</h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {editTags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2.5 py-0.5 text-[10px] text-slate-300">
                {t}
                <button onClick={() => removeTag(t)} className="text-slate-500 hover:text-red-400"><X size={9} /></button>
              </span>
            ))}
            {editTags.length === 0 && <span className="text-[10px] text-slate-600">No tags</span>}
          </div>
          <div className="flex gap-1.5">
            <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addTag(tagInput); e.preventDefault(); } }}
              placeholder="Add tag..." className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[10px] text-white placeholder:text-slate-600 focus:border-indigo-500"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {PRESET_TAGS.filter(t => !editTags.includes(t)).slice(0, 6).map(t => (
              <button key={t} onClick={() => addTag(t)} className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600">{t}</button>
            ))}
          </div>
        </div>

        {/* Description */}
        <TextSection title="Description" text={item.description} />
        {item.businessImpact && <TextSection title="Business Impact" text={item.businessImpact} />}
        {item.currentWorkaround && <TextSection title="Current Workaround" text={item.currentWorkaround} muted />}
        {item.additionalNotes && <TextSection title="Additional Notes" text={item.additionalNotes} muted />}

        {/* Status update */}
        <div>
          <h3 className="text-xs font-medium text-slate-300 mb-2">Update Status</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button key={key} disabled={statusChanging || item.status === key} onClick={() => handleStatusChange(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ring-1 ring-inset ${item.status === key ? `${cfg.classes} ring-current` : 'bg-slate-800 text-slate-400 ring-slate-700 hover:ring-slate-500 hover:text-slate-200'} disabled:opacity-50`}
              >{statusChanging ? <Loader2 size={12} className="animate-spin" /> : cfg.label}</button>
            ))}
          </div>
        </div>

        {/* Admin Notes */}
        <div>
          <h3 className="text-xs font-medium text-slate-300 mb-1.5">Admin Notes</h3>
          <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} placeholder="Internal notes..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
          />
          <button onClick={handleSaveNotes} disabled={saving || editNotes === (item.adminNotes ?? '')}
            className="mt-2 px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >{saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Save Notes</button>
        </div>

        {/* Similar Requests */}
        {similar.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1"><FileText size={12} /> Similar Requests</h3>
            <div className="space-y-1.5">
              {similar.map(s => {
                const sCfg = STATUS_CONFIG[s.status] ?? { label: s.status, classes: 'bg-slate-700 text-slate-400' };
                return (
                  <button key={s.id} onClick={() => onSelectRequest(s.id)} className="w-full text-left flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 hover:border-slate-600 transition-colors">
                    <span className="text-xs text-white truncate flex-1">{s.title}</span>
                    <span className={`shrink-0 text-[9px] rounded-full px-1.5 py-0.5 ${sCfg.classes}`}>{sCfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Submitter History */}
        {submitterHistory.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1">
              <Users size={12} /> {item.submittedByName ?? 'User'}&apos;s Other Requests ({submitterHistory.length})
            </h3>
            <div className="space-y-1.5">
              {submitterHistory.slice(0, 5).map(h => {
                const hCfg = STATUS_CONFIG[h.status] ?? { label: h.status, classes: 'bg-slate-700 text-slate-400' };
                return (
                  <button key={h.id} onClick={() => onSelectRequest(h.id)} className="w-full text-left flex items-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 hover:border-slate-600 transition-colors">
                    <span className="text-xs text-white truncate flex-1">{h.title}</span>
                    <span className="text-[9px] text-slate-500">{h.module}</span>
                    <span className={`shrink-0 text-[9px] rounded-full px-1.5 py-0.5 ${hCfg.classes}`}>{hCfg.label}</span>
                  </button>
                );
              })}
              {submitterHistory.length > 5 && (
                <p className="text-[10px] text-slate-600">+{submitterHistory.length - 5} more</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small Helpers ────────────────────────────────────────────────

function ScoreBar({ label, value, gradient }: { label: string; value: number; gradient?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
        <span>{label}</span><span>{value}/100</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${gradient ? 'bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function TextSection({ title, text, muted }: { title: string; text: string; muted?: boolean }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-slate-300 mb-1.5">{title}</h3>
      <p className={`text-sm whitespace-pre-wrap bg-slate-800 rounded-lg border border-slate-700 p-3 ${muted ? 'text-slate-400' : 'text-slate-300'}`}>{text}</p>
    </div>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-300 ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
    </div>
  );
}
