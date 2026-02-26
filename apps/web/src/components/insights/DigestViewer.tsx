'use client';

import { useState, useMemo } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Clock, Loader2 } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

export interface Digest {
  id: string;
  type: string;
  generatedAt: string;
  narrative: string;
  kpis: { label: string; value: number; delta: number; format: string }[];
  sections: { type: string; content: string }[];
}

interface DigestViewerProps {
  digests: Digest[];
  onRefresh: () => void;
  isLoading?: boolean;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  daily: { label: 'Daily', color: 'bg-blue-500/10 text-blue-500' },
  weekly: { label: 'Weekly', color: 'bg-violet-500/10 text-violet-500' },
  monthly: { label: 'Monthly', color: 'bg-amber-500/10 text-amber-500' },
};

const TYPES_FOR_FILTER = ['all', 'daily', 'weekly', 'monthly'] as const;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// ── Helpers ────────────────────────────────────────────────────────

function formatKpiValue(value: number, format: string): string {
  switch (format) {
    case 'currency':
      return currencyFormatter.format(value);
    case 'percent':
      return percentFormatter.format(value > 1 ? value / 100 : value);
    case 'number':
    default:
      return numberFormatter.format(value);
  }
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Component ──────────────────────────────────────────────────────

export function DigestViewer({
  digests,
  onRefresh,
  isLoading,
  className,
}: DigestViewerProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (filterType === 'all') return digests;
    return digests.filter((d) => d.type === filterType);
  }, [digests, filterType]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Business Digests</h3>
        <div className="flex items-center gap-2">
          {/* Type filter */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            {TYPES_FOR_FILTER.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  filterType === type
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {type === 'all' ? 'All' : TYPE_LABELS[type]?.label ?? type}
              </button>
            ))}
          </div>

          {/* Generate now */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-gray-200/50 rounded-md transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Generate Now
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="divide-y divide-border">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Clock className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No digests yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click &ldquo;Generate Now&rdquo; to create your first digest
            </p>
          </div>
        )}

        {filtered.map((digest) => {
          const isExpanded = expandedIds.has(digest.id);
          const typeConfig = TYPE_LABELS[digest.type] ?? { label: digest.type, color: 'bg-muted text-muted-foreground' };

          return (
            <div key={digest.id} className="px-4 py-3">
              {/* Digest header */}
              <button
                type="button"
                onClick={() => toggleExpanded(digest.id)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${typeConfig.color}`}>
                    {typeConfig.label}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDateTime(digest.generatedAt)}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="mt-3 space-y-3">
                  {/* KPI summary row */}
                  {digest.kpis.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {digest.kpis.map((kpi, idx) => (
                        <div key={idx} className="flex-1 min-w-[120px] rounded-md bg-muted/30 p-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">
                            {formatKpiValue(kpi.value, kpi.format)}
                          </p>
                          {kpi.delta !== 0 && (
                            <p className={`text-[10px] font-medium ${kpi.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {kpi.delta >= 0 ? '+' : ''}{kpi.delta.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Narrative */}
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {digest.narrative}
                  </div>

                  {/* Sections */}
                  {digest.sections.map((section, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-foreground">{section.type}: </span>
                      {section.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
