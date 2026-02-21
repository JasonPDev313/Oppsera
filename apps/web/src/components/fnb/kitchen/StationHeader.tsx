'use client';

import type { KdsView } from '@/types/fnb';

interface StationHeaderProps {
  kdsView: KdsView;
}

export function StationHeader({ kdsView }: StationHeaderProps) {
  const pastThreshold = kdsView.tickets.filter(
    (t) => t.elapsedSeconds >= kdsView.criticalThresholdSeconds,
  ).length;

  return (
    <div
      className="flex items-center justify-between px-4 xl:px-6 py-3 xl:py-4 border-b shrink-0"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
      }}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-lg xl:text-xl font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          {kdsView.stationName}
        </h1>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          {kdsView.activeTicketCount} ticket{kdsView.activeTicketCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {pastThreshold > 0 && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-bold animate-pulse"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--fnb-status-dirty)' }}
          >
            {pastThreshold} overdue
          </span>
        )}
      </div>
    </div>
  );
}
