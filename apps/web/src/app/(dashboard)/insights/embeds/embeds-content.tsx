'use client';

import Link from 'next/link';
import { ArrowLeft, Code } from 'lucide-react';
import { useEmbedWidgets } from '@/hooks/use-embed-widgets';
import { EmbeddableWidget } from '@/components/insights/EmbeddableWidget';

// ── EmbedsContent ─────────────────────────────────────────────────

export default function EmbedsContent() {
  const { tokens, createToken, revokeToken, isLoading, error } = useEmbedWidgets();

  // Map hook data to the shape EmbeddableWidget expects
  const widgets = tokens.map((t) => ({
    id: t.id,
    token: t.token,
    widgetType: t.widgetType,
    config: t.config as Record<string, unknown>,
    viewCount: t.viewCount,
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
          <Code className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Embeddable Widgets</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage embeddable AI insight widgets for external sites
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
      {!isLoading && !error && tokens.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Code className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No embed widgets</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Create embeddable widgets to display AI-powered metrics and charts on external dashboards.
          </p>
        </div>
      )}

      {/* Widgets panel */}
      {!isLoading && !error && widgets.length > 0 && (
        <EmbeddableWidget
          widgets={widgets}
          onCreateWidget={(config) => {
            createToken({
              widgetType: config.widgetType as 'metric_card' | 'chart' | 'kpi_grid' | 'chat',
              config: {
                metricSlugs: [config.metricSlug],
                theme: config.style,
              },
            });
          }}
          onDeleteWidget={revokeToken}
        />
      )}
    </div>
  );
}
