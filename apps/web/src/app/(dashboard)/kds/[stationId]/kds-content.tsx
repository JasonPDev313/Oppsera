'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useKdsView } from '@/hooks/use-fnb-kitchen';
import { StationHeader } from '@/components/fnb/kitchen/StationHeader';
import { TicketCard } from '@/components/fnb/kitchen/TicketCard';
import { AllDaySummary } from '@/components/fnb/kitchen/AllDaySummary';
// KDS_PRIORITY_LEVELS available from @oppsera/shared for level display names
import {
  ArrowLeft, LayoutGrid, LayoutList, SplitSquareHorizontal,
  Keyboard as KeyboardIcon, Hand, Pause, Play,
} from 'lucide-react';

type ViewMode = 'ticket_rail' | 'grid' | 'split';

// Effectively infinite interval to stop polling when paused
const PAUSED_INTERVAL = 999_999_999;

export default function KdsContent() {
  const params = useParams();
  const router = useRouter();
  const stationId = params.stationId as string;
  const containerRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('ticket_rail');
  const [inputMode, setInputMode] = useState<'touch' | 'bump_bar'>('touch');
  const [focusedTicketIdx, setFocusedTicketIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const {
    kdsView,
    isLoading,
    error,
    bumpItem,
    bumpTicket,
    recallItem: _recallItem,
    isActing,
    refresh,
  } = useKdsView({ stationId, pollIntervalMs: isPaused ? PAUSED_INTERVAL : 5000 });

  // Sort tickets by priority (higher first), then by elapsed time (longer first)
  const sortedTickets = useMemo(() => {
    if (!kdsView?.tickets) return [];
    return [...kdsView.tickets].sort((a, b) => {
      if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
      return b.elapsedSeconds - a.elapsedSeconds;
    });
  }, [kdsView?.tickets]);

  // Keyboard handler for bump bar mode
  useEffect(() => {
    if (inputMode !== 'bump_bar') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isActing) return;

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
        case 'r':
        case 'R':
          e.preventDefault();
          refresh();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          setIsPaused((prev) => !prev);
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
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: 'var(--fnb-status-dirty)' }}>{error}</p>
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

          {/* Pause/resume polling */}
          <button type="button" onClick={() => setIsPaused(!isPaused)}
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

      {/* Bump bar mode indicator */}
      {inputMode === 'bump_bar' && (
        <div className="flex items-center gap-2 px-3 py-1 text-[10px]"
          style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: 'var(--fnb-status-seated)' }}>
          <KeyboardIcon className="h-3 w-3" />
          Bump Bar Mode — Left/Right Navigate | Enter/Space Bump | R Refresh | P Pause | Esc Back
        </div>
      )}

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
          /* Grid view — wrap in a responsive grid */
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
                />
              </div>
            ))}
          </div>
        ) : viewMode === 'split' ? (
          /* Split view — active left, recent bumped right */
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
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="w-64 xl:w-80 shrink-0 p-3 overflow-y-auto"
              style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                style={{ color: 'var(--fnb-text-muted)' }}>Recently Completed</p>
              <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
                Completed tickets will appear here
              </p>
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
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All day summary */}
      <AllDaySummary kdsView={kdsView} />
    </div>
  );
}
