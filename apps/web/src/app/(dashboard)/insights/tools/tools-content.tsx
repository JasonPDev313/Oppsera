'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Wrench,
  Search,
  GitBranch,
  TrendingUp,
  FlaskConical,
} from 'lucide-react';
import { useRootCause } from '@/hooks/use-root-cause';
import { useCorrelations } from '@/hooks/use-correlations';
import { useForecast } from '@/hooks/use-forecast';
import { useWhatIf } from '@/hooks/use-whatif';
import { RootCausePanel } from '@/components/insights/RootCausePanel';
import { CorrelationChart } from '@/components/insights/CorrelationChart';
import { ForecastChart } from '@/components/insights/ForecastChart';
import { WhatIfPanel } from '@/components/insights/WhatIfPanel';
import { apiFetch } from '@/lib/api-client';


// ── Registry metric shape ─────────────────────────────────────────

interface RegistryMetric {
  slug: string;
  displayName: string;
  description: string;
  domain: string;
}

// ── Fallback metrics (used when registry API returns empty) ───────
// These match the 10 metrics supported by root-cause, correlations,
// and forecast services (from rm_daily_sales columns).

const FALLBACK_METRICS: RegistryMetric[] = [
  // ── rm_daily_sales metrics (Core) ──
  { slug: 'net_sales', displayName: 'Net Sales', description: 'Total sales minus voids and discounts', domain: 'Core' },
  { slug: 'gross_sales', displayName: 'Gross Sales', description: 'Total sales before adjustments', domain: 'Core' },
  { slug: 'order_count', displayName: 'Order Count', description: 'Number of orders placed', domain: 'Core' },
  { slug: 'avg_order_value', displayName: 'Avg Order Value', description: 'Average revenue per order', domain: 'Core' },
  { slug: 'discount_total', displayName: 'Discount Total', description: 'Total discounts applied', domain: 'Core' },
  { slug: 'tax_total', displayName: 'Tax Total', description: 'Total tax collected', domain: 'Core' },
  { slug: 'void_count', displayName: 'Void Count', description: 'Number of voided orders', domain: 'Core' },
  { slug: 'void_total', displayName: 'Void Total', description: 'Total value of voided orders', domain: 'Core' },
  { slug: 'tender_cash', displayName: 'Cash Tenders', description: 'Total cash payments received', domain: 'Core' },
  { slug: 'tender_card', displayName: 'Card Tenders', description: 'Total card payments received', domain: 'Core' },
  { slug: 'tender_gift_card', displayName: 'Gift Card Tenders', description: 'Total gift card payments received', domain: 'Core' },
  { slug: 'tender_house_account', displayName: 'House Account Tenders', description: 'Total house account payments received', domain: 'Core' },
  { slug: 'tender_ach', displayName: 'ACH Tenders', description: 'Total ACH payments received', domain: 'Core' },
  { slug: 'tender_other', displayName: 'Other Tenders', description: 'Total other payments received', domain: 'Core' },
  { slug: 'tip_total', displayName: 'Tips', description: 'Total tips collected', domain: 'Core' },
  { slug: 'service_charge_total', displayName: 'Service Charges', description: 'Total service charges applied', domain: 'Core' },
  { slug: 'surcharge_total', displayName: 'Surcharges', description: 'Total surcharges applied', domain: 'Core' },
  { slug: 'return_total', displayName: 'Returns', description: 'Total value of returns processed', domain: 'Core' },
  { slug: 'pms_revenue', displayName: 'PMS Revenue', description: 'Revenue from property management', domain: 'Core' },
  { slug: 'ar_revenue', displayName: 'AR Revenue', description: 'Revenue from accounts receivable', domain: 'Core' },
  { slug: 'membership_revenue', displayName: 'Membership Revenue', description: 'Revenue from membership billing', domain: 'Core' },
  { slug: 'voucher_revenue', displayName: 'Voucher Revenue', description: 'Revenue from voucher redemptions', domain: 'Core' },
  { slug: 'total_business_revenue', displayName: 'Total Business Revenue', description: 'Aggregate revenue across all sources', domain: 'Core' },
  // ── rm_item_sales metrics (Inventory) ──
  { slug: 'item_quantity_sold', displayName: 'Items Quantity Sold', description: 'Total quantity of items sold', domain: 'Inventory' },
  { slug: 'item_gross_revenue', displayName: 'Items Gross Revenue', description: 'Gross revenue from item sales', domain: 'Inventory' },
  { slug: 'item_quantity_voided', displayName: 'Items Quantity Voided', description: 'Total quantity of items voided', domain: 'Inventory' },
  { slug: 'item_void_revenue', displayName: 'Items Void Revenue', description: 'Revenue lost from voided items', domain: 'Inventory' },
  // ── rm_spa_daily_operations metrics (Spa) ──
  { slug: 'spa_appointment_count', displayName: 'Spa Appointment Count', description: 'Total spa appointments scheduled', domain: 'Spa' },
  { slug: 'spa_completed_count', displayName: 'Spa Completed Count', description: 'Total spa appointments completed', domain: 'Spa' },
  { slug: 'spa_canceled_count', displayName: 'Spa Canceled Count', description: 'Total spa appointments canceled', domain: 'Spa' },
  { slug: 'spa_no_show_count', displayName: 'Spa No-Show Count', description: 'Total spa appointment no-shows', domain: 'Spa' },
  { slug: 'spa_walk_in_count', displayName: 'Spa Walk-In Count', description: 'Total spa walk-in appointments', domain: 'Spa' },
  { slug: 'spa_online_booking_count', displayName: 'Spa Online Bookings', description: 'Total spa online bookings received', domain: 'Spa' },
  { slug: 'spa_total_revenue', displayName: 'Spa Total Revenue', description: 'Total spa revenue from all sources', domain: 'Spa' },
  { slug: 'spa_service_revenue', displayName: 'Spa Service Revenue', description: 'Revenue from spa services', domain: 'Spa' },
  { slug: 'spa_addon_revenue', displayName: 'Spa Add-On Revenue', description: 'Revenue from spa add-on services', domain: 'Spa' },
  { slug: 'spa_retail_revenue', displayName: 'Spa Retail Revenue', description: 'Revenue from spa retail product sales', domain: 'Spa' },
  { slug: 'spa_tip_total', displayName: 'Spa Tips', description: 'Total tips from spa services', domain: 'Spa' },
  { slug: 'spa_avg_appointment_duration', displayName: 'Spa Avg Duration', description: 'Average spa appointment duration in minutes', domain: 'Spa' },
  { slug: 'spa_utilization_pct', displayName: 'Spa Utilization %', description: 'Percentage of spa provider capacity utilized', domain: 'Spa' },
  { slug: 'spa_rebooking_rate', displayName: 'Spa Rebooking Rate', description: 'Rate at which spa clients rebook', domain: 'Spa' },
];

// ── Time-series metric slugs ─────────────────────────────────────
// These are the metrics backed by tables with a business_date column
// (rm_daily_sales, rm_item_sales, rm_spa_daily_operations).
// Snapshot-only metrics (rm_inventory_on_hand, rm_customer_activity)
// do NOT have date-based aggregation and cannot be used with
// Root Cause, Correlations, or Forecast tools.

const TIME_SERIES_METRIC_SLUGS = new Set([
  // rm_daily_sales
  'net_sales', 'gross_sales', 'order_count', 'avg_order_value',
  'discount_total', 'tax_total', 'void_count', 'void_total',
  'tender_cash', 'tender_card', 'tender_gift_card', 'tender_house_account',
  'tender_ach', 'tender_other', 'tip_total', 'service_charge_total',
  'surcharge_total', 'return_total', 'pms_revenue', 'ar_revenue',
  'membership_revenue', 'voucher_revenue', 'total_business_revenue',
  // rm_item_sales
  'item_quantity_sold', 'item_gross_revenue', 'item_quantity_voided', 'item_void_revenue',
  // rm_spa_daily_operations
  'spa_appointment_count', 'spa_completed_count', 'spa_canceled_count',
  'spa_no_show_count', 'spa_walk_in_count', 'spa_online_booking_count',
  'spa_total_revenue', 'spa_service_revenue', 'spa_addon_revenue',
  'spa_retail_revenue', 'spa_tip_total', 'spa_avg_appointment_duration',
  'spa_utilization_pct', 'spa_rebooking_rate',
]);

// ── Helpers ────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const INPUT_CLS =
  'w-full px-3 py-2 text-sm bg-surface border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors';

// ── Metric Selector ───────────────────────────────────────────────

function MetricSelect({
  id,
  value,
  onChange,
  metrics,
  isLoading,
  placeholder = 'Select a metric...',
}: {
  id?: string;
  value: string;
  onChange: (slug: string) => void;
  metrics: RegistryMetric[];
  isLoading: boolean;
  placeholder?: string;
}) {
  const grouped = new Map<string, RegistryMetric[]>();
  for (const m of metrics) {
    const domain = m.domain || 'General';
    const group = grouped.get(domain) ?? [];
    group.push(m);
    grouped.set(domain, group);
  }

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS}>
      <option value="">{isLoading ? 'Loading metrics...' : placeholder}</option>
      {Array.from(grouped.entries()).map(([domain, items]) => (
        <optgroup key={domain} label={domain}>
          {items.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.displayName}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ── Field hint ────────────────────────────────────────────────────

function FieldHint({ children }: { children: string }) {
  return <p className="text-[11px] text-muted-foreground/70 mt-1">{children}</p>;
}

// ── Tab definitions ───────────────────────────────────────────────

const TABS = [
  { key: 'root-cause', label: 'Root Cause', icon: Search, color: 'text-blue-500' },
  { key: 'correlations', label: 'Correlations', icon: GitBranch, color: 'text-purple-500' },
  { key: 'forecast', label: 'Forecast', icon: TrendingUp, color: 'text-emerald-500' },
  { key: 'what-if', label: 'What-If', icon: FlaskConical, color: 'text-amber-500' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ── ToolsContent ──────────────────────────────────────────────────

export default function ToolsContent({ embedded }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState<TabKey>('root-cause');

  // ── Shared: fetch metrics from registry ──
  const [metrics, setMetrics] = useState<RegistryMetric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setMetricsLoading(true);
      try {
        const res = await apiFetch<{ data: RegistryMetric[] }>('/api/v1/semantic/metrics');
        if (!cancelled) setMetrics(res.data.length > 0 ? res.data : FALLBACK_METRICS);
      } catch {
        // API unavailable — use hardcoded fallback so tools are still usable
        if (!cancelled) setMetrics(FALLBACK_METRICS);
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Filter metrics for time-series tools ──
  // Root Cause, Correlations, and Forecast need date-based aggregation.
  // Snapshot-only metrics (inventory on-hand, customer activity) are excluded.
  const timeSeriesMetrics = useMemo(
    () => metrics.filter((m) => TIME_SERIES_METRIC_SLUGS.has(m.slug)),
    [metrics],
  );

  // ── Hooks ──
  const rootCause = useRootCause();
  const correlations = useCorrelations();
  const forecast = useForecast();
  const whatIf = useWhatIf();

  // ── Root Cause form state ──
  const [rcMetric, setRcMetric] = useState('');
  const [rcStart, setRcStart] = useState(daysAgo(14));
  const [rcEnd, setRcEnd] = useState(todayStr());
  const [rcCompStart, setRcCompStart] = useState(daysAgo(28));
  const [rcCompEnd, setRcCompEnd] = useState(daysAgo(14));

  // ── Correlations form state ──
  const [corrMetric, setCorrMetric] = useState('');
  const [corrDays, setCorrDays] = useState(90);

  // ── Forecast form state ──
  const [fcMetric, setFcMetric] = useState('');
  const [fcHorizon, setFcHorizon] = useState(30);
  const [fcSeasonality, setFcSeasonality] = useState(true);

  return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto'}>
      {!embedded && (
        <>
          <Link
            href="/insights"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Chat
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Analysis Tools</h1>
              <p className="text-sm text-muted-foreground">
                Advanced analytics powered by your semantic layer
              </p>
            </div>
          </div>
        </>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}
              `}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {/* ── Root Cause ── */}
        {activeTab === 'root-cause' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Search className="h-4.5 w-4.5 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Root Cause Analysis</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Understand <em>why</em> a metric changed by decomposing it across
                    dimensions like location, category, day of week, and payment type.
                  </p>
                </div>
              </div>

              {/* Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="sm:col-span-2">
                  <label htmlFor="rc-metric" className="block text-xs font-medium text-muted-foreground mb-1">Metric</label>
                  <MetricSelect id="rc-metric" value={rcMetric} onChange={setRcMetric} metrics={timeSeriesMetrics} isLoading={metricsLoading} />
                  <FieldHint>The KPI whose change you want to explain.</FieldHint>
                </div>
                <div>
                  <label htmlFor="rc-start" className="block text-xs font-medium text-muted-foreground mb-1">Analysis Start</label>
                  <input id="rc-start" type="date" value={rcStart} onChange={(e) => setRcStart(e.target.value)} className={INPUT_CLS} />
                </div>
                <div>
                  <label htmlFor="rc-end" className="block text-xs font-medium text-muted-foreground mb-1">Analysis End</label>
                  <input id="rc-end" type="date" value={rcEnd} onChange={(e) => setRcEnd(e.target.value)} className={INPUT_CLS} />
                </div>
                <div>
                  <label htmlFor="rc-comp-start" className="block text-xs font-medium text-muted-foreground mb-1">Comparison Start</label>
                  <input id="rc-comp-start" type="date" value={rcCompStart} onChange={(e) => setRcCompStart(e.target.value)} className={INPUT_CLS} />
                  <FieldHint>The baseline period to compare against.</FieldHint>
                </div>
                <div>
                  <label htmlFor="rc-comp-end" className="block text-xs font-medium text-muted-foreground mb-1">Comparison End</label>
                  <input id="rc-comp-end" type="date" value={rcCompEnd} onChange={(e) => setRcCompEnd(e.target.value)} className={INPUT_CLS} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!rcMetric) return;
                  rootCause.analyze({
                    metricSlug: rcMetric,
                    startDate: rcStart,
                    endDate: rcEnd,
                    comparisonStart: rcCompStart,
                    comparisonEnd: rcCompEnd,
                  });
                }}
                disabled={!rcMetric || rootCause.isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Search className="h-4 w-4" />
                {rootCause.isLoading ? 'Analyzing...' : 'Run Analysis'}
              </button>

              {/* Results */}
              {rootCause.isLoading && (
                <div className="flex flex-col items-center justify-center py-12 mt-4 gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
                  <p className="text-xs text-muted-foreground">Decomposing metric across dimensions...</p>
                </div>
              )}
              {rootCause.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500 mt-4">
                  {rootCause.error}
                </div>
              )}
              {!rootCause.isLoading && rootCause.result && (
                <div className="mt-4">
                  <RootCausePanel result={rootCause.result as never} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Correlations ── */}
        {activeTab === 'correlations' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                  <GitBranch className="h-4.5 w-4.5 text-purple-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Metric Correlations</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Discover which metrics move together and find leading indicators
                    you didn&apos;t know existed.
                  </p>
                </div>
              </div>


              {/* Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="sm:col-span-2">
                  <label htmlFor="corr-metric" className="block text-xs font-medium text-muted-foreground mb-1">Target Metric</label>
                  <MetricSelect
                    id="corr-metric"
                    value={corrMetric}
                    onChange={setCorrMetric}
                    metrics={timeSeriesMetrics}
                    isLoading={metricsLoading}
                    placeholder="Select a target metric..."
                  />
                  <FieldHint>Every other metric will be tested against this one.</FieldHint>
                </div>
                <div>
                  <label htmlFor="corr-days" className="block text-xs font-medium text-muted-foreground mb-1">Lookback Period (days)</label>
                  <input
                    id="corr-days"
                    type="number"
                    value={corrDays}
                    onChange={(e) => setCorrDays(Number(e.target.value) || 90)}
                    min={7}
                    max={365}
                    className={INPUT_CLS}
                  />
                  <FieldHint>Longer periods produce more reliable results. Min 7, max 365.</FieldHint>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!corrMetric) return;
                  correlations.discover({ targetMetricSlug: corrMetric, days: corrDays });
                }}
                disabled={!corrMetric || correlations.isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GitBranch className="h-4 w-4" />
                {correlations.isLoading ? 'Discovering...' : 'Discover Correlations'}
              </button>

              {/* Results */}
              {correlations.isLoading && (
                <div className="flex flex-col items-center justify-center py-12 mt-4 gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
                  <p className="text-xs text-muted-foreground">Calculating correlations across all metrics...</p>
                </div>
              )}
              {correlations.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500 mt-4">
                  {correlations.error}
                </div>
              )}
              {!correlations.isLoading && correlations.result && (
                <div className="mt-4">
                  <CorrelationChart correlations={correlations.result.correlations as never} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Forecast ── */}
        {activeTab === 'forecast' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-4.5 w-4.5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Forecast</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Project any metric into the future with confidence intervals
                    so you can plan for best- and worst-case outcomes.
                  </p>
                </div>
              </div>


              {/* Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="sm:col-span-2">
                  <label htmlFor="fc-metric" className="block text-xs font-medium text-muted-foreground mb-1">Metric</label>
                  <MetricSelect id="fc-metric" value={fcMetric} onChange={setFcMetric} metrics={timeSeriesMetrics} isLoading={metricsLoading} />
                  <FieldHint>The KPI you want to project into the future.</FieldHint>
                </div>
                <div>
                  <label htmlFor="fc-horizon" className="block text-xs font-medium text-muted-foreground mb-1">Forecast Horizon (days)</label>
                  <input
                    id="fc-horizon"
                    type="number"
                    value={fcHorizon}
                    onChange={(e) => setFcHorizon(Number(e.target.value) || 30)}
                    min={7}
                    max={180}
                    className={INPUT_CLS}
                  />
                  <FieldHint>Shorter horizons are more accurate. 30 days is a good starting point.</FieldHint>
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fcSeasonality}
                      onChange={(e) => setFcSeasonality(e.target.checked)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
                    />
                    <span className="text-sm text-foreground">Include seasonality</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!fcMetric) return;
                  forecast.generate({
                    metricSlug: fcMetric,
                    forecastDays: fcHorizon,
                  });
                }}
                disabled={!fcMetric || forecast.isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <TrendingUp className="h-4 w-4" />
                {forecast.isLoading ? 'Generating...' : 'Generate Forecast'}
              </button>

              {/* Results */}
              {forecast.isLoading && (
                <div className="flex flex-col items-center justify-center py-12 mt-4 gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
                  <p className="text-xs text-muted-foreground">Building forecast model...</p>
                </div>
              )}
              {forecast.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500 mt-4">
                  {forecast.error}
                </div>
              )}
              {!forecast.isLoading && forecast.result && (
                <div className="mt-4">
                  <ForecastChart
                    historical={forecast.result.historicalData}
                    forecast={forecast.result.forecastData}
                    metric={forecast.result.metric}
                    trend={forecast.result.trend}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── What-If ── */}
        {activeTab === 'what-if' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <FlaskConical className="h-4.5 w-4.5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">What-If Scenarios</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Model the financial impact of hypothetical changes before you make them
                    and see how the ripple effects flow through your KPIs.
                  </p>
                </div>
              </div>


              <WhatIfPanel
                onSimulate={(input) => whatIf.simulate(input)}
                result={whatIf.result ?? undefined}
                isLoading={whatIf.isLoading}
                error={whatIf.error ?? undefined}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
