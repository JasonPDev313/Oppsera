'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import { useGlReadiness } from '@/hooks/use-gl-readiness';
import type { GlReadinessStatus, BackfillProgress } from '@/hooks/use-gl-readiness';

/**
 * GLReadinessBanner
 *
 * Automatically detects unposted tenders, backfills GL entries,
 * and applies smart mapping resolutions — all without user intervention.
 * Shows progress and results inline on accounting pages.
 *
 * Place this AFTER the bootstrap guard and BEFORE KPI cards.
 */
export function GLReadinessBanner() {
  const {
    status,
    gaps,
    backfillResult,
    progress,
    triggerBackfill,
    dismiss,
    isBackfilling,
  } = useGlReadiness();

  const [visible, setVisible] = useState(true);

  // Auto-dismiss "ready" after 4 seconds on first sync
  useEffect(() => {
    if (status === 'ready' && backfillResult && backfillResult.backfill.posted > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        dismiss();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [status, backfillResult, dismiss]);

  // Don't render anything for loading, dismissed, or already-ready states
  if (status === 'loading' || status === 'dismissed') return null;
  if (status === 'ready' && !backfillResult) return null;
  if (status === 'ready' && !visible) return null;

  return (
    <div className={`rounded-lg border transition-all ${getBannerStyles(status)}`}>
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <BannerIcon status={status} />
        <BannerMessage
          status={status}
          gaps={gaps}
          backfillResult={backfillResult}
          progress={progress}
        />
        <div className="ml-auto flex items-center gap-2">
          {status === 'error' && (
            <button
              onClick={triggerBackfill}
              disabled={isBackfilling}
              className="flex items-center gap-1.5 rounded-md border border-current/20 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-red-500/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
          {status === 'needs_review' && (
            <Link
              href="/accounting/mappings"
              className="flex items-center gap-1.5 rounded-md border border-current/20 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-amber-500/10"
            >
              Review mappings
            </Link>
          )}
          {(status === 'ready' || status === 'needs_review') && (
            <button
              onClick={() => {
                setVisible(false);
                dismiss();
              }}
              className="rounded p-0.5 transition-colors hover:bg-surface"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {/* Progress bar during syncing (Fix 3) */}
      {status === 'syncing' && progress && progress.totalUnposted > 0 && (
        <div className="px-4 pb-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-500/20">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
              style={{
                width: `${Math.min(100, Math.round((progress.processedSoFar / progress.totalUnposted) * 100))}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] opacity-70">
            <span>
              {progress.processedSoFar.toLocaleString()} / {progress.totalUnposted.toLocaleString()}
              {progress.currentBatch > 1 && ` (batch ${progress.currentBatch})`}
            </span>
            <span>
              {Math.round((progress.processedSoFar / progress.totalUnposted) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function getBannerStyles(status: GlReadinessStatus): string {
  switch (status) {
    case 'syncing':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-500';
    case 'ready':
      return 'border-green-500/30 bg-green-500/10 text-green-500';
    case 'needs_review':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
    case 'error':
      return 'border-red-500/30 bg-red-500/10 text-red-500';
    default:
      return 'border-border bg-surface text-muted-foreground';
  }
}

function BannerIcon({ status }: { status: GlReadinessStatus }) {
  switch (status) {
    case 'syncing':
      return <Loader2 className="h-5 w-5 shrink-0 animate-spin" />;
    case 'ready':
      return <CheckCircle className="h-5 w-5 shrink-0" />;
    case 'needs_review':
      return <AlertTriangle className="h-5 w-5 shrink-0" />;
    case 'error':
      return <XCircle className="h-5 w-5 shrink-0" />;
    default:
      return null;
  }
}

function BannerMessage({
  status,
  gaps,
  backfillResult,
  progress,
}: {
  status: GlReadinessStatus;
  gaps: { totalTenders: number; tendersWithoutGl: number; unmappedEventCount: number; autoResolvableCount: number } | null;
  backfillResult: { backfill: { posted: number; skipped: number; errors: number }; autoResolved: { applied: number; remaining: number }; isFullyCovered: boolean } | null;
  progress: BackfillProgress | null;
}) {
  switch (status) {
    case 'syncing':
      return (
        <span>
          Syncing{' '}
          {progress
            ? <><strong>{progress.totalUnposted.toLocaleString()}</strong> sales transaction{progress.totalUnposted !== 1 ? 's' : ''}</>
            : gaps?.tendersWithoutGl
              ? <><strong>{gaps.tendersWithoutGl.toLocaleString()}</strong> sales transaction{gaps.tendersWithoutGl !== 1 ? 's' : ''}</>
              : 'sales history'}{' '}
          to your general ledger...
        </span>
      );

    case 'ready':
      if (backfillResult && backfillResult.backfill.posted > 0) {
        const parts: string[] = [];
        parts.push(`${backfillResult.backfill.posted.toLocaleString()} transaction${backfillResult.backfill.posted !== 1 ? 's' : ''} synced to GL`);
        if (backfillResult.autoResolved.applied > 0) {
          parts.push(`${backfillResult.autoResolved.applied} mapping${backfillResult.autoResolved.applied !== 1 ? 's' : ''} auto-resolved`);
        }
        return <span>{parts.join(' · ')}</span>;
      }
      return <span>All sales history synced to GL</span>;

    case 'needs_review':
      if (backfillResult) {
        const parts: string[] = [];
        if (backfillResult.backfill.posted > 0) {
          parts.push(`${backfillResult.backfill.posted.toLocaleString()} synced`);
        }
        if (backfillResult.autoResolved.applied > 0) {
          parts.push(`${backfillResult.autoResolved.applied} auto-resolved`);
        }
        parts.push(
          `${backfillResult.autoResolved.remaining} transaction${backfillResult.autoResolved.remaining !== 1 ? 's' : ''} need GL mapping review`,
        );
        return <span>{parts.join(' · ')}</span>;
      }
      return (
        <span>
          <strong>{gaps?.unmappedEventCount ?? 0}</strong> transaction{(gaps?.unmappedEventCount ?? 0) !== 1 ? 's' : ''} need GL mapping review
          {(gaps?.autoResolvableCount ?? 0) > 0 && (
            <> ({gaps?.autoResolvableCount} can be auto-resolved)</>
          )}
        </span>
      );

    case 'error':
      if (backfillResult) {
        return (
          <span>
            GL sync encountered errors. {backfillResult.backfill.posted.toLocaleString()} of{' '}
            {(backfillResult.backfill.posted + backfillResult.backfill.errors).toLocaleString()} synced successfully.
          </span>
        );
      }
      return <span>GL readiness check failed. Click retry to try again.</span>;

    default:
      return null;
  }
}
