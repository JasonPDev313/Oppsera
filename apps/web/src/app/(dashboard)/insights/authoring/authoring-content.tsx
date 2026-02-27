'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Database, BarChart3, GitBranch } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

import { SemanticAuthoringPanel } from '@/components/insights/SemanticAuthoringPanel';
import type { MetricDef, DimensionDef } from '@/components/insights/SemanticAuthoringPanel';

// ── API response types ────────────────────────────────────────────

interface MetricApiItem {
  slug: string;
  displayName: string;
  description: string;
  sqlExpression: string;
  aggregation: string;
  format: string;
  isSystem: boolean;
}

interface DimensionApiItem {
  slug: string;
  displayName: string;
  description: string;
  sqlExpression: string;
  isSystem: boolean;
}

// ── AuthoringContent ──────────────────────────────────────────────

export default function AuthoringContent({ embedded }: { embedded?: boolean }) {
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [dimensions, setDimensions] = useState<DimensionDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch metrics + dimensions on mount ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [metricsRes, dimensionsRes] = await Promise.all([
          apiFetch<{ data: MetricApiItem[] }>('/api/v1/semantic/metrics'),
          apiFetch<{ data: DimensionApiItem[] }>('/api/v1/semantic/dimensions'),
        ]);

        if (cancelled) return;

        setMetrics(
          metricsRes.data.map((m) => ({
            slug: m.slug,
            displayName: m.displayName,
            description: m.description,
            sqlExpression: m.sqlExpression,
            aggregation: m.aggregation,
            format: m.format,
            isSystem: m.isSystem,
          })),
        );

        setDimensions(
          dimensionsRes.data.map((d) => ({
            slug: d.slug,
            displayName: d.displayName,
            description: d.description,
            sqlExpression: d.sqlExpression,
            isSystem: d.isSystem,
          })),
        );

        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load semantic definitions');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ── Save handlers ──
  const handleSaveMetric = useCallback(
    async (m: Omit<MetricDef, 'isSystem'>) => {
      try {
        await apiFetch('/api/v1/semantic/metrics', {
          method: 'POST',
          body: JSON.stringify(m),
        });
        // Optimistic add
        setMetrics((prev) => {
          const existing = prev.findIndex((pm) => pm.slug === m.slug);
          const newMetric = { ...m, isSystem: false };
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = newMetric;
            return updated;
          }
          return [...prev, newMetric];
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save metric');
      }
    },
    [],
  );

  const handleSaveDimension = useCallback(
    async (d: Omit<DimensionDef, 'isSystem'>) => {
      try {
        await apiFetch('/api/v1/semantic/dimensions', {
          method: 'POST',
          body: JSON.stringify(d),
        });
        // Optimistic add
        setDimensions((prev) => {
          const existing = prev.findIndex((pd) => pd.slug === d.slug);
          const newDim = { ...d, isSystem: false };
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = newDim;
            return updated;
          }
          return [...prev, newDim];
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save dimension');
      }
    },
    [],
  );

  const handleDeleteMetric = useCallback(async (slug: string) => {
    try {
      await apiFetch(`/api/v1/semantic/metrics/${slug}`, { method: 'DELETE' });
      setMetrics((prev) => prev.filter((m) => m.slug !== slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete metric');
    }
  }, []);

  const handleDeleteDimension = useCallback(async (slug: string) => {
    try {
      await apiFetch(`/api/v1/semantic/dimensions/${slug}`, { method: 'DELETE' });
      setDimensions((prev) => prev.filter((d) => d.slug !== slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete dimension');
    }
  }, []);

  const handleTestExpression = useCallback(
    async (sql: string): Promise<Record<string, unknown>[]> => {
      const res = await apiFetch<{ data: { rows: Record<string, unknown>[] } }>(
        '/api/v1/semantic/test-sql',
        {
          method: 'POST',
          body: JSON.stringify({ rawSql: sql, limit: 5 }),
        },
      );
      return res.data.rows;
    },
    [],
  );

  return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto'}>
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
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Semantic Authoring</h1>
              <p className="text-sm text-muted-foreground">
                Define custom metrics and dimensions for your AI semantic layer
              </p>
            </div>
          </div>
        </>
      )}

      {/* Concept cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <h3 className="text-xs font-semibold text-foreground">Metrics</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A metric is a <strong className="text-foreground">measurable value</strong> like total sales, order count, or average ticket size.
            Metrics use SQL aggregation functions (SUM, COUNT, AVG) to compute a single number from your data.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <GitBranch className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <h3 className="text-xs font-semibold text-foreground">Dimensions</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A dimension is a <strong className="text-foreground">grouping axis</strong> like location, date, category, or payment method.
            Dimensions let you break down metrics by different attributes to find patterns and trends.
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
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500 mb-4">
          {error}
        </div>
      )}

      {/* Authoring panel */}
      {!isLoading && (
        <SemanticAuthoringPanel
          metrics={metrics}
          dimensions={dimensions}
          onSaveMetric={handleSaveMetric}
          onSaveDimension={handleSaveDimension}
          onDeleteMetric={handleDeleteMetric}
          onDeleteDimension={handleDeleteDimension}
          onTestExpression={handleTestExpression}
        />
      )}
    </div>
  );
}
