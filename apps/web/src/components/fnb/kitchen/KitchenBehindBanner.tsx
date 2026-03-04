'use client';

/**
 * Alert banner shown when the kitchen is behind.
 * Triggered when average ticket age exceeds warning threshold
 * or when multiple tickets are past critical threshold.
 */

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatTimer } from './TimerBar';

interface KitchenBehindBannerProps {
  tickets: Array<{ elapsedSeconds: number }>;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
}

export function KitchenBehindBanner({
  tickets,
  warningThresholdSeconds,
  criticalThresholdSeconds,
}: KitchenBehindBannerProps) {
  const { avgElapsed, overdueCount, isBehind } = useMemo(() => {
    if (tickets.length === 0) return { avgElapsed: 0, overdueCount: 0, isBehind: false };

    const total = tickets.reduce((sum, t) => sum + t.elapsedSeconds, 0);
    const avg = Math.round(total / tickets.length);
    const overdue = tickets.filter((t) => t.elapsedSeconds >= criticalThresholdSeconds).length;
    const behind = avg > warningThresholdSeconds || overdue >= 3;

    return { avgElapsed: avg, overdueCount: overdue, isBehind: behind };
  }, [tickets, warningThresholdSeconds, criticalThresholdSeconds]);

  if (!isBehind) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 shrink-0 animate-pulse"
      style={{
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#ef4444' }} />
      <span className="text-xs font-bold" style={{ color: '#ef4444' }}>
        KITCHEN BEHIND
      </span>
      <span className="text-xs" style={{ color: '#ef4444' }}>
        — Avg ticket: {formatTimer(avgElapsed)}
      </span>
      {overdueCount > 0 && (
        <span className="text-xs" style={{ color: '#ef4444' }}>
          — {overdueCount} ticket{overdueCount !== 1 ? 's' : ''} overdue
        </span>
      )}
    </div>
  );
}
