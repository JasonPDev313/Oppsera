'use client';

import { useMemo } from 'react';
import type { KdsView } from '@/types/fnb';
import { formatTimer } from './TimerBar';

interface StationHeaderProps {
  kdsView: KdsView;
}

export function StationHeader({ kdsView }: StationHeaderProps) {
  const pastThreshold = kdsView.tickets.filter(
    (t) => t.elapsedSeconds >= kdsView.criticalThresholdSeconds,
  ).length;

  const avgTime = useMemo(() => {
    if (kdsView.tickets.length === 0) return 0;
    const total = kdsView.tickets.reduce((sum, t) => sum + t.elapsedSeconds, 0);
    return Math.round(total / kdsView.tickets.length);
  }, [kdsView.tickets]);

  const isWarning = avgTime > kdsView.warningThresholdSeconds;

  return (
    <div
      className="flex items-center justify-between px-4 xl:px-6 py-3 xl:py-4 border-b shrink-0"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        borderColor: 'rgba(148, 163, 184, 0.15)',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Station color dot */}
        {kdsView.stationColor && (
          <span
            className="inline-block h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: kdsView.stationColor }}
          />
        )}
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
        {/* Average ticket time */}
        {kdsView.tickets.length > 0 && (
          <span
            className="text-xs font-bold fnb-mono rounded-full px-2.5 py-0.5"
            style={{
              backgroundColor: isWarning ? 'rgba(239, 68, 68, 0.15)' : 'var(--fnb-bg-elevated)',
              color: isWarning ? '#ef4444' : 'var(--fnb-text-secondary)',
            }}
          >
            Avg: {formatTimer(avgTime)}
          </span>
        )}
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
