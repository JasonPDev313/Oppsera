'use client';

import { useState, useCallback } from 'react';
import {
  Target,
  TrendingUp,
  ArrowRightLeft,
  AlertCircle,
  Clock,
  RefreshCw,
  History,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useMinimumProgress,
  useMinimumHistory,
  useMinimumMutations,
  useMinimumPolicies,
} from '@/hooks/use-membership';
import type { MinimumProgressEntry, MinimumHistoryEntry } from '@/types/membership';

// ── Helpers ─────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function trafficLightColor(percent: number): {
  bg: string;
  fill: string;
  text: string;
  label: string;
} {
  if (percent >= 100) {
    return {
      bg: 'bg-green-500/20',
      fill: 'bg-green-500/100',
      text: 'text-green-500',
      label: 'Met',
    };
  }
  if (percent >= 50) {
    return {
      bg: 'bg-amber-500/20',
      fill: 'bg-amber-500/100',
      text: 'text-amber-500',
      label: 'At Risk',
    };
  }
  return {
    bg: 'bg-red-500/20',
    fill: 'bg-red-500/100',
    text: 'text-red-500',
    label: 'Below',
  };
}

// ── Progress Card ───────────────────────────────────────────────

function ProgressCard({ entry }: { entry: MinimumProgressEntry }) {
  const colors = trafficLightColor(entry.progressPercent);
  const cappedPercent = Math.min(entry.progressPercent, 100);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-medium text-foreground">
            Rule: {entry.ruleId.slice(0, 8)}...
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              entry.status === 'open'
                ? 'neutral'
                : entry.status === 'closed'
                  ? 'success'
                  : 'warning'
            }
          >
            {entry.status}
          </Badge>
          <Badge variant={entry.isMetMinimum ? 'success' : 'warning'}>
            {colors.label}
          </Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className={`font-semibold ${colors.text}`}>
            {entry.progressPercent}%
          </span>
        </div>
        <div className={`h-3 w-full overflow-hidden rounded-full ${colors.bg}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.fill}`}
            style={{ width: `${cappedPercent}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Required</div>
          <div className="text-sm font-medium text-foreground">
            {formatMoney(entry.requiredCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Spent</div>
          <div className="text-sm font-medium text-foreground">
            {formatMoney(entry.satisfiedCents)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Shortfall</div>
          <div className={`text-sm font-medium ${entry.shortfallCents > 0 ? 'text-red-500' : 'text-green-500'}`}>
            {entry.shortfallCents > 0 ? formatMoney(entry.shortfallCents) : '$0.00'}
          </div>
        </div>
        {entry.rolloverInCents > 0 && (
          <div>
            <div className="text-xs text-muted-foreground">Rollover In</div>
            <div className="flex items-center gap-1 text-sm text-foreground">
              <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
              {formatMoney(entry.rolloverInCents)}
            </div>
          </div>
        )}
        {entry.rolloverOutCents > 0 && (
          <div>
            <div className="text-xs text-muted-foreground">Rollover Out</div>
            <div className="flex items-center gap-1 text-sm text-foreground">
              <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
              {formatMoney(entry.rolloverOutCents)}
            </div>
          </div>
        )}
      </div>

      {/* Period */}
      <div className="mt-3 flex items-center gap-4 border-t border-border pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDate(entry.periodStart)} - {formatDate(entry.periodEnd)}
        </span>
      </div>
    </div>
  );
}

// ── History Row ─────────────────────────────────────────────────

function HistoryRow({ entry }: { entry: MinimumHistoryEntry }) {
  const colors = trafficLightColor(entry.progressPercent);

  return (
    <tr>
      <td className="py-2 pr-4 text-sm text-foreground">
        {formatDate(entry.periodStart)} - {formatDate(entry.periodEnd)}
      </td>
      <td className="py-2 pr-4 text-sm text-right font-medium text-foreground">
        {formatMoney(entry.requiredCents)}
      </td>
      <td className="py-2 pr-4 text-sm text-right text-foreground">
        {formatMoney(entry.satisfiedCents)}
      </td>
      <td className="py-2 pr-4 text-sm text-right">
        <span className={`font-semibold ${colors.text}`}>
          {entry.progressPercent}%
        </span>
      </td>
      <td className="py-2 pr-4 text-sm text-right">
        {entry.shortfallCents > 0 ? (
          <span className="text-red-500">{formatMoney(entry.shortfallCents)}</span>
        ) : (
          <span className="text-green-500">$0.00</span>
        )}
      </td>
      <td className="py-2">
        <Badge variant={entry.isMetMinimum ? 'success' : 'warning'}>
          {colors.label}
        </Badge>
      </td>
    </tr>
  );
}

// ── Assign Minimum Modal ─────────────────────────────────────────

function AssignMinimumModal({
  accountId,
  onClose,
  onSuccess,
}: {
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { policies } = useMinimumPolicies();
  const { assignMinimum, isLoading } = useMinimumMutations();
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!selectedRuleId) return;
    setError(null);
    try {
      await assignMinimum(accountId, { ruleId: selectedRuleId });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign minimum');
    }
  }, [accountId, selectedRuleId, assignMinimum, onSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-foreground">Assign Minimum Spend Rule</h3>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Select Policy
          </label>
          <select
            value={selectedRuleId}
            onChange={(e) => setSelectedRuleId(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">-- Select a policy --</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({formatMoney(p.amountCents)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedRuleId || isLoading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Assigning...
              </span>
            ) : (
              'Assign'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function MinimumsSubTab({ accountId }: { accountId: string }) {
  const { entries, isLoading, error, mutate } = useMinimumProgress(accountId);
  const [showHistory, setShowHistory] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 p-4 text-muted-foreground">
        <AlertCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm">Failed to load minimum spend data</p>
        <button
          type="button"
          onClick={mutate}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (entries.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 p-4 text-muted-foreground">
        <Target className="h-6 w-6" />
        <p className="text-sm font-medium text-muted-foreground">No Minimum Spend Rules</p>
        <p className="text-xs">No minimum spending requirements have been assigned.</p>
        <button
          type="button"
          onClick={() => setShowAssign(true)}
          className="mt-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Assign Minimum
        </button>
        {showAssign && (
          <AssignMinimumModal
            accountId={accountId}
            onClose={() => setShowAssign(false)}
            onSuccess={mutate}
          />
        )}
      </div>
    );
  }

  // Summary stats
  const openEntries = entries.filter((e) => e.status === 'open');
  const totalRequired = openEntries.reduce((sum, e) => sum + e.requiredCents, 0);
  const totalSatisfied = openEntries.reduce((sum, e) => sum + e.satisfiedCents, 0);
  const overallPercent = totalRequired > 0
    ? Math.min(100, Math.round((totalSatisfied / totalRequired) * 100))
    : 100;
  const overallColors = trafficLightColor(overallPercent);

  return (
    <div className="space-y-4 p-4">
      {/* Summary card */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-semibold text-foreground">Minimum Spend Overview</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAssign(true)}
              className="rounded-md border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              + Assign Rule
            </button>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              <History className="h-3 w-3" />
              History
              {showHistory ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>

        {/* Overall progress */}
        <div className="mb-3 grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Required</div>
            <div className="text-lg font-semibold text-foreground">{formatMoney(totalRequired)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Spent</div>
            <div className="text-lg font-semibold text-foreground">{formatMoney(totalSatisfied)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Overall</div>
            <div className={`text-lg font-semibold ${overallColors.text}`}>
              {overallPercent}%
            </div>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className={`h-2 w-full overflow-hidden rounded-full ${overallColors.bg}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${overallColors.fill}`}
            style={{ width: `${Math.min(overallPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Active entries */}
      {entries
        .filter((e) => e.status === 'open')
        .map((entry) => (
          <ProgressCard key={entry.id} entry={entry} />
        ))}

      {/* Closed entries (collapsed by default) */}
      {entries.some((e) => e.status !== 'open') && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Completed Periods</h3>
          <div className="space-y-3">
            {entries
              .filter((e) => e.status !== 'open')
              .map((entry) => (
                <ProgressCard key={entry.id} entry={entry} />
              ))}
          </div>
        </div>
      )}

      {/* History table (expandable) */}
      {showHistory && <HistorySection accountId={accountId} />}

      {/* Assign modal */}
      {showAssign && (
        <AssignMinimumModal
          accountId={accountId}
          onClose={() => setShowAssign(false)}
          onSuccess={mutate}
        />
      )}
    </div>
  );
}

// ── History Section ──────────────────────────────────────────────

function HistorySection({ accountId }: { accountId: string }) {
  const { items, isLoading, error, hasMore, mutate } = useMinimumHistory(accountId);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-center text-sm text-muted-foreground">
        Failed to load history.{' '}
        <button
          type="button"
          onClick={mutate}
          className="text-indigo-600 hover:text-indigo-500"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-center text-sm text-muted-foreground">
        No history records found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-foreground">Period History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Period</th>
              <th className="pb-2 pr-4 text-right font-medium">Required</th>
              <th className="pb-2 pr-4 text-right font-medium">Spent</th>
              <th className="pb-2 pr-4 text-right font-medium">Progress</th>
              <th className="pb-2 pr-4 text-right font-medium">Shortfall</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="mt-3 text-center">
          <button
            type="button"
            className="text-sm text-indigo-600 hover:text-indigo-500"
            onClick={() => {
              // Load more would require cursor pagination update in the hook
            }}
          >
            Load more...
          </button>
        </div>
      )}
    </div>
  );
}
