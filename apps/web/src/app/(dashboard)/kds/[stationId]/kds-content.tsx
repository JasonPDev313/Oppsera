'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { useKdsView, useKdsHistory } from '@/hooks/use-fnb-kitchen';
import { useKdsAudioAlerts } from '@/hooks/use-kds-audio-alerts';
import { StationHeader } from '@/components/fnb/kitchen/StationHeader';
import { TicketCard } from '@/components/fnb/kitchen/TicketCard';
import { AllDaySummary } from '@/components/fnb/kitchen/AllDaySummary';
import { ItemSummaryPanel, ItemSummaryToggle } from '@/components/fnb/kitchen/ItemSummaryPanel';
import { KitchenBehindBanner } from '@/components/fnb/kitchen/KitchenBehindBanner';
import { StaleDataBanner } from '@/components/fnb/kitchen/StaleDataBanner';
import { CourseTimeline } from '@/components/fnb/kitchen/CourseTimeline';
// Station messaging hidden for launch — local-only state, does not reach other stations.
// Requires Supabase Realtime broadcast or a backend table before re-enabling.
// import { StationMessages, StationMessageToggle, StationMessagePanel } from '@/components/fnb/kitchen/StationMessages';
import { RecallRefireDialog } from '@/components/fnb/kitchen/RecallRefireDialog';
import { apiFetch } from '@/lib/api-client';
import {
  ArrowLeft, LayoutGrid, LayoutList, SplitSquareHorizontal,
  Keyboard as KeyboardIcon, Hand, Pause, Play,
  Minimize2, Maximize2, History, MapPin, HelpCircle,
  RotateCcw, Clock,
} from 'lucide-react';

type ViewMode = 'ticket_rail' | 'grid' | 'split';
type Density = 'compact' | 'standard' | 'comfortable';

// Effectively infinite interval to stop polling when paused
const PAUSED_INTERVAL = 999_999_999;

// ── Smart Auto-Prioritization (#3) ─────────────────────────────────
// Score each ticket for intelligent sorting. Higher score = show first.
function computePriorityScore(ticket: {
  priorityLevel: number;
  elapsedSeconds: number;
  items: Array<{ isRush: boolean; isAllergy: boolean; isVip: boolean; itemStatus: string }>;
  estimatedPickupAt: string | null;
  orderType: string | null;
  alertLevel?: 'normal' | 'warning' | 'critical';
}): number {
  let score = ticket.priorityLevel * 1000;

  // Allergy items get highest boost — safety critical
  if (ticket.items.some((i) => i.isAllergy)) score += 5000;
  // VIP items get a significant boost
  if (ticket.items.some((i) => i.isVip)) score += 3000;
  // Rush items get a boost
  if (ticket.items.some((i) => i.isRush)) score += 2000;

  // Alert level boost — overdue tickets must be addressed
  if (ticket.alertLevel === 'critical') score += 4000;
  else if (ticket.alertLevel === 'warning') score += 1500;

  // Elapsed time — longer wait = higher priority (normalized to ~0-1000 range)
  score += Math.min(ticket.elapsedSeconds / 2, 1000);

  // Pickup ETA approaching — boost takeout/delivery with imminent pickup
  if (ticket.estimatedPickupAt) {
    const pickupMs = new Date(ticket.estimatedPickupAt).getTime();
    const minutesUntilPickup = (pickupMs - Date.now()) / 60000;
    if (minutesUntilPickup < 5) score += 3000;      // under 5 min — urgent
    else if (minutesUntilPickup < 15) score += 1500; // under 15 min — high
    else if (minutesUntilPickup < 30) score += 500;  // under 30 min — medium
  }

  // Partially ready tickets get a small boost (finish what you started)
  const readyCount = ticket.items.filter((i) => i.itemStatus === 'ready').length;
  const activeCount = ticket.items.filter((i) => i.itemStatus !== 'voided').length;
  if (readyCount > 0 && readyCount < activeCount) score += 800;

  return score;
}

export default function KdsContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const stationId = params.stationId as string;
  const { locations } = useAuthContext();
  const { session: terminalSession } = useTerminalSession();
  const fromUrl = searchParams.get('locationId');
  const locationIdFromUrl = fromUrl && locations?.some((l) => l.id === fromUrl) ? fromUrl : null;
  const locationId = locationIdFromUrl ?? terminalSession?.locationId ?? locations?.[0]?.id;
  // Detect silent fallback: URL had a locationId but it didn't match any known location
  const locationFellBack = fromUrl !== null && locationIdFromUrl === null;
  const resolvedLocationName = locations?.find((l) => l.id === locationId)?.name;
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('ticket_rail');
  const [density, setDensity] = useState<Density>('standard');
  const [inputMode, setInputMode] = useState<'touch' | 'bump_bar'>('touch');
  const [focusedTicketIdx, setFocusedTicketIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [kdsMode, setKdsMode] = useState<'live' | 'history'>('live');
  // Station messaging disabled for launch (local-only — see StationMessages.tsx)
  // const [showMessages, setShowMessages] = useState(false);
  const [recallRefire, setRecallRefire] = useState<{
    mode: 'recall' | 'refire';
    itemId: string;
    itemName: string;
  } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Single businessDate source: URL param → browser-local today. Both hooks share this
  // so live and history always query the same business date.
  const businessDate = searchParams.get('businessDate') ?? new Date().toLocaleDateString('en-CA');

  const {
    kdsView,
    isLoading,
    error,
    bumpItem,
    bumpTicket,
    recallItem,
    callBack: _callBack,
    refireItem,
    isActing,
    refresh,
    lastRefreshedAt,
  } = useKdsView({ stationId, locationId, businessDate, pollIntervalMs: isPaused ? PAUSED_INTERVAL : 5000 });

  const {
    historyView,
    isLoading: isHistoryLoading,
    error: historyError,
    refresh: refreshHistory,
  } = useKdsHistory({ stationId, locationId, businessDate, enabled: kdsMode === 'history' });

  const handleBumpItem = useCallback((ticketItemId: string) => bumpItem(ticketItemId), [bumpItem]);
  const handleBumpTicket = useCallback((ticketId: string) => bumpTicket(ticketId), [bumpTicket]);

  // Page-level audio alerts — single AudioContext, deduped, rate-limited
  useKdsAudioAlerts({
    tickets: kdsView?.tickets ?? [],
    warningThresholdSeconds: kdsView?.warningThresholdSeconds ?? 480,
    criticalThresholdSeconds: kdsView?.criticalThresholdSeconds ?? 720,
    enabled: !isPaused,
  });

  // ── Recall/Refire with reason (#10) ──────────────────────────────
  const handleRecallWithReason = useCallback(async (reason: string) => {
    if (!recallRefire) return;
    if (recallRefire.mode === 'recall') {
      await recallItem(recallRefire.itemId);
    } else {
      await refireItem(recallRefire.itemId, reason);
    }
    setRecallRefire(null);
  }, [recallRefire, recallItem, refireItem]);

  // ── Recall entire ticket from history ────────────────────────────
  // Uses direct apiFetch instead of recallItem (which wraps runAction
  // and sets isActing=true, blocking all subsequent loop iterations).
  const [recallingTicketId, setRecallingTicketId] = useState<string | null>(null);
  const handleRecallTicket = useCallback(async (ticketId: string) => {
    if (!stationId || recallingTicketId) return;
    const ticket = historyView?.tickets.find((t) => t.ticketId === ticketId);
    if (!ticket) return;
    const recallableItems = ticket.items.filter(
      (i) => i.itemStatus === 'ready' || i.itemStatus === 'served',
    );
    if (recallableItems.length === 0) return;

    setRecallingTicketId(ticketId);
    const locQs = locationId ? `?locationId=${locationId}` : '';
    let recalledCount = 0;
    // Recall items sequentially — each has its own DB optimistic lock
    for (const item of recallableItems) {
      try {
        await apiFetch(`/api/v1/fnb/stations/${stationId}/recall${locQs}`, {
          method: 'POST',
          body: JSON.stringify({
            ticketItemId: item.itemId,
            stationId,
            clientRequestId: crypto.randomUUID(),
          }),
          headers: locationId ? { 'X-Location-Id': locationId } : undefined,
        });
        recalledCount++;
      } catch {
        // Concurrent conflict on one item — continue with the rest
      }
    }
    setRecallingTicketId(null);
    // Refresh both views so recalled items appear in live / disappear from history
    if (recalledCount > 0) {
      refresh();
      refreshHistory();
    }
  }, [stationId, recallingTicketId, historyView, locationId, refresh, refreshHistory]);

  // ── Fire course from KDS timeline ─────────────────────────────────
  const handleFireCourse = useCallback(async (tabId: string, courseNumber: number) => {
    // Find a ticket for this tab to use as the anchor for the KDS fire-course endpoint
    const ticket = kdsView?.tickets.find((t) => t.tabId === tabId);
    if (!ticket) return;
    try {
      await apiFetch(`/api/v1/fnb/tickets/${ticket.ticketId}/fire-course`, {
        method: 'POST',
        body: JSON.stringify({ courseNumber, clientRequestId: crypto.randomUUID() }),
        headers: locationId ? { 'X-Location-Id': locationId } : undefined,
      });
      refresh();
    } catch {
      // Refresh anyway to show current state
      refresh();
    }
  }, [kdsView?.tickets, locationId, refresh]);

  // ── Smart auto-prioritization sort (#3) ──────────────────────────
  const sortedTickets = useMemo(() => {
    if (!kdsView?.tickets) return [];
    return [...kdsView.tickets].sort((a, b) => {
      const scoreA = computePriorityScore(a);
      const scoreB = computePriorityScore(b);
      return scoreB - scoreA;
    });
  }, [kdsView?.tickets]);

  // "All Day" counts — total quantity of each item across all open tickets
  const allDayCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ticket of sortedTickets) {
      for (const item of ticket.items) {
        if (item.itemStatus === 'voided') continue;
        const key = item.kitchenLabel || item.itemName;
        map.set(key, (map.get(key) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [sortedTickets]);

  // ── Keyboard handler ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isActing || recallRefire) return;

      // Density shortcuts (always active)
      if (e.key === '1') { setDensity('compact'); return; }
      if (e.key === '2') { setDensity('standard'); return; }
      if (e.key === '3') { setDensity('comfortable'); return; }

      // View mode shortcuts
      if (e.key === 'g' || e.key === 'G') { setViewMode('grid'); return; }

      // Bump bar navigation — only active in live mode to prevent accidental bumps
      if (inputMode === 'bump_bar' && kdsMode === 'live') {
        switch (e.key) {
          case 'ArrowRight':
            e.preventDefault();
            setFocusedTicketIdx((prev) => Math.min(prev + 1, sortedTickets.length - 1));
            break;
          case 'ArrowLeft':
            e.preventDefault();
            setFocusedTicketIdx((prev) => Math.max(prev - 1, 0));
            break;
          case 'Enter':
          case ' ':
            e.preventDefault();
            if (sortedTickets[focusedTicketIdx]) {
              bumpTicket(sortedTickets[focusedTicketIdx].ticketId);
            }
            break;
        }
      }

      // Global shortcuts
      switch (e.key) {
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (inputMode !== 'bump_bar') setViewMode('ticket_rail');
            else refresh();
          }
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          setIsPaused((prev) => {
            if (prev) refresh();
            return !prev;
          });
          break;
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setShowSummary((prev) => !prev);
          }
          break;
        case 'h':
        case 'H':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setKdsMode((prev) => {
              const next = prev === 'live' ? 'history' : 'live';
              if (next === 'history') refreshHistory();
              return next;
            });
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (showShortcuts) { setShowShortcuts(false); return; }
          if (recallRefire) { setRecallRefire(null); return; }
          router.push(locationId ? `/kds?locationId=${locationId}` : '/kds');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputMode, kdsMode, isActing, sortedTickets, focusedTicketIdx, bumpTicket, refresh, refreshHistory, router, recallRefire, showShortcuts, locationId]);

  // Auto-scroll focused ticket into view
  useEffect(() => {
    if (inputMode !== 'bump_bar' || !containerRef.current) return;
    const cards = containerRef.current.querySelectorAll('[data-ticket-card]');
    const card = cards[focusedTicketIdx];
    if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [focusedTicketIdx, inputMode]);

  // Expo stations use a dedicated aggregated view — redirect there
  useEffect(() => {
    if (kdsView?.stationType === 'expo') {
      router.replace(locationId ? `/expo?locationId=${locationId}` : '/expo');
    }
  }, [kdsView?.stationType, router, locationId]);

  // Auto-fullscreen for kiosk/dedicated terminals
  useEffect(() => {
    // Only prompt if: standalone display mode OR no fine pointer (touch-only device)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isTouchOnly = window.matchMedia('(pointer: coarse) and (hover: none)').matches;
    if ((isStandalone || isTouchOnly) && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        document.documentElement.requestFullscreen().catch(() => {
          // Fullscreen not available or denied — no problem
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // ── Loading / Error states ────────────────────────────────────
  if (isLoading && !kdsView) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center">
          <div className="h-8 w-8 border-2 rounded-full animate-spin mx-auto mb-2"
            style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
          <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading KDS...</p>
        </div>
      </div>
    );
  }

  if (error && !kdsView) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center max-w-sm">
          <p className="text-sm mb-1" style={{ color: 'var(--fnb-status-dirty)' }}>{error}</p>
          <p className="text-xs mb-4" style={{ color: 'var(--fnb-text-muted)' }}>
            This station may not exist at the current location. Check that your POS and KDS are using the same location.
          </p>
          <button type="button" onClick={() => router.push(locationId ? `/kds?locationId=${locationId}` : '/kds')}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}>
            Back to Stations
          </button>
        </div>
      </div>
    );
  }

  if (!kdsView) return null;

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Recall/Refire dialog overlay (#10) */}
      {recallRefire && (
        <RecallRefireDialog
          mode={recallRefire.mode}
          itemName={recallRefire.itemName}
          onConfirm={handleRecallWithReason}
          onCancel={() => setRecallRefire(null)}
        />
      )}

      {/* Header bar */}
      <div className="flex items-center shrink-0">
        <button type="button" onClick={() => router.push(locationId ? `/kds?locationId=${locationId}` : '/kds')}
          className="flex items-center justify-center h-full px-3 border-r transition-colors hover:opacity-80 min-h-11 min-w-11"
          style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)', color: 'var(--fnb-text-secondary)' }}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <StationHeader kdsView={kdsView} />
        </div>
        {/* Location badge — always visible so users know which location this KDS serves */}
        {resolvedLocationName && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 shrink-0"
            style={{
              backgroundColor: locationFellBack ? 'rgba(239, 68, 68, 0.1)' : 'var(--fnb-bg-surface)',
              borderLeft: `1px solid ${locationFellBack ? 'rgba(239, 68, 68, 0.3)' : 'rgba(148, 163, 184, 0.15)'}`,
            }}>
            <MapPin className="h-3.5 w-3.5" style={{ color: locationFellBack ? '#ef4444' : '#818cf8' }} />
            <span className="text-xs font-medium" style={{ color: locationFellBack ? '#ef4444' : 'var(--fnb-text-secondary)' }}>
              {resolvedLocationName}
            </span>
            {locationFellBack && (
              <span className="text-[10px] font-bold uppercase" style={{ color: '#ef4444' }}>
                (fallback)
              </span>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
          {/* View mode toggle */}
          {(['ticket_rail', 'grid', 'split'] as ViewMode[]).map((mode) => {
            const Icon = mode === 'grid' ? LayoutGrid : mode === 'split' ? SplitSquareHorizontal : LayoutList;
            return (
              <button key={mode} type="button" onClick={() => setViewMode(mode)}
                className="p-2.5 rounded transition-colors min-h-11 min-w-11 flex items-center justify-center"
                style={{
                  backgroundColor: viewMode === mode ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: viewMode === mode ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
                }}
                title={mode.replace('_', ' ')}>
                <Icon className="h-4 w-4" />
              </button>
            );
          })}

          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)' }} />

          {/* Density toggle */}
          <button type="button"
            onClick={() => setDensity((d) => d === 'compact' ? 'standard' : d === 'standard' ? 'comfortable' : 'compact')}
            className="px-2.5 py-1.5 rounded text-[10px] font-medium transition-colors min-h-11 flex items-center gap-1.5"
            style={{
              backgroundColor: 'rgba(148, 163, 184, 0.08)',
              color: 'var(--fnb-text-muted)',
            }}
            title="Cycle density (1/2/3)">
            {density === 'compact' ? <Minimize2 className="h-4 w-4" /> : density === 'comfortable' ? <Maximize2 className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
            <span className="text-[10px] uppercase tracking-wide">{density}</span>
          </button>

          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)' }} />

          {/* Item summary toggle */}
          <ItemSummaryToggle onClick={() => setShowSummary(!showSummary)} isOpen={showSummary} />

          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)' }} />

          {/* Live Orders / History mode toggle */}
          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
            <button type="button"
              onClick={() => setKdsMode('live')}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: kdsMode === 'live' ? '#22c55e' : 'transparent',
                color: kdsMode === 'live' ? '#fff' : 'var(--fnb-text-muted)',
              }}>
              <LayoutList className="h-3.5 w-3.5" />
              Live Orders
            </button>
            <button type="button"
              onClick={() => { setKdsMode('history'); refreshHistory(); }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: kdsMode === 'history' ? '#6366f1' : 'transparent',
                color: kdsMode === 'history' ? '#fff' : 'var(--fnb-text-muted)',
              }}>
              <Clock className="h-3.5 w-3.5" />
              History
            </button>
          </div>

          {/* Input mode toggle */}
          <button type="button" onClick={() => setInputMode(inputMode === 'touch' ? 'bump_bar' : 'touch')}
            className="p-2.5 rounded transition-colors min-h-11 min-w-11 flex items-center justify-center"
            style={{
              backgroundColor: inputMode === 'bump_bar' ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: inputMode === 'bump_bar' ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
            }}
            title={inputMode === 'touch' ? 'Switch to Bump Bar mode' : 'Switch to Touch mode'}>
            {inputMode === 'bump_bar' ? <KeyboardIcon className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
          </button>

          {/* Pause/resume */}
          <button type="button" onClick={() => {
              const resuming = isPaused;
              setIsPaused(!isPaused);
              if (resuming) refresh();
            }}
            className="p-2.5 rounded transition-colors min-h-11 min-w-11 flex items-center justify-center"
            style={{
              backgroundColor: isPaused ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: isPaused ? '#ef4444' : 'var(--fnb-text-muted)',
            }}
            title={isPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}>
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>

          {/* Shortcuts hint */}
          <button type="button" onClick={() => setShowShortcuts(!showShortcuts)}
            className="p-2.5 rounded transition-colors min-h-11 min-w-11 flex items-center justify-center"
            style={{
              backgroundColor: showShortcuts ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: showShortcuts ? 'var(--fnb-status-seated)' : 'var(--fnb-text-muted)',
            }}
            title="Keyboard shortcuts (?)">
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Banners area — capped to prevent pushing tickets off-screen */}
      <div className="shrink-0 max-h-50 overflow-y-auto">
        {/* Location mismatch warning */}
        {locationFellBack && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', borderBottom: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>
              Location mismatch — URL location not found. Showing data for <strong>{resolvedLocationName}</strong>.
              If this is wrong, go back and select the correct location.
            </span>
          </div>
        )}
        <KitchenBehindBanner
          tickets={sortedTickets}
          warningThresholdSeconds={kdsView.warningThresholdSeconds}
          criticalThresholdSeconds={kdsView.criticalThresholdSeconds}
        />
        <StaleDataBanner lastRefreshedAt={lastRefreshedAt} />

        {/* Course Timeline / Fire Queue (#6) */}
        {kdsView.upcomingCourses && kdsView.upcomingCourses.length > 0 && (
          <CourseTimeline courses={kdsView.upcomingCourses} onFireCourse={handleFireCourse} />
        )}

      </div>

      {/* Bump bar mode indicator */}
      {inputMode === 'bump_bar' && (
        <div className="flex items-center gap-2 px-3 py-1 text-[10px]"
          style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: 'var(--fnb-status-seated)' }}>
          <KeyboardIcon className="h-3 w-3" />
          Bump Bar — ←/→ Navigate | Enter Bump | 1/2/3 Density | G Grid | R Rail | S Summary | P Pause | Esc Back
        </div>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div className="shrink-0 px-4 py-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] border-b" role="status" aria-live="polite"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', borderColor: 'rgba(148, 163, 184, 0.15)', color: 'var(--fnb-text-muted)' }}>
          <span><kbd className="font-bold" style={{ color: 'var(--fnb-text-secondary)' }}>R</kbd> Rail view</span>
          <span><kbd className="font-bold" style={{ color: 'var(--fnb-text-secondary)' }}>G</kbd> Grid view</span>
          <span><kbd className="font-bold" style={{ color: 'var(--fnb-text-secondary)' }}>S</kbd> Summary</span>
          <span><kbd className="font-bold" style={{ color: 'var(--fnb-text-secondary)' }}>H</kbd> History</span>
          <span><kbd className="font-bold" style={{ color: 'var(--fnb-text-secondary)' }}>P</kbd> Pause</span>
          <span><kbd className="font-bold" style={{ color: 'var(--fnb-text-secondary)' }}>1/2/3</kbd> Density</span>
          <span><kbd className="font-bold" style={{ color: 'var(--fnb-text-secondary)' }}>Esc</kbd> Back</span>
        </div>
      )}

      {/* ── HISTORY MODE ─────────────────────────────────────────── */}
      {kdsMode === 'history' ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            {isHistoryLoading && !historyView ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="h-8 w-8 border-2 rounded-full animate-spin mx-auto mb-2"
                    style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: '#6366f1' }} />
                  <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading history...</p>
                </div>
              </div>
            ) : historyError && !historyView ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-sm">
                  <p className="text-sm mb-2" style={{ color: 'var(--fnb-status-dirty, #ef4444)' }}>{historyError}</p>
                  <button type="button" onClick={refreshHistory}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: '#6366f1' }}>
                    Retry
                  </button>
                </div>
              </div>
            ) : !historyView || historyView.tickets.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Clock className="h-10 w-10 mx-auto mb-2" style={{ color: 'var(--fnb-text-muted)', opacity: 0.4 }} />
                  <p className="text-lg font-bold" style={{ color: 'var(--fnb-text-muted)' }}>No History</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                    No completed tickets today at this station
                  </p>
                  <button type="button" onClick={() => setKdsMode('live')}
                    className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: '#22c55e' }}>
                    Back to Live Orders
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3">
                {/* History header with count and refresh */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" style={{ color: '#6366f1' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--fnb-text-secondary)' }}>
                      {historyView.tickets.length >= 50
                        ? '50 most recent tickets'
                        : `${historyView.tickets.length} completed ticket${historyView.tickets.length !== 1 ? 's' : ''} today`}
                    </span>
                  </div>
                  <button type="button" onClick={refreshHistory}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                </div>
                {/* History ticket grid — shows full ticket cards with recall action */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                  {historyView.tickets.map((ticket) => {
                    const recallableCount = ticket.items.filter(
                      (i) => i.itemStatus === 'ready' || i.itemStatus === 'served',
                    ).length;
                    return (
                      <div key={ticket.ticketId}
                        className="rounded-lg overflow-hidden"
                        style={{
                          backgroundColor: 'var(--fnb-bg-surface)',
                          border: '1px solid rgba(99,102,241,0.2)',
                        }}>
                        {/* Ticket header */}
                        <div className="flex items-center justify-between px-3 py-2"
                          style={{ backgroundColor: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold fnb-mono" style={{ color: '#6366f1' }}>
                              #{ticket.ticketNumber}
                            </span>
                            {ticket.tableNumber != null && (
                              <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
                                Table {ticket.tableNumber}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: ticket.status === 'served' ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                              color: ticket.status === 'served' ? '#22c55e' : '#eab308',
                            }}>
                            {ticket.status}
                          </span>
                        </div>

                        {/* Meta row */}
                        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px]"
                          style={{ color: 'var(--fnb-text-muted)', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                          {ticket.serverName && <span>{ticket.serverName}</span>}
                          {ticket.orderType && <span>{ticket.orderType}</span>}
                          {ticket.customerName && <span>{ticket.customerName}</span>}
                        </div>

                        {/* Items list */}
                        <div className="px-3 py-2">
                          {ticket.items.map((item) => (
                            <div key={item.itemId} className="flex items-center gap-2 py-1"
                              style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                              <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
                                {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.kitchenLabel || item.itemName}
                              </span>
                              {item.modifierSummary && (
                                <span className="text-[10px] truncate" style={{ color: 'var(--fnb-text-muted)' }}>
                                  {item.modifierSummary}
                                </span>
                              )}
                              <span className="ml-auto text-[10px] uppercase font-medium px-1.5 py-0.5 rounded shrink-0"
                                style={{
                                  backgroundColor: item.itemStatus === 'served' ? 'rgba(34,197,94,0.1)' : item.itemStatus === 'ready' ? 'rgba(234,179,8,0.1)' : 'rgba(148,163,184,0.1)',
                                  color: item.itemStatus === 'served' ? '#22c55e' : item.itemStatus === 'ready' ? '#eab308' : 'var(--fnb-text-muted)',
                                }}>
                                {item.itemStatus}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Recall button */}
                        {recallableCount > 0 && (
                          <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(148,163,184,0.1)' }}>
                            <button type="button"
                              onClick={() => handleRecallTicket(ticket.ticketId)}
                              disabled={recallingTicketId !== null}
                              className="w-full flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
                              style={{
                                backgroundColor: recallingTicketId === ticket.ticketId ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.12)',
                                color: '#ef4444',
                                border: '1px solid rgba(239,68,68,0.25)',
                                opacity: recallingTicketId !== null && recallingTicketId !== ticket.ticketId ? 0.5 : 1,
                              }}>
                              <RotateCcw className={`h-4 w-4${recallingTicketId === ticket.ticketId ? ' animate-spin' : ''}`} />
                              {recallingTicketId === ticket.ticketId
                                ? 'Recalling...'
                                : `Recall to Kitchen (${recallableCount} item${recallableCount !== 1 ? 's' : ''})`}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── LIVE MODE ─────────────────────────────────────────── */
        <>
          {/* Main content area with optional summary panel */}
          <div className="flex flex-1 overflow-hidden">
            {/* Ticket area */}
            <div ref={containerRef} className="flex-1 overflow-auto">
              {sortedTickets.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-lg font-bold" style={{ color: 'var(--fnb-text-muted)' }}>All Clear</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>No active tickets</p>
                    <div className="flex items-center justify-center gap-2 mt-3" aria-live="polite">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: isPaused ? '#ef4444' : '#22c55e', animation: isPaused ? 'none' : 'pulse 2s ease-in-out infinite' }} />
                      <span className="text-[11px]" style={{ color: 'var(--fnb-text-muted)' }}>
                        {isPaused ? 'Polling paused' : 'Connected — polling every 5s'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 p-3">
                  {sortedTickets.map((ticket, idx) => (
                    <div key={ticket.ticketId} data-ticket-card
                      style={{
                        outline: inputMode === 'bump_bar' && idx === focusedTicketIdx
                          ? '2px solid var(--fnb-status-seated)' : 'none',
                        borderRadius: '8px',
                      }}>
                      <TicketCard
                        ticket={ticket}
                        warningThresholdSeconds={kdsView.warningThresholdSeconds}
                        criticalThresholdSeconds={kdsView.criticalThresholdSeconds}
                        onBumpItem={handleBumpItem}
                        onBumpTicket={handleBumpTicket}
                        disabled={isActing}
                        density={density}
                        allDayCounts={allDayCounts}
                        kdsLocationId={locationId}
                        locationName={resolvedLocationName}
                      />
                    </div>
                  ))}
                </div>
              ) : viewMode === 'split' ? (
                <div className="flex h-full">
                  <div className="flex-1 overflow-x-auto border-r" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
                    <div className="flex gap-3 p-3 h-full items-start">
                      {sortedTickets.map((ticket, idx) => (
                        <div key={ticket.ticketId} data-ticket-card
                          style={{
                            outline: inputMode === 'bump_bar' && idx === focusedTicketIdx
                              ? '2px solid var(--fnb-status-seated)' : 'none',
                            borderRadius: '8px',
                          }}>
                          <TicketCard
                            ticket={ticket}
                            warningThresholdSeconds={kdsView.warningThresholdSeconds}
                            criticalThresholdSeconds={kdsView.criticalThresholdSeconds}
                            onBumpItem={handleBumpItem}
                            onBumpTicket={handleBumpTicket}
                            disabled={isActing}
                            density={density}
                            locationName={resolvedLocationName}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="w-64 xl:w-80 shrink-0 p-3 overflow-y-auto"
                    style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    <p className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                      style={{ color: 'var(--fnb-text-muted)' }}>Recently Completed</p>
                    {(!kdsView.recentlyCompleted || kdsView.recentlyCompleted.length === 0) ? (
                      <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                        No completed tickets yet
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {kdsView.recentlyCompleted.map((ct) => {
                          const mins = Math.floor(ct.completedSecondsAgo / 60);
                          const agoLabel = mins < 1 ? 'just now' : mins === 1 ? '1m ago' : `${mins}m ago`;
                          return (
                            <div key={ct.ticketId}
                              className="rounded-lg px-3 py-2"
                              style={{
                                backgroundColor: 'var(--fnb-bg-surface)',
                                border: '1px solid rgba(148, 163, 184, 0.1)',
                              }}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold fnb-mono" style={{ color: 'var(--fnb-status-available)' }}>
                                  #{ct.ticketNumber}
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                                  {agoLabel}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {ct.tableNumber != null && (
                                  <span className="text-[10px]" style={{ color: 'var(--fnb-text-secondary)' }}>
                                    T{ct.tableNumber}
                                  </span>
                                )}
                                <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                                  {ct.itemCount} item{ct.itemCount !== 1 ? 's' : ''}
                                </span>
                                {ct.serverName && (
                                  <span className="text-[10px] truncate" style={{ color: 'var(--fnb-text-muted)' }}>
                                    {ct.serverName}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Default ticket rail — horizontal scroll */
                <div className="flex gap-3 xl:gap-4 p-3 xl:p-4 h-full items-start">
                  {sortedTickets.map((ticket, idx) => (
                    <div key={ticket.ticketId} data-ticket-card
                      style={{
                        outline: inputMode === 'bump_bar' && idx === focusedTicketIdx
                          ? '2px solid var(--fnb-status-seated)' : 'none',
                        borderRadius: '8px',
                      }}>
                      <TicketCard
                        ticket={ticket}
                        warningThresholdSeconds={kdsView.warningThresholdSeconds}
                        criticalThresholdSeconds={kdsView.criticalThresholdSeconds}
                        onBumpItem={handleBumpItem}
                        onBumpTicket={handleBumpTicket}
                        disabled={isActing}
                        density={density}
                        allDayCounts={allDayCounts}
                        kdsLocationId={locationId}
                        locationName={resolvedLocationName}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Item summary panel (right side) — enhanced with batch prep mode (#4) */}
            {showSummary && (
              <ItemSummaryPanel
                tickets={kdsView.tickets}
                onClose={() => setShowSummary(false)}
              />
            )}
          </div>

          {/* Recently Completed history strip — visible in live mode */}
          {kdsView.recentlyCompleted && kdsView.recentlyCompleted.length > 0 && (
            <div className="shrink-0 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'rgba(0,0,0,0.15)' }}>
              <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto">
                <div className="flex items-center gap-1.5 shrink-0">
                  <History className="h-3.5 w-3.5" style={{ color: 'var(--fnb-status-available)' }} />
                  <span className="text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap"
                    style={{ color: 'var(--fnb-text-muted)' }}>
                    Done
                  </span>
                </div>
                {kdsView.recentlyCompleted.map((ct) => {
                  const mins = Math.floor(ct.completedSecondsAgo / 60);
                  const agoLabel = mins < 1 ? 'just now' : mins === 1 ? '1m ago' : `${mins}m ago`;
                  return (
                    <div key={ct.ticketId}
                      className="flex items-center gap-2 rounded-lg px-3 py-1.5 shrink-0"
                      style={{
                        backgroundColor: 'var(--fnb-bg-surface)',
                        border: '1px solid rgba(34, 197, 94, 0.15)',
                      }}>
                      <span className="text-sm font-bold fnb-mono" style={{ color: 'var(--fnb-status-available)' }}>
                        #{ct.ticketNumber}
                      </span>
                      {ct.tableNumber != null && (
                        <span className="text-xs" style={{ color: 'var(--fnb-text-secondary)' }}>T{ct.tableNumber}</span>
                      )}
                      <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                        {ct.itemCount} item{ct.itemCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>{agoLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* All day summary (bottom bar) */}
      <AllDaySummary kdsView={kdsView} />
    </div>
  );
}
