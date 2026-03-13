'use client';

import { useMemo } from 'react';
import { Zap, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import type { KdsView } from '@/types/fnb';
import { formatTimer } from './TimerBar';

interface StationHeaderProps {
  kdsView: KdsView;
  rushMode?: boolean;
  onToggleRushMode?: () => void;
}

export function StationHeader({ kdsView, rushMode, onToggleRushMode }: StationHeaderProps) {
  const pastThreshold = kdsView.tickets.filter(
    (t) => t.elapsedSeconds >= kdsView.criticalThresholdSeconds,
  ).length;

  const metrics = useMemo(() => {
    if (kdsView.tickets.length === 0) return { avgTime: 0, readyCount: 0, itemsPerHour: 0 };
    const total = kdsView.tickets.reduce((sum, t) => sum + t.elapsedSeconds, 0);
    const avg = Math.round(total / kdsView.tickets.length);
    const ready = kdsView.tickets.filter((t) =>
      t.items.every((i) => i.itemStatus === 'ready' || i.itemStatus === 'voided'),
    ).length;
    // Estimate items/hr — use time since midnight as business-day proxy (avoids hardcoded open time)
    const servedToday = kdsView.servedTodayCount ?? 0;
    const now = new Date();
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    const hoursSinceMidnight = minutesSinceMidnight / 60;
    // Only show rate if we have >30 min of data and at least some served items
    const itemsPerHour = (servedToday > 0 && hoursSinceMidnight > 0.5)
      ? Math.round(servedToday / hoursSinceMidnight)
      : 0;
    return { avgTime: avg, readyCount: ready, itemsPerHour };
  }, [kdsView.tickets, kdsView.servedTodayCount]);

  const isWarning = metrics.avgTime > kdsView.warningThresholdSeconds;
  const isCritical = metrics.avgTime > kdsView.criticalThresholdSeconds;

  return (
    <div className="shrink-0">
    {rushMode && (
      <div
        className="flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase animate-pulse"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          color: '#ef4444',
        }}
      >
        <Zap className="h-3.5 w-3.5" />
        RUSH MODE ACTIVE
      </div>
    )}
    <div
      className="flex items-center justify-between px-4 xl:px-6 py-3 xl:py-4 border-b"
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

      <div className="flex items-center gap-2">
        {/* Rush mode toggle */}
        {onToggleRushMode && (
          <button
            type="button"
            onClick={onToggleRushMode}
            className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase transition-colors"
            style={{
              backgroundColor: rushMode ? 'rgba(239, 68, 68, 0.2)' : 'var(--fnb-bg-elevated)',
              color: rushMode ? '#ef4444' : 'var(--fnb-text-muted)',
              border: rushMode ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent',
            }}
          >
            <Zap className="h-3 w-3" />
            {rushMode ? 'RUSH ON' : 'RUSH'}
          </button>
        )}

        {/* Live metrics strip */}
        {kdsView.tickets.length > 0 && (
          <>
            {/* Average ticket time */}
            <span
              className="flex items-center gap-1 text-xs font-bold fnb-mono rounded-full px-2.5 py-0.5"
              style={{
                backgroundColor: isCritical ? 'rgba(239, 68, 68, 0.2)' : isWarning ? 'rgba(249, 115, 22, 0.15)' : 'var(--fnb-bg-elevated)',
                color: isCritical ? '#ef4444' : isWarning ? '#f97316' : 'var(--fnb-text-secondary)',
              }}
            >
              <Clock className="h-3 w-3" />
              {formatTimer(metrics.avgTime)}
            </span>

            {/* Ready to bump */}
            {metrics.readyCount > 0 && (
              <span
                className="flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}
              >
                <CheckCircle2 className="h-3 w-3" />
                {metrics.readyCount} ready
              </span>
            )}
          </>
        )}

        {/* Served today */}
        {(kdsView.servedTodayCount ?? 0) > 0 && (
          <span
            className="flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            <TrendingUp className="h-3 w-3" />
            {kdsView.servedTodayCount} done
            {metrics.itemsPerHour > 0 && (
              <span className="text-[10px] fnb-mono" style={{ color: 'var(--fnb-text-muted)' }}>
                ~{metrics.itemsPerHour}/hr
              </span>
            )}
          </span>
        )}

        {/* Overdue */}
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
    </div>
  );
}
