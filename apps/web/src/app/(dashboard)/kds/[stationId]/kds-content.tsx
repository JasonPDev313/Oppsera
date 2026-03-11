'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useAuthContext } from '@/components/auth-provider';
import { useTerminalSession } from '@/components/terminal-session-provider';
import { useKdsView } from '@/hooks/use-fnb-kitchen';
import { StationHeader } from '@/components/fnb/kitchen/StationHeader';
import { TicketCard } from '@/components/fnb/kitchen/TicketCard';
import { AllDaySummary } from '@/components/fnb/kitchen/AllDaySummary';
import { ItemSummaryPanel, ItemSummaryToggle } from '@/components/fnb/kitchen/ItemSummaryPanel';
import { KitchenBehindBanner } from '@/components/fnb/kitchen/KitchenBehindBanner';
import {
  ArrowLeft, LayoutGrid, LayoutList, SplitSquareHorizontal,
  Keyboard as KeyboardIcon, Hand, Pause, Play,
  Minimize2, Maximize2, History, MapPin,
} from 'lucide-react';

type ViewMode = 'ticket_rail' | 'grid' | 'split';
type Density = 'compact' | 'standard' | 'comfortable';

// Effectively infinite interval to stop polling when paused
const PAUSED_INTERVAL = 999_999_999;


export default function KdsContent() {
  const params = useParams();
  const router = useRouter();

  const stationId = params.stationId as string;
  const { locations } = useAuthContext();
  const { session: terminalSession } = useTerminalSession();
  const locationId = terminalSession?.locationId ?? locations?.[0]?.id;
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('ticket_rail');
  const [density, setDensity] = useState<Density>('standard');
  const [inputMode, setInputMode] = useState<'touch' | 'bump_bar'>('touch');
  const [focusedTicketIdx, setFocusedTicketIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  const {
    kdsView,
    isLoading,
    error,
    bumpItem,
    bumpTicket,
    recallItem,
    callBack,
    refireItem,
    isActing,
    refresh,
  } = useKdsView({ stationId, locationId, pollIntervalMs: isPaused ? PAUSED_INTERVAL : 5000 });

  // Actions available for future UI wiring (context menu, long-press, etc.)
  void recallItem; void callBack; void refireItem;

  // Sort tickets by priority (higher first), then by elapsed time (longer first)
  const sortedTickets = useMemo(() => {
    if (!kdsView?.tickets) return [];
    return [...kdsView.tickets].sort((a, b) => {
      if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
      return b.elapsedSeconds - a.elapsedSeconds;
    });
  }, [kdsView?.tickets]);

  // ── Keyboard handler ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isActing) return;

      // Density shortcuts (always active)
      if (e.key === '1') { setDensity('compact'); return; }
      if (e.key === '2') { setDensity('standard'); return; }
      if (e.key === '3') { setDensity('comfortable'); return; }

      // View mode shortcuts
      if (e.key === 'g' || e.key === 'G') { setViewMode('grid'); return; }

      // Bump bar navigation
      if (inputMode === 'bump_bar') {
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
            setShowHistory((prev) => !prev);
          }
          break;
        case 'Escape':
          e.preventDefault();
          router.push('/kds');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputMode, isActing, sortedTickets, focusedTicketIdx, bumpTicket, refresh, router]);

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
      router.replace('/expo');
    }
  }, [kdsView?.stationType, router]);

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
          <button type="button" onClick={() => router.push('/kds')}
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
      {/* Header bar */}
      <div className="flex items-center shrink-0">
        <button type="button" onClick={() => router.push('/kds')}
          className="flex items-center justify-center h-full px-3 border-r transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)', color: 'var(--fnb-text-secondary)' }}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <StationHeader kdsView={kdsView} />
        </div>
        {/* Location badge — always visible so users know which location this KDS serves */}
        {terminalSession?.locationName && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 shrink-0"
            style={{ backgroundColor: 'var(--fnb-bg-surface)', borderLeft: '1px solid rgba(148, 163, 184, 0.15)' }}>
            <MapPin className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-secondary)' }}>
              {terminalSession.locationName}
            </span>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
          {/* View mode toggle */}
          {(['ticket_rail', 'grid', 'split'] as ViewMode[]).map((mode) => {
            const Icon = mode === 'grid' ? LayoutGrid : mode === 'split' ? SplitSquareHorizontal : LayoutList;
            return (
              <button key={mode} type="button" onClick={() => setViewMode(mode)}
                className="p-1.5 rounded transition-colors"
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
            className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(148, 163, 184, 0.08)',
              color: 'var(--fnb-text-muted)',
            }}
            title="Cycle density (1/2/3)">
            {density === 'compact' ? <Minimize2 className="h-3.5 w-3.5" /> : density === 'comfortable' ? <Maximize2 className="h-3.5 w-3.5" /> : <LayoutList className="h-3.5 w-3.5" />}
          </button>

          <div className="w-px h-5 mx-1" style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)' }} />

          {/* Item summary toggle */}
          <ItemSummaryToggle onClick={() => setShowSummary(!showSummary)} isOpen={showSummary} />

          {/* History toggle */}
          <button type="button" onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 rounded transition-colors"
            style={{
              backgroundColor: showHistory ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
              color: showHistory ? '#22c55e' : 'var(--fnb-text-muted)',
            }}
            title="Toggle bump history (H)">
            <History className="h-4 w-4" />
          </button>

          {/* Input mode toggle */}
          <button type="button" onClick={() => setInputMode(inputMode === 'touch' ? 'bump_bar' : 'touch')}
            className="p-1.5 rounded transition-colors"
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
            className="p-1.5 rounded transition-colors"
            style={{
              backgroundColor: isPaused ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: isPaused ? '#ef4444' : 'var(--fnb-text-muted)',
            }}
            title={isPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}>
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Kitchen Behind banner */}
      <KitchenBehindBanner
        tickets={sortedTickets}
        warningThresholdSeconds={kdsView.warningThresholdSeconds}
        criticalThresholdSeconds={kdsView.criticalThresholdSeconds}
      />

      {/* Bump bar mode indicator */}
      {inputMode === 'bump_bar' && (
        <div className="flex items-center gap-2 px-3 py-1 text-[10px]"
          style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: 'var(--fnb-status-seated)' }}>
          <KeyboardIcon className="h-3 w-3" />
          Bump Bar — ←/→ Navigate | Enter Bump | 1/2/3 Density | G Grid | R Rail | S Summary | P Pause | Esc Back
        </div>
      )}

      {/* Main content area with optional summary panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Ticket area */}
        <div ref={containerRef} className="flex-1 overflow-auto">
          {sortedTickets.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: 'var(--fnb-text-muted)' }}>All Clear</p>
                <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>No active tickets</p>
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
                    onBumpItem={bumpItem}
                    onBumpTicket={bumpTicket}
                    disabled={isActing}
                    density={density}
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
                        onBumpItem={bumpItem}
                        onBumpTicket={bumpTicket}
                        disabled={isActing}
                        density={density}
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
                    onBumpItem={bumpItem}
                    onBumpTicket={bumpTicket}
                    disabled={isActing}
                    density={density}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Item summary panel (right side) */}
        {showSummary && (
          <ItemSummaryPanel
            tickets={kdsView.tickets}
            onClose={() => setShowSummary(false)}
          />
        )}
      </div>

      {/* Recently Completed history strip — visible in all view modes */}
      {showHistory && kdsView.recentlyCompleted && kdsView.recentlyCompleted.length > 0 && (
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

      {/* All day summary (bottom bar) */}
      <AllDaySummary kdsView={kdsView} />
    </div>
  );
}
