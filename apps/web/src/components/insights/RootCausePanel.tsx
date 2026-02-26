'use client';

import { useState, useMemo } from 'react';
import { BarChart2, Table2, TrendingUp, TrendingDown } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────

export interface Contributor {
  dimension: string;
  dimensionValue: string;
  contribution: number;
  contributionPct: number;
  direction: 'up' | 'down';
  previousValue: number;
  currentValue: number;
}

export interface RootCauseResult {
  metric: string;
  totalChange: number;
  changePct: number;
  contributors: Contributor[];
  summary: string;
}

interface RootCausePanelProps {
  result: RootCauseResult;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

// ── Helpers ────────────────────────────────────────────────────────

function formatChange(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${currencyFormatter.format(value)}`;
}

function formatPct(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${numberFormatter.format(value)}%`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Tooltip ────────────────────────────────────────────────────────

interface WaterfallTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Contributor & { label: string } }>;
}

function WaterfallTooltip({ active, payload }: WaterfallTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 text-xs shadow-lg">
      <p className="font-medium text-foreground mb-1">{item.label}</p>
      <p className="text-muted-foreground">
        Previous: {currencyFormatter.format(item.previousValue)}
      </p>
      <p className="text-muted-foreground">
        Current: {currencyFormatter.format(item.currentValue)}
      </p>
      <p className={`font-medium ${item.direction === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
        Impact: {formatChange(item.contribution)} ({formatPct(item.contributionPct)})
      </p>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function RootCausePanel({ result, className }: RootCausePanelProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const chartData = useMemo(() => {
    return result.contributors.map((c) => ({
      ...c,
      label: `${humanizeKey(c.dimension)}: ${c.dimensionValue}`,
    }));
  }, [result.contributors]);

  const isPositive = result.totalChange >= 0;

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            Why did {result.metric} change?
          </h3>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
              isPositive
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-red-500/10 text-red-500'
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {formatChange(result.totalChange)} ({formatPct(result.changePct)})
          </span>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setViewMode('chart')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'chart'
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Chart view"
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded transition-colors ${
              viewMode === 'table'
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Table view"
          >
            <Table2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {viewMode === 'chart' ? (
          <WaterfallChart data={chartData} />
        ) : (
          <ContributorsTable contributors={result.contributors} totalChange={result.totalChange} />
        )}
      </div>

      {/* Summary */}
      {result.summary && (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {result.summary}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Waterfall Chart ────────────────────────────────────────────────

function WaterfallChart({
  data,
}: {
  data: (Contributor & { label: string })[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No contributors to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 36 + 40, 160)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => currencyFormatter.format(v)}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--sem-muted-foreground, #8b949e)' }}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip content={<WaterfallTooltip />} />
        <ReferenceLine x={0} stroke="var(--sem-border, #30363d)" />
        <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
          {data.map((entry, idx) => (
            <Cell
              key={idx}
              fill={entry.direction === 'up' ? '#10b981' : '#ef4444'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Contributors Table ─────────────────────────────────────────────

function ContributorsTable({
  contributors,
  totalChange,
}: {
  contributors: Contributor[];
  totalChange: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Dimension</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Value</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Previous</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Current</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Change</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">% of Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {contributors.map((c, idx) => {
            const pctOfTotal =
              totalChange !== 0
                ? Math.round((Math.abs(c.contribution) / Math.abs(totalChange)) * 100)
                : 0;
            return (
              <tr key={idx} className="hover:bg-gray-200/50 transition-colors">
                <td className="px-3 py-2 text-foreground font-medium">
                  {humanizeKey(c.dimension)}
                </td>
                <td className="px-3 py-2 text-foreground">{c.dimensionValue}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {currencyFormatter.format(c.previousValue)}
                </td>
                <td className="px-3 py-2 text-right text-foreground">
                  {currencyFormatter.format(c.currentValue)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium ${
                    c.direction === 'up' ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {formatChange(c.contribution)}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {pctOfTotal}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
