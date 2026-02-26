'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────

export interface DataPoint {
  date: string;
  value: number;
}

export interface ForecastPoint {
  date: string;
  predicted: number;
  upperBound: number;
  lowerBound: number;
}

interface ForecastChartProps {
  historical: DataPoint[];
  forecast: ForecastPoint[];
  metric: string;
  trend: string;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const TREND_CONFIG: Record<string, { icon: typeof TrendingUp; label: string; color: string }> = {
  up: { icon: TrendingUp, label: 'Up', color: 'text-emerald-500' },
  down: { icon: TrendingDown, label: 'Down', color: 'text-red-500' },
  flat: { icon: Minus, label: 'Flat', color: 'text-muted-foreground' },
};

// ── Helpers ────────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Tooltip ────────────────────────────────────────────────────────

interface ForecastTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function ForecastTooltip({ active, payload, label }: ForecastTooltipProps) {
  if (!active || !payload?.length || !label) return null;

  const historical = payload.find((p) => p.name === 'value');
  const predicted = payload.find((p) => p.name === 'predicted');
  const upper = payload.find((p) => p.name === 'upperBound');
  const lower = payload.find((p) => p.name === 'lowerBound');

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 text-xs shadow-lg">
      <p className="font-medium text-foreground mb-1">{formatDateShort(label)}</p>
      {historical && (
        <p className="text-blue-500">
          Actual: {currencyFormatter.format(historical.value)}
        </p>
      )}
      {predicted && (
        <p className="text-amber-500">
          Forecast: {currencyFormatter.format(predicted.value)}
        </p>
      )}
      {upper && lower && (
        <p className="text-muted-foreground">
          Range: {currencyFormatter.format(lower.value)} &ndash; {currencyFormatter.format(upper.value)}
        </p>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function ForecastChart({
  historical,
  forecast,
  metric,
  trend,
  className,
}: ForecastChartProps) {
  const trendConfig = TREND_CONFIG[trend.toLowerCase()] ?? TREND_CONFIG.flat!;
  const TrendIcon = trendConfig.icon;

  // Merge historical + forecast into a single series for Recharts
  const chartData = useMemo(() => {
    const histEntries = historical.map((h) => ({
      date: h.date,
      value: h.value,
      predicted: null as number | null,
      upperBound: null as number | null,
      lowerBound: null as number | null,
    }));

    const forecastEntries = forecast.map((f) => ({
      date: f.date,
      value: null as number | null,
      predicted: f.predicted,
      upperBound: f.upperBound,
      lowerBound: f.lowerBound,
    }));

    // Bridge: last historical point connects to first forecast point
    if (histEntries.length > 0 && forecastEntries.length > 0) {
      const lastHist = histEntries[histEntries.length - 1]!;
      forecastEntries[0] = {
        ...forecastEntries[0]!,
        value: lastHist.value,
      };
    }

    return [...histEntries, ...forecastEntries];
  }, [historical, forecast]);

  // The boundary date (last historical point)
  const boundaryDate = historical.length > 0 ? historical[historical.length - 1]!.date : null;

  if (chartData.length === 0) {
    return (
      <div className={`rounded-lg border border-border bg-surface p-6 text-center ${className ?? ''}`}>
        <p className="text-sm text-muted-foreground">No forecast data available</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{metric} Forecast</h3>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted ${trendConfig.color}`}
        >
          <TrendIcon className="h-3 w-3" />
          {trendConfig.label}
        </span>
      </div>

      {/* Chart */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--sem-border, #30363d)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatDateShort}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => currencyFormatter.format(v)}
              width={70}
            />
            <Tooltip content={<ForecastTooltip />} />

            {/* Confidence band (shaded area between upper and lower) */}
            <Area
              type="monotone"
              dataKey="upperBound"
              stroke="none"
              fill="#f59e0b"
              fillOpacity={0.1}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="lowerBound"
              stroke="none"
              fill="#ffffff"
              fillOpacity={0.8}
              connectNulls={false}
            />

            {/* Historical solid line */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6' }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />

            {/* Forecast dashed line */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 3, fill: '#f59e0b' }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />

            {/* Boundary divider line */}
            {boundaryDate && (
              <ReferenceLine
                x={boundaryDate}
                stroke="var(--sem-muted-foreground, #8b949e)"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{
                  value: 'Today',
                  position: 'top',
                  fontSize: 10,
                  fill: 'var(--sem-muted-foreground, #8b949e)',
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 pb-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-blue-500 rounded" />
          Historical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-amber-500 rounded" style={{ borderBottom: '2px dashed #f59e0b', height: 0 }} />
          Forecast
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 bg-amber-500/10 rounded" />
          Confidence band
        </span>
      </div>
    </div>
  );
}
