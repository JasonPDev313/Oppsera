'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────

export interface ChartConfig {
  type: 'line' | 'bar' | 'sparkline' | 'table' | 'metric_card' | 'comparison';
  xAxis?: string;
  yAxis?: string[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  yFormat?: 'currency' | 'number' | 'percent';
  comparisonLabel?: string;
}

export interface InlineChartProps {
  config: ChartConfig;
  data: Record<string, unknown>[];
  className?: string;
}

// ── Color palette ──────────────────────────────────────────────

const COLORS = {
  primary: '#3b82f6',   // blue-500 (indigo remapped to blue in this project)
  secondary: '#10b981', // emerald-500
  tertiary: '#f59e0b',  // amber-500
  quaternary: '#8b5cf6', // violet-500
} as const;

const SERIES_COLORS = [
  COLORS.primary,
  COLORS.secondary,
  COLORS.tertiary,
  COLORS.quaternary,
];

// ── Format helpers ─────────────────────────────────────────────

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatValue(value: unknown, format?: 'currency' | 'number' | 'percent'): string {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value);

  switch (format) {
    case 'currency':
      return currencyFormatter.format(num);
    case 'percent':
      // If the value is already a fraction (e.g. 0.123), format directly.
      // If it looks like a whole percentage (e.g. 12.3), divide by 100.
      return percentFormatter.format(num > 1 && num <= 100 ? num / 100 : num);
    case 'number':
      return numberFormatter.format(num);
    default:
      // Auto-detect: if it looks like currency (has decimals and is > 1), format as number
      if (typeof num === 'number') return numberFormatter.format(num);
      return String(value);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

// ── Date detection and formatting ──────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function looksLikeDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return ISO_DATE_RE.test(value);
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function resolveXKey(config: ChartConfig, data: Record<string, unknown>[]): string {
  if (config.xAxis) return config.xAxis;
  if (data.length === 0) return '';
  const keys = Object.keys(data[0]!);
  // Pick the first non-numeric key, or the first key
  return keys.find((k) => typeof data[0]![k] === 'string') ?? keys[0] ?? '';
}

function resolveYKeys(config: ChartConfig, data: Record<string, unknown>[], xKey: string): string[] {
  if (config.yAxis && config.yAxis.length > 0) return config.yAxis;
  if (data.length === 0) return [];
  // Pick all numeric keys that are not the x-axis
  return Object.keys(data[0]!).filter((k) => {
    if (k === xKey) return false;
    const sample = data[0]![k];
    return typeof sample === 'number' || (typeof sample === 'string' && !isNaN(Number(sample)));
  });
}

// ── Tooltip ────────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  format?: 'currency' | 'number' | 'percent';
  xIsDate?: boolean;
}

function ChartTooltip({ active, payload, label, format, xIsDate }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const displayLabel = xIsDate && typeof label === 'string' && looksLikeDate(label)
    ? formatDateShort(label)
    : label;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-sm shadow-lg">
      {displayLabel && (
        <p className="font-medium text-card-foreground mb-1">{displayLabel}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="text-muted-foreground text-xs" style={{ color: entry.color }}>
          {humanizeKey(entry.name)}: {formatValue(entry.value, format)}
        </p>
      ))}
    </div>
  );
}

// ── Humanize key (snake_case / camelCase to readable) ──────────

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Trend calculation ──────────────────────────────────────────

function computeTrend(data: Record<string, unknown>[], yKey: string): {
  direction: 'up' | 'down' | 'flat';
  percentChange: number;
} {
  if (data.length < 2) return { direction: 'flat', percentChange: 0 };
  const first = toNumber(data[0]![yKey]);
  const last = toNumber(data[data.length - 1]![yKey]);
  if (first === 0) return { direction: last > 0 ? 'up' : last < 0 ? 'down' : 'flat', percentChange: 0 };
  const pct = ((last - first) / Math.abs(first)) * 100;
  return {
    direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat',
    percentChange: Math.round(pct * 10) / 10,
  };
}

// ── Sub-components ─────────────────────────────────────────────

function InlineLineChart({ config, data }: InlineChartProps) {
  const xKey = resolveXKey(config, data);
  const yKeys = resolveYKeys(config, data, xKey);
  const xIsDate = data.length > 0 && looksLikeDate(data[0]![xKey]);

  const chartData = useMemo(() => {
    return data.map((row) => {
      const mapped: Record<string, unknown> = { ...row };
      // Ensure numeric values
      for (const yk of yKeys) {
        mapped[yk] = toNumber(row[yk]);
      }
      return mapped;
    });
  }, [data, yKeys]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--sem-border, #30363d)" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={xIsDate ? formatDateShort : undefined}
          label={config.xLabel ? { value: config.xLabel, position: 'insideBottom', offset: -5, fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' } : undefined}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatValue(v, config.yFormat)}
          width={60}
          label={config.yLabel ? { value: config.yLabel, angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' } : undefined}
        />
        <Tooltip content={<ChartTooltip format={config.yFormat} xIsDate={xIsDate} />} />
        {yKeys.map((yk, i) => (
          <Line
            key={yk}
            type="monotone"
            dataKey={yk}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: SERIES_COLORS[i % SERIES_COLORS.length] }}
            activeDot={{ r: 5 }}
            name={yk}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function InlineBarChart({ config, data }: InlineChartProps) {
  const xKey = resolveXKey(config, data);
  const yKeys = resolveYKeys(config, data, xKey);
  const isHorizontal = data.length > 8;

  const chartData = useMemo(() => {
    return data.map((row) => {
      const mapped: Record<string, unknown> = { ...row };
      for (const yk of yKeys) {
        mapped[yk] = toNumber(row[yk]);
      }
      // Truncate long labels
      const label = String(row[xKey] ?? '');
      mapped[xKey] = label.length > 20 ? label.slice(0, 18) + '\u2026' : label;
      return mapped;
    });
  }, [data, yKeys, xKey]);

  if (isHorizontal) {
    return (
      <ResponsiveContainer width="100%" height={Math.min(data.length * 28 + 40, 400)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--sem-border, #30363d)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatValue(v, config.yFormat)}
          />
          <YAxis
            type="category"
            dataKey={xKey}
            tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
            tickLine={false}
            axisLine={false}
            width={100}
          />
          <Tooltip content={<ChartTooltip format={config.yFormat} />} />
          {yKeys.map((yk, i) => (
            <Bar
              key={yk}
              dataKey={yk}
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
              radius={[0, 4, 4, 0]}
              name={yk}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--sem-border, #30363d)" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
          tickLine={false}
          axisLine={false}
          label={config.xLabel ? { value: config.xLabel, position: 'insideBottom', offset: -5, fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' } : undefined}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatValue(v, config.yFormat)}
          width={60}
          label={config.yLabel ? { value: config.yLabel, angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' } : undefined}
        />
        <Tooltip content={<ChartTooltip format={config.yFormat} />} />
        {yKeys.map((yk, i) => (
          <Bar
            key={yk}
            dataKey={yk}
            fill={SERIES_COLORS[i % SERIES_COLORS.length]}
            radius={[4, 4, 0, 0]}
            name={yk}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function InlineSparkline({ config, data }: InlineChartProps) {
  const xKey = resolveXKey(config, data);
  const yKeys = resolveYKeys(config, data, xKey);
  const yKey = yKeys[0];

  if (!yKey) return null;

  const chartData = useMemo(() => {
    return data.map((row) => ({
      x: row[xKey],
      y: toNumber(row[yKey]),
    }));
  }, [data, xKey, yKey]);

  return (
    <div className="inline-block align-middle" style={{ width: 120, height: 60 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="y"
            stroke={COLORS.primary}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function InlineMetricCard({ config, data }: InlineChartProps) {
  const yKeys = config.yAxis ?? [];
  const yKey = yKeys[0] ?? (data.length > 0 ? Object.keys(data[0]!).find((k) => {
    const v = data[0]![k];
    return typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)));
  }) : undefined);

  if (!yKey || data.length === 0) {
    return <div className="text-sm text-muted-foreground">No metric data</div>;
  }

  const latestRow = data[data.length - 1]!;
  const value = toNumber(latestRow[yKey]);
  const trend = computeTrend(data, yKey);

  // Determine if positive trend is good (default true)
  const positiveIsGood = true; // Could be extended via config.higherIsBetter
  const isGood = trend.direction === 'up' ? positiveIsGood : !positiveIsGood;

  return (
    <div className="flex items-center gap-4">
      <div>
        <div className="text-2xl font-bold text-foreground">
          {formatValue(value, config.yFormat)}
        </div>
        {config.title && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {config.title}
          </div>
        )}
      </div>

      {trend.direction !== 'flat' && data.length >= 2 && (
        <div className={`flex items-center gap-1 text-sm font-medium ${
          isGood ? 'text-emerald-500' : 'text-red-500'
        }`}>
          {trend.direction === 'up' ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span>{Math.abs(trend.percentChange)}%</span>
        </div>
      )}

      {trend.direction === 'flat' && data.length >= 2 && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Minus className="h-4 w-4" />
          <span>0%</span>
        </div>
      )}
    </div>
  );
}

function InlineComparison({ config, data }: InlineChartProps) {
  const yKeys = config.yAxis ?? [];
  const yKey = yKeys[0] ?? (data.length > 0 ? Object.keys(data[0]!).find((k) => {
    const v = data[0]![k];
    return typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)));
  }) : undefined);

  if (!yKey || data.length < 2) {
    return <div className="text-sm text-muted-foreground">Need at least 2 rows for comparison</div>;
  }

  const xKey = resolveXKey(config, data);
  const rowA = data[0]!;
  const rowB = data[1]!;
  const valA = toNumber(rowA[yKey]);
  const valB = toNumber(rowB[yKey]);
  const maxVal = Math.max(valA, valB, 1); // Avoid division by zero
  const delta = valB - valA;
  const deltaPercent = valA !== 0 ? ((delta / Math.abs(valA)) * 100) : 0;

  const labelA = String(rowA[xKey] ?? 'Period A');
  const labelB = String(rowB[xKey] ?? 'Period B');

  return (
    <div className="space-y-3">
      {/* Bar A */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{labelA}</span>
          <span className="text-sm font-medium text-foreground">{formatValue(valA, config.yFormat)}</span>
        </div>
        <div className="h-5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(valA / maxVal) * 100}%`,
              backgroundColor: COLORS.primary,
            }}
          />
        </div>
      </div>

      {/* Bar B */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{labelB}</span>
          <span className="text-sm font-medium text-foreground">{formatValue(valB, config.yFormat)}</span>
        </div>
        <div className="h-5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(valB / maxVal) * 100}%`,
              backgroundColor: COLORS.secondary,
            }}
          />
        </div>
      </div>

      {/* Delta */}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <span className="text-xs text-muted-foreground">
          {config.comparisonLabel ?? 'Change'}:
        </span>
        <span className={`text-sm font-medium ${delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {delta >= 0 ? '+' : ''}{formatValue(delta, config.yFormat)}
          {valA !== 0 && (
            <span className="text-xs ml-1">
              ({deltaPercent >= 0 ? '+' : ''}{Math.round(deltaPercent * 10) / 10}%)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function InlineTable({ data }: InlineChartProps) {
  if (data.length === 0) return null;

  const columns = Object.keys(data[0]!);

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="min-w-full text-xs">
        <thead className="bg-muted">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap"
              >
                {humanizeKey(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-accent">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 text-foreground whitespace-nowrap">
                  {formatCellValue(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

// ── Main component ─────────────────────────────────────────────

export function InlineChart({ config, data, className }: InlineChartProps) {
  // Sparklines render inline without the wrapper card
  if (config.type === 'sparkline') {
    if (!data || data.length === 0) return null;
    return <InlineSparkline config={config} data={data} className={className} />;
  }

  const hasData = data && data.length > 0;

  return (
    <div className={`rounded-lg border border-border p-3 my-2 bg-surface ${className ?? ''}`}>
      {/* Title */}
      {config.title && config.type !== 'metric_card' && (
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{config.title}</h4>
      )}

      {/* Empty state */}
      {!hasData && (
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
          No data to chart
        </div>
      )}

      {/* Chart content */}
      {hasData && config.type === 'line' && (
        <InlineLineChart config={config} data={data} />
      )}
      {hasData && config.type === 'bar' && (
        <InlineBarChart config={config} data={data} />
      )}
      {hasData && config.type === 'metric_card' && (
        <InlineMetricCard config={config} data={data} />
      )}
      {hasData && config.type === 'comparison' && (
        <InlineComparison config={config} data={data} />
      )}
      {hasData && config.type === 'table' && (
        <InlineTable config={config} data={data} />
      )}
    </div>
  );
}
