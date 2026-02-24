'use client';

import Link from 'next/link';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { usePinnedMetrics } from '@/hooks/use-pinned-metrics';
import { WatchlistPanel } from '@/components/insights/WatchlistPanel';

// ── WatchlistContent ──────────────────────────────────────────────

export default function WatchlistContent() {
  const { metrics, unpin, reorder, isLoading, error } = usePinnedMetrics();

  // Map hook data to the shape WatchlistPanel expects
  const panelMetrics = metrics.map((m) => ({
    id: m.id,
    metricSlug: m.metricSlug,
    displayName: m.displayName,
    currentValue: m.currentValue ?? 0,
    previousValue: m.previousValue ?? 0,
    changePct: m.changePercent ?? 0,
    sparklineData: m.sparklineValues ?? [],
    format: m.config?.format ?? 'number',
  }));

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        href="/insights"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Chat
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
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

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && metrics.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No pinned metrics</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Pin metrics from your AI Insights conversations to track them here with sparkline trends.
          </p>
        </div>
      )}

      {/* Watchlist */}
      {!isLoading && !error && panelMetrics.length > 0 && (
        <WatchlistPanel
          pinnedMetrics={panelMetrics}
          onUnpin={unpin}
          onReorder={reorder}
        />
      )}
    </div>
  );
}
