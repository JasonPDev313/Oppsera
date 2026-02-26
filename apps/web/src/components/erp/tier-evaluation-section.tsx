'use client';

import { useState, useCallback } from 'react';
import { Loader2, TrendingUp, ArrowRight } from 'lucide-react';
import { TIER_THRESHOLDS } from '@oppsera/shared';
import type { BusinessTier } from '@oppsera/shared';
import type { TierEvaluationResult } from '@/hooks/use-erp-config';
import { TierBadge } from './tier-badge';

interface TierEvaluationSectionProps {
  currentTier: string;
  tierOverride: boolean;
  tierLastEvaluatedAt: string | null;
  onEvaluate: () => Promise<TierEvaluationResult>;
  isEvaluating: boolean;
  onRequestChange: (evaluation: TierEvaluationResult) => void;
}

/** Maps tier → the next tier up for progress bar context */
const NEXT_TIER: Record<string, BusinessTier | null> = {
  SMB: 'MID_MARKET',
  MID_MARKET: 'ENTERPRISE',
  ENTERPRISE: null,
};

interface MetricProgress {
  label: string;
  current: number;
  threshold: number;
  format: (v: number) => string;
}

function getProgressMetrics(
  metrics: TierEvaluationResult['metrics'],
  nextTier: BusinessTier | null,
): MetricProgress[] {
  if (!nextTier) {
    // Enterprise — show metrics without thresholds
    return [
      { label: 'Annual Revenue', current: metrics.annualRevenue, threshold: 0, format: formatDollars },
      { label: 'Locations', current: metrics.locationCount, threshold: 0, format: formatInt },
      { label: 'Users', current: metrics.userCount, threshold: 0, format: formatInt },
      { label: 'GL Accounts', current: metrics.glAccountCount, threshold: 0, format: formatInt },
    ];
  }

  const t = TIER_THRESHOLDS[nextTier];
  return [
    { label: 'Annual Revenue', current: metrics.annualRevenue, threshold: t.annualRevenue, format: formatDollars },
    { label: 'Locations', current: metrics.locationCount, threshold: t.locationCount, format: formatInt },
    { label: 'Users', current: metrics.userCount, threshold: t.userCount, format: formatInt },
    { label: 'GL Accounts', current: metrics.glAccountCount, threshold: t.glAccountCount, format: formatInt },
  ];
}

function formatDollars(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function formatInt(v: number): string {
  return v.toLocaleString();
}

function ProgressBar({ current, threshold }: { current: number; threshold: number }) {
  if (threshold === 0) return null;
  const pct = Math.min(100, Math.round((current / threshold) * 100));

  return (
    <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MetricProgressCard({ metric }: { metric: MetricProgress }) {
  const pct = metric.threshold > 0 ? Math.min(100, Math.round((metric.current / metric.threshold) * 100)) : null;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">{metric.label}</p>
        {pct !== null && (
          <span className={`text-xs font-medium ${pct >= 100 ? 'text-green-500' : 'text-muted-foreground'}`}>
            {pct}%
          </span>
        )}
      </div>
      <p className="mt-1 text-lg font-semibold text-foreground">{metric.format(metric.current)}</p>
      {metric.threshold > 0 && (
        <>
          <p className="text-xs text-muted-foreground">of {metric.format(metric.threshold)}</p>
          <ProgressBar current={metric.current} threshold={metric.threshold} />
        </>
      )}
    </div>
  );
}

export function TierEvaluationSection({
  currentTier,
  tierOverride,
  tierLastEvaluatedAt,
  onEvaluate,
  isEvaluating,
  onRequestChange,
}: TierEvaluationSectionProps) {
  const [evaluation, setEvaluation] = useState<TierEvaluationResult | null>(null);

  const handleEvaluate = useCallback(async () => {
    const result = await onEvaluate();
    setEvaluation(result);
  }, [onEvaluate]);

  const nextTier = NEXT_TIER[currentTier] ?? null;

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Tier Evaluation</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {nextTier
              ? `Check if your business metrics qualify for ${nextTier === 'MID_MARKET' ? 'Mid-Market' : 'Enterprise'}.`
              : 'You are on the highest tier.'}
          </p>
          {tierLastEvaluatedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Last evaluated: {new Date(tierLastEvaluatedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleEvaluate}
          disabled={isEvaluating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isEvaluating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TrendingUp className="h-4 w-4" />
          )}
          Evaluate
        </button>
      </div>

      {tierOverride && (
        <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
          <p className="text-xs text-amber-500">
            Your tier was manually overridden. Evaluation will show the recommended tier but won&apos;t auto-apply.
          </p>
        </div>
      )}

      {evaluation && (
        <div className="mt-5 space-y-4">
          {/* Metrics Grid with Progress */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {getProgressMetrics(evaluation.metrics, nextTier).map((m) => (
              <MetricProgressCard key={m.label} metric={m} />
            ))}
          </div>

          {/* Recommendation */}
          <div
            className={`rounded-lg p-4 ${
              evaluation.shouldUpgrade
                ? 'bg-blue-500/10 border border-blue-500/30'
                : 'bg-green-500/10 border border-green-500/30'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-foreground">Recommended:</span>
              <TierBadge tier={evaluation.recommendedTier} size="lg" />

              {evaluation.shouldUpgrade ? (
                <button
                  type="button"
                  onClick={() => onRequestChange(evaluation)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Change Tier
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <span className="ml-auto text-sm text-green-500">No change needed</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
