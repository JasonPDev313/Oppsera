'use client';

import Link from 'next/link';
import { ArrowLeft, Code, Globe, CreditCard } from 'lucide-react';
import { useEmbedWidgets } from '@/hooks/use-embed-widgets';
import { EmbeddableWidget } from '@/components/insights/EmbeddableWidget';


// ── EmbedsContent ─────────────────────────────────────────────────

export default function EmbedsContent({ embedded }: { embedded?: boolean }) {
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
    <div className={embedded ? '' : 'max-w-4xl mx-auto'}>
      {!embedded && (
        <>
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

          {/* How it works — collapsed by default in embedded mode */}
          <div className="rounded-xl border border-border bg-surface p-4 mb-6">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
              How It Works
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <HowItWorksStep
                step={1}
                icon={CreditCard}
                title="Create a Widget"
                description="Choose a metric, widget type, and theme"
              />
              <HowItWorksStep
                step={2}
                icon={Code}
                title="Copy Embed Code"
                description="Get an iframe snippet for your site"
              />
              <HowItWorksStep
                step={3}
                icon={Globe}
                title="Embed Anywhere"
                description="Paste into any HTML page or dashboard"
              />
            </div>
          </div>
        </>
      )}

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

      {/* Widgets panel — always render so Create button is accessible */}
      {!isLoading && !error && (
        <EmbeddableWidget
          widgets={widgets}
          onCreateWidget={(config) => {
            createToken({
              widgetType: config.widgetType as 'metric_card' | 'chart' | 'kpi_grid' | 'chat',
              config: {
                metricSlugs: [config.metricSlug],
                title: config.title,
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

// ── How It Works Step ──────────────────────────────────────────────

function HowItWorksStep({
  step,
  icon: Icon,
  title,
  description,
}: {
  step: number;
  icon: typeof Code;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-primary">{step}</span>
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
