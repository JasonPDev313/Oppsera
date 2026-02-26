'use client';

import { useState, useCallback } from 'react';
import { X, ChevronUp, ChevronDown, Pin, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────

export interface PinnedMetric {
  id: string;
  metricSlug: string;
  displayName: string;
  currentValue: number;
  previousValue: number;
  changePct: number;
  sparklineData: number[];
  format: string;
}

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

function formatMetricValue(value: number, format: string): string {
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

  // Empty state
  if (pinnedMetrics.length === 0) {
    return (
      <div className={`rounded-lg border border-border bg-surface p-8 text-center ${className ?? ''}`}>
        <Pin className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Pin metrics from your AI chat conversations to track them here
        </p>
      </div>
    );
  }

  return (
    <div className={`${className ?? ''}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pinnedMetrics.map((metric, idx) => {
          const isPositive = metric.changePct >= 0;
          const isHovered = hoveredId === metric.id;

          return (
            <div
              key={metric.id}
              className="relative rounded-lg border border-border bg-surface p-3 transition-shadow hover:shadow-sm"
              onMouseEnter={() => setHoveredId(metric.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Top row: name + actions */}
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium leading-snug pr-2">
                  {metric.displayName}
                </p>

                {/* Action buttons (visible on hover) */}
                <div
                  className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
                    isHovered ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(idx)}
                    disabled={idx >= pinnedMetrics.length - 1}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onUnpin(metric.id)}
                    className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Unpin metric"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Value row */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xl font-bold text-foreground leading-none">
                    {formatMetricValue(metric.currentValue, metric.format)}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {isPositive ? (
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                    ) : metric.changePct < 0 ? (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    ) : (
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span
                      className={`text-xs font-medium ${
                        isPositive
                          ? 'text-emerald-500'
                          : metric.changePct < 0
                          ? 'text-red-500'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {metric.changePct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Sparkline */}
                {metric.sparklineData.length > 1 && (
                  <MiniSparkline
                    data={metric.sparklineData}
                    isPositive={isPositive}
                  />
                )}
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
    <div style={{ width: 80, height: 32 }}>
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
