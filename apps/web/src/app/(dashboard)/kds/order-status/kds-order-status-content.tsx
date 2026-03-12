'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { apiFetch } from '@/lib/api-client';
import { SearchInput } from '@/components/ui/search-input';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { useReportFilters } from '@/hooks/use-report-filters';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Copy, History,
  Monitor, MoreHorizontal, RefreshCw, RotateCcw, Trash2, X, ChevronRight,
  Zap, Eye, XCircle, CircleDot, Archive, Loader2, BarChart3, Timer, TrendingUp,
} from 'lucide-react';
import type {
  KdsSendListItem, KdsSendDetail, KdsSendStatus, KdsSendEvent, KdsSendTicketItem,
} from '@/types/fnb';

// ── Types ────────────────────────────────────────────────────────

type Tab = 'active' | 'needs_attention' | 'history' | 'all';

interface ListResponse {
  data: KdsSendListItem[];
  meta: { cursor: string | null; hasMore: boolean; totalCount: number };
}

// ── Status config ────────────────────────────────────────────────

const STATUS_CONFIG: Record<KdsSendStatus, { label: string; color: string; icon: typeof Activity }> = {
  queued:    { label: 'Queued',    color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',   icon: Clock },
  sent:      { label: 'Sent',      color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',   icon: Zap },
  delivered: { label: 'Delivered', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',   icon: CheckCircle2 },
  displayed: { label: 'Displayed', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: Eye },
  failed:    { label: 'Failed',    color: 'bg-red-500/20 text-red-300 border-red-500/30',     icon: XCircle },
  orphaned:  { label: 'Orphaned',  color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: AlertTriangle },
  cleared:   { label: 'Cleared',   color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', icon: CheckCircle2 },
  deleted:   { label: 'Deleted',   color: 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30',  icon: Trash2 },
};

const ALL_STATUSES: KdsSendStatus[] = ['queued', 'sent', 'delivered', 'displayed', 'failed', 'orphaned', 'cleared', 'deleted'];

function StatusBadge({ status }: { status: KdsSendStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function SendTypeBadge({ sendType }: { sendType: string }) {
  const colors: Record<string, string> = {
    initial: 'text-zinc-400',
    retry: 'text-amber-400',
    manual_resend: 'text-cyan-400',
    fire_course: 'text-orange-400',
    recall: 'text-red-400',
    reroute: 'text-violet-400',
  };
  return (
    <span className={`text-xs font-medium ${colors[sendType] ?? 'text-zinc-400'}`}>
      {sendType.replace(/_/g, ' ')}
    </span>
  );
}

function formatAge(seconds: number | null): string {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatTime(ts: string | null): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {/* ignore */});
}

// ── KPI Card ──────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, accent }: {
  label: string; value: string; icon: typeof Activity; accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent ?? 'text-muted-foreground'}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function KdsOrderStatusContent() {
  const searchParams = useSearchParams();
  const { locations } = useAuthContext();
  const { session: terminalSession } = useTerminalSession();

  // Date range filters (for history/all tabs)
  const dateFilters = useReportFilters({ defaultPreset: 'last_7_days' });

  // Resolve location: URL param > terminal session > first available
  const [locationId, setLocationId] = useState(() => {
    const fromUrl = searchParams.get('locationId');
    if (fromUrl && locations?.some((l) => l.id === fromUrl)) return fromUrl;
    return terminalSession?.locationId ?? locations?.[0]?.id;
  });

  useEffect(() => {
    if (!locationId) {
      const fromUrl = searchParams.get('locationId');
      const match = fromUrl && locations?.some((l) => l.id === fromUrl)
        ? fromUrl
        : terminalSession?.locationId ?? locations?.[0]?.id;
      if (match) setLocationId(match);
    }
  }, [locationId, locations, searchParams, terminalSession?.locationId]);

  const [tab, setTab] = useState<Tab>('active');
  const [sends, setSends] = useState<KdsSendListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSend, setSelectedSend] = useState<KdsSendDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [stationFilter, setStationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const showDateFilter = tab === 'history' || tab === 'all';

  // Derived: whether any filters are active
  const hasActiveFilters = !!(searchQuery || stationFilter || statusFilter);

  // Unique stations from loaded data (for station filter dropdown)
  const stationOptions = useMemo(() => {
    const map = new Map<string, string>();
    sends.forEach((s) => map.set(s.stationId, s.stationName));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [sends]);

  // ── Fetch ──────────────────────────────────────────────────────

  const fetchSends = useCallback(async (resetCursor = true, signal?: AbortSignal) => {
    if (!locationId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ tab, locationId });
      if (!resetCursor && cursorRef.current) params.set('cursor', cursorRef.current);
      if (stationFilter) params.set('stationId', stationFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (showDateFilter) {
        params.set('dateFrom', dateFilters.dateFrom);
        params.set('dateTo', dateFilters.dateTo);
      }
      if (searchQuery.trim()) {
        const num = parseInt(searchQuery.trim(), 10);
        if (!isNaN(num) && num > 0) {
          params.set('ticketNumber', String(num));
        } else {
          params.set('sendToken', searchQuery.trim());
        }
      }
      const json = await apiFetch<ListResponse>(`/api/v1/fnb/kds-order-status?${params}`, { signal });
      if (signal?.aborted) return;
      if (resetCursor) {
        setSends(json.data);
        setSelectedIds(new Set());
      } else {
        setSends((prev) => [...prev, ...json.data]);
      }
      setTotalCount(json.meta.totalCount);
      cursorRef.current = json.meta.cursor;
      setHasMore(json.meta.hasMore);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[kds-order-status] fetch failed', err);
      setFetchError('Failed to load sends. Try refreshing.');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [locationId, tab, stationFilter, statusFilter, searchQuery, showDateFilter, dateFilters.dateFrom, dateFilters.dateTo]);

  // Initial fetch + safe polling (recursive setTimeout, never setInterval)
  useEffect(() => {
    const controller = new AbortController();
    fetchSends(true, controller.signal);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (tab === 'active' || tab === 'needs_attention') {
      const poll = () => {
        timeoutId = setTimeout(async () => {
          if (controller.signal.aborted) return;
          await fetchSends(true, controller.signal);
          if (!controller.signal.aborted) poll();
        }, 15_000);
      };
      poll();
    }

    return () => {
      controller.abort();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [locationId, tab, stationFilter, statusFilter, dateFilters.dateFrom, dateFilters.dateTo]);

  // Search handler — debounced via SearchInput component
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => fetchSends(true), 400);
  }, [fetchSends]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStationFilter('');
    setStatusFilter('');
    fetchSends(true);
  }, [fetchSends]);

  // ── Detail ─────────────────────────────────────────────────────

  const openDetail = async (sendId: string) => {
    setDetailLoading(true);
    try {
      const json = await apiFetch<{ data: KdsSendDetail }>(`/api/v1/fnb/kds-order-status/${sendId}`);
      setSelectedSend(json.data);
    } catch (err) {
      console.error('[kds-order-status] detail fetch failed', err);
      setActionError('Failed to load send details.');
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Single Actions ─────────────────────────────────────────────

  const locationHeaders = locationId ? { 'X-Location-Id': locationId } : undefined;

  const handleRetry = async (sendId: string) => {
    setActionLoading(sendId);
    setActionError(null);
    try {
      await apiFetch(`/api/v1/fnb/kds-order-status/${sendId}/retry`, { method: 'POST', headers: locationHeaders });
      await fetchSends(true);
      if (selectedSend?.id === sendId) setSelectedSend(null);
    } catch (err) {
      console.error('[kds-order-status] retry failed', err);
      setActionError('Retry failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClear = async (sendId: string) => {
    setActionLoading(sendId);
    setActionError(null);
    try {
      await apiFetch(`/api/v1/fnb/kds-order-status/${sendId}/clear`, {
        method: 'POST',
        headers: locationHeaders,
        body: JSON.stringify({ reason: 'Manually cleared by manager' }),
      });
      await fetchSends(true);
      if (selectedSend?.id === sendId) setSelectedSend(null);
    } catch (err) {
      console.error('[kds-order-status] clear failed', err);
      setActionError('Clear failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (sendId: string) => {
    setActionLoading(sendId);
    setActionError(null);
    try {
      await apiFetch(`/api/v1/fnb/kds-order-status/${sendId}/delete`, {
        method: 'POST',
        headers: locationHeaders,
        body: JSON.stringify({ reason: 'Cleared by manager' }),
      });
      await fetchSends(true);
      if (selectedSend?.id === sendId) setSelectedSend(null);
    } catch (err) {
      console.error('[kds-order-status] delete failed', err);
      setActionError('Delete failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Bulk Actions ───────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sends.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sends.map((s) => s.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    setActionError(null);
    try {
      await apiFetch('/api/v1/fnb/kds-order-status/bulk-delete', {
        method: 'POST',
        headers: locationHeaders,
        body: JSON.stringify({ sendIds: Array.from(selectedIds), reason: 'Bulk deleted by manager' }),
      });
      setSelectedIds(new Set());
      await fetchSends(true);
    } catch (err) {
      console.error('[kds-order-status] bulk delete failed', err);
      setActionError('Bulk delete failed. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkClear = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    setActionError(null);
    try {
      await apiFetch('/api/v1/fnb/kds-order-status/bulk-clear', {
        method: 'POST',
        headers: locationHeaders,
        body: JSON.stringify({ sendIds: Array.from(selectedIds), reason: 'Bulk cleared by manager' }),
      });
      setSelectedIds(new Set());
      await fetchSends(true);
    } catch (err) {
      console.error('[kds-order-status] bulk clear failed', err);
      setActionError('Bulk clear failed. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  // ── KPI Metrics ────────────────────────────────────────────────

  const kpiMetrics = useMemo(() => {
    let failedCount = 0, ageSum = 0, ageCount = 0, successCount = 0;
    for (const s of sends) {
      if (s.status === 'failed' || s.status === 'orphaned') failedCount++;
      if (s.ageSinceSentSeconds != null) { ageSum += s.ageSinceSentSeconds; ageCount++; }
      if (s.status === 'delivered' || s.status === 'displayed' || s.status === 'cleared') successCount++;
    }
    return {
      failedCount,
      avgAge: ageCount > 0 ? Math.round(ageSum / ageCount) : null,
      successRate: sends.length > 0 ? Math.round((successCount / sends.length) * 100) : 100,
    };
  }, [sends]);

  const tabs: { key: Tab; label: string; icon: typeof Activity }[] = [
    { key: 'active', label: 'Active', icon: Activity },
    { key: 'needs_attention', label: 'Needs Attention', icon: AlertTriangle },
    { key: 'history', label: 'History', icon: History },
    { key: 'all', label: 'All', icon: Archive },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">KDS Order Status</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Track, diagnose, and manage KDS send delivery lifecycle
            </p>
          </div>
          <button
            onClick={() => fetchSends(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex items-center gap-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSelectedIds(new Set()); }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
                ${tab === key
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-muted-foreground hover:bg-accent border border-transparent'}`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {key === 'needs_attention' && totalCount > 0 && tab === key && (
                <span className="ml-1 rounded-full bg-red-500/20 px-1.5 text-xs text-red-400">
                  {totalCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Date range filter bar — only shown for history/all tabs */}
      {showDateFilter && (
        <ReportFilterBar
          dateFrom={dateFilters.dateFrom}
          dateTo={dateFilters.dateTo}
          preset={dateFilters.preset}
          onDateChange={dateFilters.setDateRange}
          locationId={locationId ?? ''}
          onLocationChange={setLocationId}
          locations={locations ?? []}
          isLoading={isLoading}
          onRefresh={() => fetchSends(true)}
          onReset={dateFilters.reset}
          hideLocation
        />
      )}

      {/* Filters row */}
      <div className="border-b border-border px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search ticket # or send token..."
            debounceMs={400}
            className="flex-1 max-w-sm"
          />
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            aria-label="Station filter"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Stations</option>
            {stationOptions.map(({ id, name }) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          {(tab === 'history' || tab === 'all') && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Status filter"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          )}
          {/* Location selector (non-report tabs) */}
          {!showDateFilter && (locations?.length ?? 0) > 1 && (
            <select
              value={locationId ?? ''}
              onChange={(e) => setLocationId(e.target.value)}
              aria-label="Location"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {locations?.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">{totalCount} sends</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* KPI summary cards */}
      {sends.length > 0 && (
        <div className="border-b border-border px-6 py-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Total Sends" value={String(totalCount)} icon={BarChart3} accent="text-indigo-400" />
            <KpiCard
              label="Failed / Orphaned"
              value={String(kpiMetrics.failedCount)}
              icon={AlertTriangle}
              accent={kpiMetrics.failedCount > 0 ? 'text-red-400' : 'text-emerald-400'}
            />
            <KpiCard
              label="Avg Age"
              value={kpiMetrics.avgAge != null ? formatAge(kpiMetrics.avgAge) : '-'}
              icon={Timer}
              accent="text-amber-400"
            />
            <KpiCard
              label="Success Rate"
              value={`${kpiMetrics.successRate}%`}
              icon={TrendingUp}
              accent={kpiMetrics.successRate >= 95 ? 'text-emerald-400' : kpiMetrics.successRate >= 80 ? 'text-amber-400' : 'text-red-400'}
            />
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="border-b border-indigo-500/30 bg-indigo-500/10 px-6 py-2 flex items-center gap-3">
          <span className="text-sm font-medium text-indigo-400">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkClear}
            disabled={bulkLoading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Clear Selected
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
          {bulkLoading && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />}
        </div>
      )}

      {/* Error banners */}
      {(fetchError || actionError) && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {fetchError || actionError}
          </div>
          <button
            onClick={() => { setFetchError(null); setActionError(null); }}
            className="rounded p-0.5 hover:bg-red-500/20"
          >
            <X className="h-3.5 w-3.5 text-red-400" />
          </button>
        </div>
      )}

      {/* Body — Table + Detail Drawer */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main list */}
        <div className="flex-1 overflow-auto">
          {isLoading && sends.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Monitor className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No KDS sends found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {tab === 'active' ? 'No active KDS sends at this location right now.' :
                 tab === 'needs_attention' ? 'No KDS sends need attention — everything looks healthy.' :
                 'No sends match the current filters.'}
              </p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-surface">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === sends.length && sends.length > 0}
                        onChange={toggleSelectAll}
                        aria-label="Select all"
                        className="rounded border-border"
                      />
                    </th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Ticket #</th>
                    <th className="px-4 py-2 font-medium">Station</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Items</th>
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Sent</th>
                    <th className="px-4 py-2 font-medium">Age</th>
                    <th className="px-4 py-2 font-medium">Retries</th>
                    <th className="px-4 py-2 font-medium">Error</th>
                    <th className="px-4 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map((send) => {
                    const isStuck = send.needsAttention;
                    const isSelected = selectedIds.has(send.id);
                    return (
                      <tr
                        key={send.id}
                        onClick={() => openDetail(send.id)}
                        className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/50
                          ${isStuck ? 'bg-red-500/5' : ''}
                          ${isSelected ? 'bg-indigo-500/10' : ''}
                          ${selectedSend?.id === send.id ? 'bg-indigo-500/10' : ''}`}
                      >
                        <td className="px-2 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => { e.stopPropagation(); toggleSelect(send.id); }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select send ${send.ticketNumber}`}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={send.status} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-semibold text-foreground">#{send.ticketNumber}</span>
                          {send.tableName && (
                            <span className="ml-1.5 text-xs text-muted-foreground">{send.tableName}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-foreground">{send.stationName}</td>
                        <td className="px-4 py-2.5"><SendTypeBadge sendType={send.sendType} /></td>
                        <td className="px-4 py-2.5 text-muted-foreground">{send.itemCount}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{send.employeeName ?? '-'}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{formatTime(send.sentAt ?? send.queuedAt)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-mono ${
                            (send.ageSinceSentSeconds ?? 0) > 300 ? 'text-red-400' :
                            (send.ageSinceSentSeconds ?? 0) > 120 ? 'text-amber-400' : 'text-muted-foreground'
                          }`}>
                            {formatAge(send.ageSinceSentSeconds)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {send.retryCount > 0 ? (
                            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                              {send.retryCount}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {send.errorCode ? (
                            <span className="text-xs font-mono text-red-400" title={send.errorDetail ?? undefined}>
                              {send.errorCode}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <ActionMenu
                            send={send}
                            loading={actionLoading === send.id}
                            onRetry={() => handleRetry(send.id)}
                            onClear={() => handleClear(send.id)}
                            onDelete={() => handleDelete(send.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasMore && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={() => fetchSends(false)}
                    disabled={isLoading}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail drawer */}
        {(selectedSend || detailLoading) && (
          <DetailDrawer
            send={selectedSend}
            loading={detailLoading}
            actionLoading={actionLoading}
            onClose={() => setSelectedSend(null)}
            onRetry={handleRetry}
            onClear={handleClear}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ── Action Menu ──────────────────────────────────────────────────

function ActionMenu({
  send,
  loading,
  onRetry,
  onClear,
  onDelete,
}: {
  send: KdsSendListItem;
  loading: boolean;
  onRetry: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded p-1 hover:bg-accent"
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 min-w-40 rounded-lg border border-border bg-surface shadow-lg">
          <div className="py-1">
            {(send.status === 'failed' || send.status === 'orphaned') && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); onRetry(); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry Send
              </button>
            )}
            {send.status !== 'cleared' && send.status !== 'deleted' && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); onClear(); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark Cleared
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); copyToClipboard(send.sendToken); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Token
            </button>
            {send.status !== 'deleted' && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-accent"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Soft Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail Drawer ────────────────────────────────────────────────

function DetailDrawer({
  send,
  loading,
  actionLoading,
  onClose,
  onRetry,
  onClear,
  onDelete,
}: {
  send: KdsSendDetail | null;
  loading: boolean;
  actionLoading: string | null;
  onClose: () => void;
  onRetry: (id: string) => void;
  onClear: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="w-105 border-l border-border bg-surface flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!send) return null;

  return (
    <div className="w-105 shrink-0 overflow-auto border-l border-border bg-surface">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-foreground">#{send.ticketNumber}</span>
              <StatusBadge status={send.status} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{send.stationName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent" aria-label="Close detail">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Key info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <DetailField label="Send Token" value={send.sendToken} mono copyable />
          {send.priorSendToken && <DetailField label="Prior Token" value={send.priorSendToken} mono />}
          <DetailField label="Send Type" value={send.sendType.replace(/_/g, ' ')} />
          <DetailField label="Routing" value={send.routingReason ?? '-'} />
          <DetailField label="Order Type" value={send.orderType ?? '-'} />
          <DetailField label="Items" value={String(send.itemCount)} />
          <DetailField label="Table" value={send.tableName ?? '-'} />
          <DetailField label="Guest" value={send.guestName ?? '-'} />
          <DetailField label="Terminal" value={send.terminalName ?? '-'} />
          <DetailField label="Employee" value={send.employeeName ?? '-'} />
          <DetailField label="Business Date" value={send.businessDate} />
          <DetailField label="Retries" value={String(send.retryCount)} />
        </div>

        {/* Latency metrics */}
        {(send.deliveryLatencyMs != null || send.displayLatencyMs != null) && (
          <div className="rounded-lg border border-border p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Latency</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {send.deliveryLatencyMs != null && (
                <div>
                  <span className="text-xs text-muted-foreground">Delivery</span>
                  <p className="font-mono tabular-nums text-foreground">{send.deliveryLatencyMs}ms</p>
                </div>
              )}
              {send.displayLatencyMs != null && (
                <div>
                  <span className="text-xs text-muted-foreground">Display</span>
                  <p className="font-mono tabular-nums text-foreground">{send.displayLatencyMs}ms</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="rounded-lg border border-border p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Timestamps</h3>
          <div className="space-y-1 text-xs">
            <TimestampRow label="Queued" ts={send.queuedAt} />
            <TimestampRow label="Sent" ts={send.sentAt} />
            <TimestampRow label="Delivered" ts={send.deliveredAt} />
            <TimestampRow label="Displayed" ts={send.displayedAt} />
            <TimestampRow label="First Interaction" ts={send.firstInteractionAt} />
            <TimestampRow label="Completed" ts={send.completedAt} />
            {send.failedAt && <TimestampRow label="Failed" ts={send.failedAt} error />}
            {send.clearedAt && <TimestampRow label="Cleared" ts={send.clearedAt} />}
            {send.deletedAt && <TimestampRow label="Deleted" ts={send.deletedAt} />}
          </div>
        </div>

        {/* Error details */}
        {send.errorCode && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase text-red-400">Error</h3>
            <p className="font-mono text-sm font-medium text-red-400">{send.errorCode}</p>
            {send.errorDetail && (
              <p className="mt-1 text-xs text-red-400/80">{send.errorDetail}</p>
            )}
          </div>
        )}

        {/* Ticket items */}
        {send.ticketItems.length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Ticket Items ({send.ticketItems.length})
            </h3>
            <div className="space-y-1.5">
              {send.ticketItems.map((item) => (
                <TicketItemRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Event timeline */}
        {send.events.length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Event Timeline ({send.events.length})
            </h3>
            <div className="space-y-2">
              {send.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          {(send.status === 'failed' || send.status === 'orphaned') && (
            <button
              onClick={() => onRetry(send.id)}
              disabled={actionLoading === send.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-3 py-1.5 text-sm font-medium text-indigo-400 hover:bg-indigo-500/25 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry Send
            </button>
          )}
          {send.status !== 'cleared' && send.status !== 'deleted' && (
            <button
              onClick={() => onClear(send.id)}
              disabled={actionLoading === send.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
          <button
            onClick={() => copyToClipboard(send.sendToken)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Token
          </button>
          {send.status !== 'deleted' && (
            <button
              onClick={() => onDelete(send.id)}
              disabled={actionLoading === send.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function DetailField({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <p className={`text-foreground truncate ${mono ? 'font-mono text-xs' : 'text-sm'}`} title={value}>
          {value}
        </p>
        {copyable && (
          <button
            onClick={(e) => { e.stopPropagation(); copyToClipboard(value); }}
            className="shrink-0 rounded p-0.5 hover:bg-accent"
            title="Copy"
          >
            <Copy className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

function TimestampRow({ label, ts, error }: { label: string; ts: string | null; error?: boolean }) {
  if (!ts) return null;
  return (
    <div className="flex items-center justify-between">
      <span className={error ? 'text-red-400' : 'text-muted-foreground'}>{label}</span>
      <span className={`font-mono tabular-nums ${error ? 'text-red-400' : 'text-foreground'}`}>
        {formatTime(ts)}
      </span>
    </div>
  );
}

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Pending',  color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' },
  cooking:  { label: 'Cooking',  color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  ready:    { label: 'Ready',    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  served:   { label: 'Served',   color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  voided:   { label: 'Voided',   color: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

function ItemStatusBadge({ status }: { status: string }) {
  const cfg = ITEM_STATUS_CONFIG[status] ?? { label: status, color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function TicketItemRow({ item }: { item: KdsSendTicketItem }) {
  return (
    <div className="flex items-start justify-between rounded border border-border/50 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-foreground">{item.kitchenLabel ?? item.itemName}</span>
          {item.quantity > 1 && (
            <span className="rounded bg-accent/50 px-1 text-xs text-muted-foreground">x{item.quantity}</span>
          )}
          {item.isRush && <span className="rounded bg-red-500/20 px-1 text-xs text-red-400">RUSH</span>}
          {item.isAllergy && <span className="rounded bg-amber-500/20 px-1 text-xs text-amber-400">ALLERGY</span>}
          {item.isVip && <span className="rounded bg-violet-500/20 px-1 text-xs text-violet-400">VIP</span>}
        </div>
        {item.modifierSummary && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.modifierSummary}</p>
        )}
        {item.specialInstructions && (
          <p className="mt-0.5 text-xs italic text-amber-400/80">{item.specialInstructions}</p>
        )}
      </div>
      <ItemStatusBadge status={item.itemStatus} />
    </div>
  );
}

function EventRow({ event }: { event: KdsSendEvent }) {
  const typeColors: Record<string, string> = {
    queued: 'text-zinc-400',
    dispatched: 'text-blue-400',
    sent: 'text-blue-400',
    delivery_ack: 'text-cyan-400',
    display_ack: 'text-emerald-400',
    interaction: 'text-emerald-400',
    status_change: 'text-indigo-400',
    retry: 'text-amber-400',
    failed: 'text-red-400',
    cleared: 'text-indigo-400',
    deleted: 'text-zinc-500',
    error: 'text-red-400',
  };

  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">
        <CircleDot className={`h-3 w-3 ${typeColors[event.eventType] ?? 'text-muted-foreground'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${typeColors[event.eventType] ?? 'text-muted-foreground'}`}>
            {event.eventType.replace(/_/g, ' ')}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{formatTime(event.eventAt)}</span>
        </div>
        {event.actorName && (
          <p className="text-[11px] text-muted-foreground">by {event.actorName}</p>
        )}
        {event.newStatus && event.previousStatus && (
          <p className="text-[11px] text-muted-foreground">
            {event.previousStatus} <ChevronRight className="inline h-2.5 w-2.5" /> {event.newStatus}
          </p>
        )}
      </div>
    </div>
  );
}
