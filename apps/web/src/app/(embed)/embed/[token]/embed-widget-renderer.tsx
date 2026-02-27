'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface MetricSnapshot {
  slug: string;
  value: number;
  previousValue: number | null;
  changePct: number | null;
}

interface EmbedData {
  widgetType: string;
  config: {
    metricSlugs?: string[];
    title?: string;
    theme?: 'light' | 'dark' | 'auto';
    refreshIntervalSeconds?: number;
    chartType?: string;
  };
  viewCount: number;
  metrics: MetricSnapshot[];
}

type Theme = 'light' | 'dark';

// ── Slug display names ─────────────────────────────────────────────

const METRIC_DISPLAY_NAMES: Record<string, string> = {
  net_sales: 'Net Sales',
  gross_sales: 'Gross Sales',
  order_count: 'Orders',
  avg_order_value: 'Avg Order Value',
  void_count: 'Voids',
  discount_total: 'Discounts',
  tax_total: 'Tax Collected',
};

const CURRENCY_METRICS = new Set([
  'net_sales',
  'gross_sales',
  'avg_order_value',
  'discount_total',
  'tax_total',
]);

// ── Format helpers ─────────────────────────────────────────────────

function formatMetricValue(slug: string, value: number): string {
  if (CURRENCY_METRICS.has(slug)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatChangePct(pct: number | null): string {
  if (pct == null) return '--';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// ── Theme resolver ─────────────────────────────────────────────────

function resolveTheme(configTheme?: 'light' | 'dark' | 'auto'): Theme {
  if (configTheme === 'light' || configTheme === 'dark') return configTheme;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

// ── Theme styles ───────────────────────────────────────────────────
// NOTE: These use hardcoded Tailwind colors intentionally — embed pages
// render inside iframes on external sites, outside the dashboard's CSS
// variable context. Self-contained theming is required.

interface ThemeStyles {
  bg: string;
  text: string;
  muted: string;
  border: string;
  card: string;
  cardHover: string;
  accent: string;
  accentMuted: string;
}

const THEME_STYLES: Record<Theme, ThemeStyles> = {
  light: {
    bg: '#ffffff',
    text: '#111827',
    muted: '#6b7280',
    border: '#e5e7eb',
    card: '#f9fafb',
    cardHover: '#f3f4f6',
    accent: '#6366f1',
    accentMuted: 'rgba(99, 102, 241, 0.08)',
  },
  dark: {
    bg: '#0f172a',
    text: '#f1f5f9',
    muted: '#94a3b8',
    border: '#1e293b',
    card: '#1e293b',
    cardHover: '#334155',
    accent: '#818cf8',
    accentMuted: 'rgba(129, 140, 248, 0.1)',
  },
};

// ── Main Renderer ──────────────────────────────────────────────────

export default function EmbedWidgetRenderer() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<EmbedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/semantic/embed/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errMsg =
          (body as { error?: { message?: string } })?.error?.message ??
          (res.status === 404 ? 'Widget not found' :
           res.status === 410 ? 'Widget expired or deactivated' :
           res.status === 403 ? 'Origin not allowed' :
           'Failed to load widget');
        setError(errMsg);
        return;
      }
      const json = await res.json();
      setData(json.data);
      setError(null);
    } catch {
      setError('Failed to load widget');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!data?.config.refreshIntervalSeconds) return;
    const intervalMs = data.config.refreshIntervalSeconds * 1000;
    refreshRef.current = setInterval(fetchData, intervalMs);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [data?.config.refreshIntervalSeconds, fetchData]);

  const theme = resolveTheme(data?.config.theme);
  const ts = THEME_STYLES[theme];

  // ── Loading state ──
  if (isLoading) {
    return (
      <div
        style={{ background: ts.bg, minHeight: '100vh' }}
        className="flex items-center justify-center"
      >
        <RefreshCw
          className="h-5 w-5 animate-spin"
          style={{ color: ts.accent }}
        />
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div
        style={{ background: ts.bg, minHeight: '100vh' }}
        className="flex flex-col items-center justify-center gap-3 p-6"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239, 68, 68, 0.1)' }}
        >
          <AlertTriangle className="h-5 w-5" style={{ color: '#ef4444' }} />
        </div>
        <p className="text-sm text-center font-medium" style={{ color: ts.muted }}>
          {error}
        </p>
      </div>
    );
  }

  if (!data) return null;

  // ── Render by widget type ──
  switch (data.widgetType) {
    case 'metric_card':
      return <MetricCardWidget data={data} theme={theme} />;
    case 'kpi_grid':
      return <KpiGridWidget data={data} theme={theme} />;
    case 'chart':
      return <ChartWidget data={data} theme={theme} />;
    default:
      return <MetricCardWidget data={data} theme={theme} />;
  }
}

// ── Metric Card Widget ─────────────────────────────────────────────

function MetricCardWidget({ data, theme }: { data: EmbedData; theme: Theme }) {
  const ts = THEME_STYLES[theme];
  const metric = data.metrics[0];
  const title = data.config.title ?? (metric ? METRIC_DISPLAY_NAMES[metric.slug] : 'Metric');

  if (!metric) {
    return (
      <EmptyState theme={theme} message="No data available" />
    );
  }

  return (
    <div
      style={{ background: ts.bg, minHeight: '100vh' }}
      className="flex items-center justify-center p-5"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{
          background: ts.card,
          border: `1px solid ${ts.border}`,
        }}
      >
        {/* Title */}
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-4"
          style={{ color: ts.muted }}
        >
          {title}
        </p>

        {/* Main value */}
        <div className="flex items-end gap-3 mb-1">
          <span
            className="text-4xl font-bold tracking-tight"
            style={{ color: ts.text }}
          >
            {formatMetricValue(metric.slug, metric.value)}
          </span>
          <ChangeIndicator changePct={metric.changePct} theme={theme} />
        </div>

        {/* Previous value comparison */}
        {metric.previousValue != null && (
          <p className="text-xs mt-2" style={{ color: ts.muted }}>
            vs yesterday:{' '}
            <span className="font-medium">
              {formatMetricValue(metric.slug, metric.previousValue)}
            </span>
          </p>
        )}

        {/* Powered by */}
        <PoweredBy theme={theme} />
      </div>
    </div>
  );
}

// ── KPI Grid Widget ────────────────────────────────────────────────

function KpiGridWidget({ data, theme }: { data: EmbedData; theme: Theme }) {
  const ts = THEME_STYLES[theme];
  const title = data.config.title;

  if (data.metrics.length === 0) {
    return <EmptyState theme={theme} message="No data available" />;
  }

  const cols = data.metrics.length <= 2 ? 2 : data.metrics.length <= 4 ? 2 : 3;

  return (
    <div
      style={{ background: ts.bg, minHeight: '100vh' }}
      className="flex flex-col justify-center p-5"
    >
      {title && (
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-4"
          style={{ color: ts.muted }}
        >
          {title}
        </p>
      )}

      <div
        className="gap-3"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
        }}
      >
        {data.metrics.map((m) => (
          <div
            key={m.slug}
            className="rounded-xl p-4"
            style={{
              background: ts.card,
              border: `1px solid ${ts.border}`,
            }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: ts.muted }}
            >
              {METRIC_DISPLAY_NAMES[m.slug] ?? m.slug}
            </p>
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ color: ts.text }}
            >
              {formatMetricValue(m.slug, m.value)}
            </span>
            <div className="mt-1.5">
              <ChangeIndicator changePct={m.changePct} theme={theme} size="sm" />
            </div>
          </div>
        ))}
      </div>

      <PoweredBy theme={theme} />
    </div>
  );
}

// ── Chart Widget ───────────────────────────────────────────────────

function ChartWidget({ data, theme }: { data: EmbedData; theme: Theme }) {
  const ts = THEME_STYLES[theme];
  const title = data.config.title;

  if (data.metrics.length === 0) {
    return <EmptyState theme={theme} message="No data available" />;
  }

  const maxVal = Math.max(...data.metrics.map((m) => m.value), 1);

  // Bar gradient colors
  const barColors = ['#6366f1', '#8b5cf6', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff', '#f3e8ff'];

  return (
    <div
      style={{ background: ts.bg, minHeight: '100vh' }}
      className="flex flex-col justify-center p-5"
    >
      {title && (
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-4"
          style={{ color: ts.muted }}
        >
          {title}
        </p>
      )}

      <div
        className="rounded-2xl p-5"
        style={{
          background: ts.card,
          border: `1px solid ${ts.border}`,
        }}
      >
        <div className="flex items-end gap-3" style={{ height: 140 }}>
          {data.metrics.map((m, i) => {
            const heightPct = Math.max((m.value / maxVal) * 100, 6);
            const barColor = barColors[i % barColors.length]!;

            return (
              <div key={m.slug} className="flex-1 flex flex-col items-center gap-1.5">
                {/* Value label */}
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: ts.text }}
                >
                  {formatMetricValue(m.slug, m.value)}
                </span>

                {/* Bar */}
                <div
                  className="w-full rounded-t-lg transition-all duration-700 ease-out"
                  style={{
                    height: `${heightPct}%`,
                    background: `linear-gradient(to top, ${barColor}, ${barColor}dd)`,
                    minHeight: 4,
                  }}
                />

                {/* Label */}
                <span
                  className="text-[9px] font-medium text-center leading-tight"
                  style={{ color: ts.muted }}
                >
                  {METRIC_DISPLAY_NAMES[m.slug] ?? m.slug}
                </span>
              </div>
            );
          })}
        </div>

        {/* Change indicators row */}
        <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: `1px solid ${ts.border}` }}>
          {data.metrics.map((m) => (
            <div key={m.slug} className="flex-1 text-center">
              <ChangeIndicator changePct={m.changePct} theme={theme} size="sm" />
            </div>
          ))}
        </div>
      </div>

      <PoweredBy theme={theme} />
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────

function EmptyState({ theme, message }: { theme: Theme; message: string }) {
  const ts = THEME_STYLES[theme];

  return (
    <div
      style={{ background: ts.bg, minHeight: '100vh' }}
      className="flex flex-col items-center justify-center gap-2 p-6"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-1"
        style={{ background: ts.accentMuted }}
      >
        <Minus className="h-5 w-5" style={{ color: ts.accent }} />
      </div>
      <p className="text-sm font-medium" style={{ color: ts.muted }}>{message}</p>
    </div>
  );
}

// ── Powered-By Footer ──────────────────────────────────────────────

function PoweredBy({ theme }: { theme: Theme }) {
  const ts = THEME_STYLES[theme];

  return (
    <p
      className="text-[9px] mt-4 text-center tracking-wide"
      style={{ color: ts.muted, opacity: 0.6 }}
    >
      Powered by OppsEra
    </p>
  );
}

// ── Change Indicator ───────────────────────────────────────────────

function ChangeIndicator({
  changePct,
  theme,
  size = 'md',
}: {
  changePct: number | null;
  theme: Theme;
  size?: 'sm' | 'md';
}) {
  if (changePct == null) return null;

  const ts = THEME_STYLES[theme];
  const isPositive = changePct > 0;
  const isNeutral = changePct === 0;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  const color = isNeutral ? ts.muted : isPositive ? '#10b981' : '#ef4444';
  const bgColor = isNeutral
    ? 'transparent'
    : isPositive
      ? 'rgba(16, 185, 129, 0.1)'
      : 'rgba(239, 68, 68, 0.1)';

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${textSize} rounded-full px-1.5 py-0.5`}
      style={{ color, background: bgColor }}
    >
      {isNeutral ? (
        <Minus className={iconSize} />
      ) : isPositive ? (
        <TrendingUp className={iconSize} />
      ) : (
        <TrendingDown className={iconSize} />
      )}
      {formatChangePct(changePct)}
    </span>
  );
}
