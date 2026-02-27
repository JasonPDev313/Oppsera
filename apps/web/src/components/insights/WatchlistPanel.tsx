'use client';

import { useState, useCallback } from 'react';
import { X, ChevronUp, ChevronDown, Pin, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import type { PinnedMetric } from '@/hooks/use-pinned-metrics';

// ── Props ───────────────────────────────────────────────────────────

interface WatchlistPanelProps {
  pinnedMetrics: PinnedMetric[];
  onUnpin: (id: string) => void;
  onReorder: (ids: string[]) => void;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatMetricValue(value: number | null | undefined, format: string): string {
  if (value == null) return '--';
  switch (format) {
    case 'currency':
      return currencyFormatter.format(value);
    case 'percent':
      return percentFormatter.format(value > 1 ? value / 100 : value);
    case 'number':
    default:
      return numberFormatter.format(value);
  }
}

// ── Component ──────────────────────────────────────────────────────

export function WatchlistPanel({
  pinnedMetrics,
  onUnpin,
  onReorder,
  className,
}: WatchlistPanelProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const moveUp = useCallback(
    (idx: number) => {
      if (idx === 0) return;
      const ids = pinnedMetrics.map((m) => m.id);
      [ids[idx - 1], ids[idx]] = [ids[idx]!, ids[idx - 1]!];
      onReorder(ids);
    },
    [pinnedMetrics, onReorder],
  );

  const moveDown = useCallback(
    (idx: number) => {
      if (idx >= pinnedMetrics.length - 1) return;
      const ids = pinnedMetrics.map((m) => m.id);
      [ids[idx], ids[idx + 1]] = [ids[idx + 1]!, ids[idx]!];
      onReorder(ids);
    },
    [pinnedMetrics, onReorder],
  );

  if (pinnedMetrics.length === 0) {
    return (
      <div className={`rounded-xl border border-dashed border-border bg-surface/50 py-12 px-6 text-center ${className ?? ''}`}>
        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
          <Pin className="h-6 w-6 text-indigo-500" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">No pinned metrics</h3>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Pin metrics from your AI chat conversations to track them here. Ask about any metric and click the pin icon to add it.
        </p>
      </div>
    );
  }

  return (
    <div className={className ?? ''}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-foreground">Pinned Metrics</span>
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
          {pinnedMetrics.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pinnedMetrics.map((metric, idx) => {
          const changePct = metric.changePercent ?? 0;
          const isPositive = changePct > 0;
          const isNegative = changePct < 0;
          const isHovered = hoveredId === metric.id;
          const format = metric.config?.format ?? 'number';
          const sparkline = metric.sparklineValues ?? [];

          return (
            <div
              key={metric.id}
              className="relative rounded-xl border border-border bg-surface overflow-hidden transition-all hover:border-border/80"
              onMouseEnter={() => setHoveredId(metric.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="p-4">
                {/* Top row: name + actions */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <Sparkles className="h-3 w-3 text-indigo-500" />
                    </div>
                    <p className="text-xs text-muted-foreground font-medium leading-snug truncate">
                      {metric.displayName}
                    </p>
                  </div>

                  <div
                    className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-150 ${
                      isHovered ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition-colors"
                      title="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(idx)}
                      disabled={idx >= pinnedMetrics.length - 1}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition-colors"
                      title="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnpin(metric.id)}
                      className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Unpin metric"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Value row */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-foreground leading-none tracking-tight">
                      {formatMetricValue(metric.currentValue, format)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span
                        className={`inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5 ${
                          isPositive
                            ? 'text-emerald-500 bg-emerald-500/10'
                            : isNegative
                              ? 'text-red-500 bg-red-500/10'
                              : 'text-muted-foreground bg-muted'
                        }`}
                      >
                        {isPositive ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : isNegative ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        {isPositive ? '+' : ''}
                        {changePct.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {sparkline.length > 1 && (
                    <MiniSparkline
                      data={sparkline}
                      isPositive={!isNegative}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mini Sparkline ─────────────────────────────────────────────────

function MiniSparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  const chartData = data.map((value, idx) => ({ idx, value }));
  const color = isPositive ? '#10b981' : '#ef4444';

  return (
    <div style={{ width: 80, height: 36 }} className="opacity-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
