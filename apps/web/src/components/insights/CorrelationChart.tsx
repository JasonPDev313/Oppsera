'use client';

import { useState, useMemo } from 'react';
import { Filter } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────

export interface MetricCorrelation {
  metricSlug: string;
  displayName: string;
  pearsonR: number;
  strength: string;
  direction: 'positive' | 'negative';
  sampleSize: number;
}

interface CorrelationChartProps {
  correlations: MetricCorrelation[];
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const STRENGTH_BADGE: Record<string, { bg: string; text: string }> = {
  strong: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  moderate: { bg: 'bg-blue-100', text: 'text-blue-700' },
  weak: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

// ── Tooltip ────────────────────────────────────────────────────────

interface CorrelationTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: MetricCorrelation & { absR: number } }>;
}

function CorrelationTooltip({ active, payload }: CorrelationTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 text-xs shadow-lg">
      <p className="font-medium text-foreground mb-1">{item.displayName}</p>
      <p className="text-muted-foreground">
        r = {item.pearsonR >= 0 ? '+' : ''}{item.pearsonR.toFixed(3)}
      </p>
      <p className="text-muted-foreground">
        Strength: {item.strength}
      </p>
      <p className="text-muted-foreground">
        Samples: {item.sampleSize.toLocaleString()}
      </p>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function CorrelationChart({ correlations, className }: CorrelationChartProps) {
  const [strongOnly, setStrongOnly] = useState(false);

  const sorted = useMemo(() => {
    const filtered = strongOnly
      ? correlations.filter((c) => Math.abs(c.pearsonR) >= 0.5)
      : correlations;

    return [...filtered]
      .sort((a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR))
      .map((c) => ({
        ...c,
        absR: Math.abs(c.pearsonR),
      }));
  }, [correlations, strongOnly]);

  if (correlations.length === 0) {
    return (
      <div className={`rounded-lg border border-border bg-surface p-6 text-center ${className ?? ''}`}>
        <p className="text-sm text-muted-foreground">No correlation data available</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Metric Correlations</h3>
        <button
          type="button"
          onClick={() => setStrongOnly((p) => !p)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            strongOnly
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-gray-200/50 hover:text-foreground'
          }`}
        >
          <Filter className="h-3 w-3" />
          Strong only
        </button>
      </div>

      {/* Chart */}
      <div className="p-4">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            No strong correlations found (|r| &ge; 0.5)
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(sorted.length * 36 + 40, 120)}>
            <BarChart data={sorted} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis
                type="number"
                domain={[0, 1]}
                tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <YAxis
                type="category"
                dataKey="displayName"
                tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
                tickLine={false}
                axisLine={false}
                width={140}
              />
              <Tooltip content={<CorrelationTooltip />} />
              <Bar dataKey="absR" radius={[0, 4, 4, 0]}>
                {sorted.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.direction === 'positive' ? '#10b981' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      {sorted.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            {sorted.map((c) => {
              const badge = STRENGTH_BADGE[c.strength] ?? STRENGTH_BADGE.weak!;
              return (
                <span key={c.metricSlug} className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      c.direction === 'positive' ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-foreground">
                    {c.displayName}: r={c.pearsonR >= 0 ? '+' : ''}{c.pearsonR.toFixed(2)}
                  </span>
                  <span className={`px-1.5 py-0 rounded text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                    {c.strength}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
