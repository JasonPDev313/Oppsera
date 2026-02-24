'use client';

import { useState, useCallback } from 'react';
import { Plus, X, Play, Loader2 } from 'lucide-react';
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

export interface ScenarioInput {
  label: string;
  adjustmentType: 'price' | 'volume' | 'cost';
  changePct: number;
}

export interface SimulationInput {
  baseMetric: string;
  scenarios: ScenarioInput[];
}

export interface ComputedScenario {
  label: string;
  projectedValue: number;
  deltaAbsolute: number;
  deltaPct: number;
}

export interface SimulationResult {
  baseValue: number;
  scenarios: ComputedScenario[];
}

interface WhatIfPanelProps {
  onSimulate: (input: SimulationInput) => void;
  result?: SimulationResult;
  isLoading?: boolean;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const MAX_SCENARIOS = 3;

const ADJUSTMENT_TYPES: { value: ScenarioInput['adjustmentType']; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'volume', label: 'Volume' },
  { value: 'cost', label: 'Cost' },
];

const METRIC_OPTIONS = [
  { value: 'total_sales', label: 'Total Sales' },
  { value: 'gross_profit', label: 'Gross Profit' },
  { value: 'order_count', label: 'Order Count' },
  { value: 'avg_order_value', label: 'Avg Order Value' },
  { value: 'labor_cost', label: 'Labor Cost' },
];

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// ── Tooltip ────────────────────────────────────────────────────────

interface ScenarioTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { label: string; value: number; delta: number; deltaPct: number } }>;
}

function ScenarioTooltip({ active, payload }: ScenarioTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 text-xs shadow-lg">
      <p className="font-medium text-foreground mb-1">{item.label}</p>
      <p className="text-muted-foreground">Value: {currencyFormatter.format(item.value)}</p>
      {item.delta !== 0 && (
        <p className={item.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}>
          {item.delta >= 0 ? '+' : ''}{currencyFormatter.format(item.delta)} ({item.deltaPct >= 0 ? '+' : ''}{item.deltaPct.toFixed(1)}%)
        </p>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────

export function WhatIfPanel({
  onSimulate,
  result,
  isLoading,
  className,
}: WhatIfPanelProps) {
  const [baseMetric, setBaseMetric] = useState(METRIC_OPTIONS[0]!.value);
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    { label: 'Scenario 1', adjustmentType: 'price', changePct: 10 },
  ]);

  const addScenario = useCallback(() => {
    if (scenarios.length >= MAX_SCENARIOS) return;
    setScenarios((prev) => [
      ...prev,
      {
        label: `Scenario ${prev.length + 1}`,
        adjustmentType: 'price',
        changePct: 10,
      },
    ]);
  }, [scenarios.length]);

  const removeScenario = useCallback((idx: number) => {
    setScenarios((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateScenario = useCallback(
    (idx: number, field: keyof ScenarioInput, value: string | number) => {
      setScenarios((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
      );
    },
    [],
  );

  const handleSimulate = useCallback(() => {
    onSimulate({ baseMetric, scenarios });
  }, [onSimulate, baseMetric, scenarios]);

  // Build chart data from result
  const chartData = result
    ? [
        { label: 'Baseline', value: result.baseValue, delta: 0, deltaPct: 0 },
        ...result.scenarios.map((s) => ({
          label: s.label,
          value: s.projectedValue,
          delta: s.deltaAbsolute,
          deltaPct: s.deltaPct,
        })),
      ]
    : [];

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">What-If Scenario Modeling</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Metric selector */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Base Metric
          </label>
          <select
            value={baseMetric}
            onChange={(e) => setBaseMetric(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {METRIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Scenarios */}
        <div className="space-y-3">
          {scenarios.map((scenario, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={scenario.label}
                  onChange={(e) => updateScenario(idx, 'label', e.target.value)}
                  className="text-sm font-medium text-foreground bg-transparent border-none focus:outline-none w-full"
                  maxLength={40}
                />
                {scenarios.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeScenario(idx)}
                    className="p-1 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                    title="Remove scenario"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* Adjustment type */}
                <select
                  value={scenario.adjustmentType}
                  onChange={(e) =>
                    updateScenario(idx, 'adjustmentType', e.target.value)
                  }
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>

                {/* Slider */}
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="range"
                    min={-50}
                    max={100}
                    step={1}
                    value={scenario.changePct}
                    onChange={(e) =>
                      updateScenario(idx, 'changePct', Number(e.target.value))
                    }
                    className="flex-1 h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <span
                    className={`text-xs font-mono font-medium w-12 text-right ${
                      scenario.changePct >= 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {scenario.changePct >= 0 ? '+' : ''}
                    {scenario.changePct}%
                  </span>
                </div>
              </div>
            </div>
          ))}

          {scenarios.length < MAX_SCENARIOS && (
            <button
              type="button"
              onClick={addScenario}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-gray-200/50 rounded-md transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Scenario
            </button>
          )}
        </div>

        {/* Simulate button */}
        <button
          type="button"
          onClick={handleSimulate}
          disabled={isLoading || scenarios.length === 0}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isLoading ? 'Simulating...' : 'Run Simulation'}
        </button>

        {/* Results */}
        {result && !isLoading && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground">Results</h4>

            {/* Bar chart comparison */}
            <ResponsiveContainer width="100%" height={Math.max(chartData.length * 40 + 30, 120)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
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
                  width={80}
                />
                <Tooltip content={<ScenarioTooltip />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Delta cards */}
            <div className="space-y-1.5">
              {result.scenarios.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/30"
                >
                  <span className="text-xs font-medium text-foreground">{s.label}</span>
                  <span
                    className={`text-xs font-medium ${
                      s.deltaAbsolute >= 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {s.deltaAbsolute >= 0 ? '+' : ''}
                    {currencyFormatter.format(s.deltaAbsolute)} ({s.deltaPct >= 0 ? '+' : ''}
                    {s.deltaPct.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
