'use client';

import { useRouter } from 'next/navigation';
import { useExpoView } from '@/hooks/use-fnb-kitchen';
import { ExpoHeader } from '@/components/fnb/kitchen/ExpoHeader';
import { ExpoTicketCard } from '@/components/fnb/kitchen/ExpoTicketCard';
import { ArrowLeft } from 'lucide-react';

// Default thresholds for expo (can be overridden per-station)
const DEFAULT_WARNING_SECONDS = 480;
const DEFAULT_CRITICAL_SECONDS = 720;

export default function ExpoContent() {
  const router = useRouter();

  const {
    expoView,
    isLoading,
    error,
    bumpTicket,
    isActing,
  } = useExpoView({ pollIntervalMs: 5000 });

  if (isLoading && !expoView) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center">
          <div className="h-8 w-8 border-2 rounded-full animate-spin mx-auto mb-2"
            style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
          <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>Loading Expo...</p>
        </div>
      </div>
    );
  }

  if (error && !expoView) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: 'var(--fnb-status-dirty)' }}>{error}</p>
          <button
            type="button"
            onClick={() => router.push('/pos/fnb')}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}
          >
            Back to Floor
          </button>
        </div>
      </div>
    );
  }

  if (!expoView) return null;

  // Sort: ready-to-serve first, then by elapsed time descending
  const sortedTickets = [...expoView.tickets].sort((a, b) => {
    if (a.allItemsReady && !b.allItemsReady) return -1;
    if (!a.allItemsReady && b.allItemsReady) return 1;
    return b.elapsedSeconds - a.elapsedSeconds;
  });

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header with back */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => router.push('/pos/fnb')}
          className="flex items-center justify-center h-full px-3 border-r transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--fnb-bg-surface)',
            borderColor: 'rgba(148, 163, 184, 0.15)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <ExpoHeader expoView={expoView} />
        </div>
      </div>

      {/* Ticket grid */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {sortedTickets.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'var(--fnb-text-muted)' }}>
                All Clear
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                No tickets in the pass
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 p-3 h-full items-start flex-wrap content-start">
            {sortedTickets.map((ticket) => (
              <ExpoTicketCard
                key={ticket.ticketId}
                ticket={ticket}
                warningThresholdSeconds={DEFAULT_WARNING_SECONDS}
                criticalThresholdSeconds={DEFAULT_CRITICAL_SECONDS}
                onBumpTicket={bumpTicket}
                disabled={isActing}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
