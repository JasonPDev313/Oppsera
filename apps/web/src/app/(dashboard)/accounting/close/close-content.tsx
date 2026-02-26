'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { useClosePeriods, useClosePeriod, useCloseMutations } from '@/hooks/use-statements';
import type { ClosePeriod } from '@/types/accounting';

function getLastNPeriods(n: number): string[] {
  const periods: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return periods;
}

const CHECKLIST_ICONS: Record<string, typeof CheckCircle> = {
  pass: CheckCircle,
  fail: XCircle,
  warning: AlertTriangle,
};

const CHECKLIST_COLORS: Record<string, string> = {
  pass: 'text-green-500 bg-green-500/10 border-green-500/30',
  fail: 'text-red-500 bg-red-500/10 border-red-500/30',
  warning: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
};

export default function CloseContent() {
  const timelinePeriods = useMemo(() => getLastNPeriods(12), []);
  const { data: periods } = useClosePeriods();
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    },
  );
  const { data: detail, isLoading: detailLoading } = useClosePeriod(selectedPeriod);
  const { updateCloseStatus, closePeriod, generateRetainedEarnings } = useCloseMutations();

  const [notes, setNotes] = useState('');
  const [showRetainedEarnings, setShowRetainedEarnings] = useState(false);

  // Build a lookup from period string → ClosePeriod
  const periodLookup = useMemo(() => {
    const map: Record<string, ClosePeriod> = {};
    periods.forEach((p) => {
      map[p.postingPeriod] = p;
    });
    return map;
  }, [periods]);

  function getPeriodColor(period: string): string {
    const p = periodLookup[period];
    if (!p) return 'bg-muted border-border text-muted-foreground';
    if (p.status === 'closed') return 'bg-green-500 border-green-600 text-white';
    if (p.status === 'in_review') return 'bg-amber-400 border-amber-500 text-white';
    return 'bg-indigo-500 border-indigo-600 text-white';
  }

  const allChecklistPassed = detail?.checklist
    ? detail.checklist.every((c) => c.status === 'pass' || c.status === 'warning')
    : false;

  const failCount = detail?.checklist?.filter((c) => c.status === 'fail').length ?? 0;

  // Check if selected period is a fiscal year end (December)
  const isFiscalYearEnd = selectedPeriod.endsWith('-12');

  function handleMoveToReview() {
    updateCloseStatus.mutate({ period: selectedPeriod, status: 'in_review', notes });
  }

  function handleClosePeriod() {
    closePeriod.mutate(selectedPeriod);
  }

  function handleGenerateRetainedEarnings() {
    const year = parseInt(selectedPeriod.split('-')[0]!);
    generateRetainedEarnings.mutate({
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    });
    setShowRetainedEarnings(false);
  }

  return (
    <AccountingPageShell
      title="Period Close"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Period Close' },
      ]}
    >
      {/* Period Timeline */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-center gap-1 min-w-max">
          {timelinePeriods.map((period, i) => (
            <div key={period} className="flex items-center">
              <button
                onClick={() => setSelectedPeriod(period)}
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${
                  period === selectedPeriod
                    ? 'ring-2 ring-indigo-300 ring-offset-2 ' + getPeriodColor(period)
                    : getPeriodColor(period)
                }`}
                title={period}
              >
                {period.split('-')[1]}
              </button>
              {i < timelinePeriods.length - 1 && (
                <div className="mx-0.5 h-0.5 w-4 bg-muted" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full bg-green-500" /> Closed
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full bg-amber-400" /> In Review
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full bg-indigo-500" /> Open
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-full bg-muted" /> No Data
          </span>
        </div>
      </div>

      {/* Selected Period Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-foreground">{selectedPeriod}</h2>
        {detail && <StatusBadge status={detail.status} />}
        {detail?.closedAt && (
          <span className="text-sm text-muted-foreground">
            Closed {new Date(detail.closedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Checklist */}
      {detailLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!detailLoading && detail && (
        <div className="space-y-3">
          {detail.checklist.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No checklist items for this period.
            </div>
          )}
          {detail.checklist.map((item, i) => {
            const Icon = CHECKLIST_ICONS[item.status] ?? AlertTriangle;
            const colors = CHECKLIST_COLORS[item.status] ?? CHECKLIST_COLORS.warning;
            return (
              <div
                key={i}
                className={`flex items-start gap-4 rounded-lg border p-4 ${colors}`}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{item.label}</p>
                  {item.detail && (
                    <p className="mt-0.5 text-sm opacity-80">{item.detail}</p>
                  )}
                </div>
                {item.status === 'fail' && (
                  <Link
                    href={getChecklistLink(item.label)}
                    className="shrink-0 flex items-center gap-1 text-sm font-medium underline"
                  >
                    Fix <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Notes + Actions */}
      {!detailLoading && detail && detail.status !== 'closed' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Close Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes for this period close..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {detail.status === 'open' && (
              <button
                onClick={handleMoveToReview}
                disabled={updateCloseStatus.isPending}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {updateCloseStatus.isPending ? 'Updating...' : 'Move to Review'}
              </button>
            )}
            {(detail.status === 'open' || detail.status === 'in_review') && (
              <button
                onClick={handleClosePeriod}
                disabled={!allChecklistPassed || closePeriod.isPending}
                title={
                  !allChecklistPassed
                    ? `${failCount} checklist item${failCount !== 1 ? 's' : ''} must pass before closing`
                    : undefined
                }
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Lock className="h-4 w-4" />
                {closePeriod.isPending ? 'Closing...' : 'Close Period'}
              </button>
            )}
            {isFiscalYearEnd && (
              <button
                onClick={() => setShowRetainedEarnings(true)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                <FileText className="h-4 w-4" />
                Generate Retained Earnings
              </button>
            )}
          </div>
        </div>
      )}

      {/* Closed period info */}
      {!detailLoading && detail && detail.status === 'closed' && (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-500">
          <Lock className="h-5 w-5 shrink-0 text-green-500" />
          <span>
            This period is closed and locked.
            {detail.notes && <> Notes: {detail.notes}</>}
          </span>
        </div>
      )}

      {/* Retained Earnings Confirmation Dialog */}
      {showRetainedEarnings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Generate Retained Earnings</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will create a journal entry transferring the current year&apos;s net income (P&L)
              into the Retained Earnings equity account. This is typically done as part of fiscal year-end close.
            </p>
            <p className="mt-2 text-sm font-medium text-amber-500">
              This action is idempotent — running it again will not create duplicate entries.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowRetainedEarnings(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateRetainedEarnings}
                disabled={generateRetainedEarnings.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {generateRetainedEarnings.isPending ? 'Generating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}

function getChecklistLink(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('draft')) return '/accounting/journals?status=draft';
  if (lower.includes('unmapped')) return '/accounting/mappings';
  if (lower.includes('ap')) return '/ap/reports/aging';
  if (lower.includes('ar')) return '/ar/reports/aging';
  if (lower.includes('trial')) return '/accounting/reports/trial-balance';
  if (lower.includes('inventory')) return '/inventory';
  if (lower.includes('drawer')) return '/operations/close-dashboard';
  if (lower.includes('retail close')) return '/operations/close-dashboard';
  if (lower.includes('f&b close')) return '/close-batch';
  if (lower.includes('tip')) return '/accounting/tip-payouts';
  if (lower.includes('deposit')) return '/accounting/deposits';
  if (lower.includes('dead letter')) return '/accounting';
  if (lower.includes('settlement')) return '/accounting/settlements';
  if (lower.includes('cogs')) return '/accounting/cogs';
  if (lower.includes('breakage')) return '/accounting/breakage';
  return '/accounting';
}
