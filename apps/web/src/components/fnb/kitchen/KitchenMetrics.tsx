'use client';

/**
 * Kitchen performance metrics panel shown in the right sidebar
 * (below item summary) or in the expo header.
 */

import { useMemo } from 'react';
import { formatTimer } from './TimerBar';

interface KitchenMetricsProps {
  tickets: Array<{
    elapsedSeconds: number;
    status: string;
    items: Array<{ itemStatus: string }>;
  }>;
  /** Total tickets served today */
  totalServedToday?: number;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  layout?: 'vertical' | 'horizontal';
}

export function KitchenMetrics({
  tickets,
  totalServedToday = 0,
  warningThresholdSeconds,
  criticalThresholdSeconds,
  layout = 'vertical',
}: KitchenMetricsProps) {
  const metrics = useMemo(() => {
    if (tickets.length === 0) {
      return { avgTime: 0, overdueCount: 0, activeCount: 0, readyCount: 0 };
    }

    const total = tickets.reduce((sum, t) => sum + t.elapsedSeconds, 0);
    const avg = Math.round(total / tickets.length);
    const overdue = tickets.filter((t) => t.elapsedSeconds >= criticalThresholdSeconds).length;
    const ready = tickets.filter((t) =>
      t.items.every((i) => i.itemStatus === 'ready' || i.itemStatus === 'voided'),
    ).length;

    return { avgTime: avg, overdueCount: overdue, activeCount: tickets.length, readyCount: ready };
  }, [tickets, criticalThresholdSeconds]);

  const isWarning = metrics.avgTime > warningThresholdSeconds;
  const isCritical = metrics.avgTime > criticalThresholdSeconds;

  if (layout === 'horizontal') {
    return (
      <div className="flex items-center gap-4">
        <MetricChip label="Active" value={String(metrics.activeCount)} />
        <MetricChip
          label="Avg"
          value={formatTimer(metrics.avgTime)}
          color={isCritical ? '#ef4444' : isWarning ? '#f97316' : undefined}
        />
        {metrics.overdueCount > 0 && (
          <MetricChip label="Overdue" value={String(metrics.overdueCount)} color="#ef4444" />
        )}
        <MetricChip label="Ready" value={String(metrics.readyCount)} color="#22c55e" />
        {totalServedToday > 0 && (
          <MetricChip label="Served" value={String(totalServedToday)} />
        )}
      </div>
    );
  }

  return (
    <div
      className="border-t px-3 py-2 space-y-1.5 shrink-0"
      style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--fnb-text-muted)' }}>
        Metrics
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        <MetricBox label="Active" value={String(metrics.activeCount)} />
        <MetricBox
          label="Avg Time"
          value={formatTimer(metrics.avgTime)}
          color={isCritical ? '#ef4444' : isWarning ? '#f97316' : undefined}
        />
        <MetricBox label="Overdue" value={String(metrics.overdueCount)} color={metrics.overdueCount > 0 ? '#ef4444' : undefined} />
        <MetricBox label="Ready" value={String(metrics.readyCount)} color={metrics.readyCount > 0 ? '#22c55e' : undefined} />
        {totalServedToday > 0 && (
          <MetricBox label="Served Today" value={String(totalServedToday)} />
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded-md px-2 py-1.5"
      style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
    >
      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--fnb-text-muted)' }}>
        {label}
      </p>
      <p
        className="text-sm font-bold fnb-mono"
        style={{ color: color ?? 'var(--fnb-text-primary)' }}
      >
        {value}
      </p>
    </div>
  );
}

function MetricChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>{label}</span>
      <span className="text-xs font-bold fnb-mono" style={{ color: color ?? 'var(--fnb-text-primary)' }}>{value}</span>
    </div>
  );
}
