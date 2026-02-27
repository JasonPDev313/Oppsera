'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowLeft, Plus, Search, X, Pin } from 'lucide-react';
import { usePinnedMetrics } from '@/hooks/use-pinned-metrics';
import { WatchlistPanel } from '@/components/insights/WatchlistPanel';
import { apiFetch } from '@/lib/api-client';


// ── Registry metric shape ─────────────────────────────────────────

interface RegistryMetric {
  slug: string;
  displayName: string;
  description: string;
  domain: string;
  category: string;
  dataType: string;
  formatPattern: string | null;
  unit: string | null;
}

// ── Fallback metrics when registry is empty or unavailable ────────

const FALLBACK_METRICS: RegistryMetric[] = [
  { slug: 'net_sales', displayName: 'Net Sales', description: 'Total sales minus voids and discounts', domain: 'Sales', category: 'revenue', dataType: 'currency', formatPattern: '$0,0.00', unit: 'dollars' },
  { slug: 'gross_sales', displayName: 'Gross Sales', description: 'Total sales before adjustments', domain: 'Sales', category: 'revenue', dataType: 'currency', formatPattern: '$0,0.00', unit: 'dollars' },
  { slug: 'order_count', displayName: 'Order Count', description: 'Number of orders placed', domain: 'Sales', category: 'volume', dataType: 'integer', formatPattern: '0,0', unit: null },
  { slug: 'avg_order_value', displayName: 'Avg Order Value', description: 'Average revenue per order', domain: 'Sales', category: 'revenue', dataType: 'currency', formatPattern: '$0,0.00', unit: 'dollars' },
  { slug: 'discount_total', displayName: 'Discount Total', description: 'Total discounts applied', domain: 'Sales', category: 'revenue', dataType: 'currency', formatPattern: '$0,0.00', unit: 'dollars' },
  { slug: 'tax_total', displayName: 'Tax Total', description: 'Total tax collected', domain: 'Sales', category: 'tax', dataType: 'currency', formatPattern: '$0,0.00', unit: 'dollars' },
  { slug: 'void_count', displayName: 'Void Count', description: 'Number of voided orders', domain: 'Operations', category: 'volume', dataType: 'integer', formatPattern: '0,0', unit: null },
  { slug: 'void_total', displayName: 'Void Total', description: 'Total value of voided orders', domain: 'Operations', category: 'revenue', dataType: 'currency', formatPattern: '$0,0.00', unit: 'dollars' },
  { slug: 'tender_cash', displayName: 'Cash Tenders', description: 'Total cash payments received', domain: 'Payments', category: 'payments', dataType: 'currency', formatPattern: '$0,0.00', unit: 'dollars' },
  { slug: 'tender_card', displayName: 'Card Tenders', description: 'Total card payments received', domain: 'Payments', category: 'payments', dataType: 'currency', formatPattern: '$0,0.00', unit: 'dollars' },
];

// ── Add Metric Dialog ─────────────────────────────────────────────

function AddMetricDialog({
  open,
  onClose,
  onPin,
  pinnedSlugs,
}: {
  open: boolean;
  onClose: () => void;
  onPin: (slug: string, displayName: string, format: 'currency' | 'number' | 'percent') => Promise<void>;
  pinnedSlugs: Set<string>;
}) {
  const [registryMetrics, setRegistryMetrics] = useState<RegistryMetric[]>([]);
  const [isLoadingRegistry, setIsLoadingRegistry] = useState(false);
  const [search, setSearch] = useState('');
  const [pinningSlug, setPinningSlug] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch registry on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setIsLoadingRegistry(true);
      try {
        const res = await apiFetch<{ data: RegistryMetric[] }>('/api/v1/semantic/metrics');
        if (!cancelled) setRegistryMetrics(res.data.length > 0 ? res.data : FALLBACK_METRICS);
      } catch {
        if (!cancelled) setRegistryMetrics(FALLBACK_METRICS);
      } finally {
        if (!cancelled) setIsLoadingRegistry(false);
      }
    }

    load();
    // Auto-focus search
    setTimeout(() => searchRef.current?.focus(), 100);

    return () => { cancelled = true; };
  }, [open]);

  const handlePin = useCallback(async (metric: RegistryMetric) => {
    setPinningSlug(metric.slug);
    const format = inferFormat(metric);
    try {
      await onPin(metric.slug, metric.displayName, format);
    } finally {
      setPinningSlug(null);
    }
  }, [onPin]);

  if (!open) return null;

  const filtered = registryMetrics.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.slug.toLowerCase().includes(q) ||
      m.displayName.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.domain.toLowerCase().includes(q)
    );
  });

  // Group by domain
  const grouped = new Map<string, RegistryMetric[]>();
  for (const m of filtered) {
    const group = grouped.get(m.domain) ?? [];
    group.push(m);
    grouped.set(m.domain, group);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] bg-surface border border-border rounded-2xl shadow-xl flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-foreground">Add Metric to Watchlist</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search metrics..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        {/* Metric list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isLoadingRegistry && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          )}

          {!isLoadingRegistry && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? 'No metrics match your search' : 'No metrics available'}
            </p>
          )}

          {!isLoadingRegistry && Array.from(grouped.entries()).map(([domain, metrics]) => (
            <div key={domain} className="mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                {domain}
              </p>
              <div className="space-y-1">
                {metrics.map((m) => {
                  const isPinned = pinnedSlugs.has(m.slug);
                  const isPinning = pinningSlug === m.slug;

                  return (
                    <div
                      key={m.slug}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                      <div className="min-w-0 mr-3">
                        <p className="text-sm font-medium text-foreground truncate">
                          {m.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.description}
                        </p>
                      </div>
                      {isPinned ? (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-500 bg-emerald-500/10 rounded-full">
                          <Pin className="h-3 w-3" />
                          Pinned
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePin(m)}
                          disabled={isPinning}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 rounded-full hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          <Plus className="h-3 w-3" />
                          {isPinning ? 'Adding...' : 'Pin'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function inferFormat(metric: RegistryMetric): 'currency' | 'number' | 'percent' {
  if (metric.unit === 'dollars' || metric.unit === 'USD' || metric.formatPattern?.includes('$')) {
    return 'currency';
  }
  if (metric.unit === 'percent' || metric.unit === '%' || metric.formatPattern?.includes('%')) {
    return 'percent';
  }
  return 'number';
}

// ── WatchlistContent ──────────────────────────────────────────────

export default function WatchlistContent({ embedded }: { embedded?: boolean }) {
  const { metrics, pin, unpin, reorder, isLoading, error, refresh } = usePinnedMetrics();
  const [dialogOpen, setDialogOpen] = useState(false);

  const pinnedSlugs = new Set(metrics.map((m) => m.metricSlug));

  const handlePin = useCallback(async (slug: string, displayName: string, format: 'currency' | 'number' | 'percent') => {
    await pin({ metricSlug: slug, displayName, config: { format } });
    // Refresh to enrich the new metric with sparkline data
    refresh();
  }, [pin, refresh]);

  return (
    <div className={embedded ? '' : 'max-w-4xl mx-auto'}>
      {!embedded && (
        <>
          <Link
            href="/insights"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Chat
          </Link>

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Metric Watchlist</h1>
                <p className="text-sm text-muted-foreground">
                  Pinned metrics with sparkline trends
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Metric
            </button>
          </div>
        </>
      )}

      {/* Embedded mode add button */}
      {embedded && (
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Metric
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {!isLoading && !error && metrics.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mb-3">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground mb-1">No pinned metrics</h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-3">
            Pin your most important KPIs to track trends at a glance with sparkline charts.
          </p>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Browse Metrics
          </button>
        </div>
      )}

      {!isLoading && !error && metrics.length > 0 && (
        <WatchlistPanel
          pinnedMetrics={metrics}
          onUnpin={unpin}
          onReorder={reorder}
        />
      )}

      <AddMetricDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onPin={handlePin}
        pinnedSlugs={pinnedSlugs}
      />
    </div>
  );
}
