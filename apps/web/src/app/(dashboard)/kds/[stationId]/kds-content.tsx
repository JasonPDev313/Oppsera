'use client';

import { useParams, useRouter } from 'next/navigation';
import { useKdsView } from '@/hooks/use-fnb-kitchen';
import { StationHeader } from '@/components/fnb/kitchen/StationHeader';
import { TicketCard } from '@/components/fnb/kitchen/TicketCard';
import { AllDaySummary } from '@/components/fnb/kitchen/AllDaySummary';
import { ArrowLeft } from 'lucide-react';

export default function KdsContent() {
  const params = useParams();
  const router = useRouter();
  const stationId = params.stationId as string;

  const {
    kdsView,
    isLoading,
    error,
    bumpItem,
    bumpTicket,
    isActing,
  } = useKdsView({ stationId, pollIntervalMs: 5000 });

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
          <button
            type="button"
            onClick={() => router.push('/kds')}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}
          >
            Back to Stations
          </button>
        </div>
      </div>
    );
  }

  if (!kdsView) return null;

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Back button + station header */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => router.push('/kds')}
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
          <StationHeader kdsView={kdsView} />
        </div>
      </div>

      {/* Ticket grid */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {kdsView.tickets.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: 'var(--fnb-text-muted)' }}>
                All Clear
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                No active tickets
              </p>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 xl:gap-4 p-3 xl:p-4 h-full items-start">
            {kdsView.tickets.map((ticket) => (
              <TicketCard
                key={ticket.ticketId}
                ticket={ticket}
                warningThresholdSeconds={kdsView.warningThresholdSeconds}
                criticalThresholdSeconds={kdsView.criticalThresholdSeconds}
                onBumpItem={bumpItem}
                onBumpTicket={bumpTicket}
                disabled={isActing}
              />
            ))}
          </div>
        )}
      </div>

      {/* All day summary */}
      <AllDaySummary kdsView={kdsView} />
    </div>
  );
}
