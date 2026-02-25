'use client';

import { useState } from 'react';
import {
  Landmark,
  Clock,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  useAchStatusSummary,
  useAchPending,
  useAchReturns,
  useAchReturnDistribution,
  useAchSettlementByDate,
  useAchFundingPoll,
} from '@/hooks/use-ach-status';

type Tab = 'overview' | 'pending' | 'returns' | 'settlement';

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function AchStatusContent() {
  const [tab, setTab] = useState<Tab>('overview');
  const { data: summary, isLoading: summaryLoading } = useAchStatusSummary();
  const poll = useAchFundingPoll();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'pending', label: 'Pending' },
    { key: 'returns', label: 'Returns' },
    { key: 'settlement', label: 'Settlement' },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ACH Status</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor ACH payment origination, settlement, and returns
          </p>
        </div>
        <button
          type="button"
          onClick={() => poll.mutate({})}
          disabled={poll.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {poll.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Poll Funding Status
        </button>
      </div>

      {/* Poll result banner */}
      {poll.isSuccess && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600">
          Polling complete — {poll.data.totalSettled} settled, {poll.data.totalOriginated} originated, {poll.data.totalReturned} returned
        </div>
      )}
      {poll.isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          Polling failed. Please try again.
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            label="Pending"
            count={summary.pendingCount}
            amount={formatCents(summary.pendingAmountCents)}
            color="amber"
          />
          <SummaryCard
            icon={<ArrowRightLeft className="h-5 w-5 text-blue-500" />}
            label="In Transit"
            count={summary.originatedCount}
            amount={formatCents(summary.originatedAmountCents)}
            color="blue"
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
            label="Settled"
            count={summary.settledCount}
            amount={formatCents(summary.settledAmountCents)}
            color="green"
          />
          <SummaryCard
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
            label="Returned"
            count={summary.returnedCount}
            amount={formatCents(summary.returnedAmountCents)}
            color="red"
          />
        </div>
      )}

      {summaryLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.key === 'returns' && summary && summary.returnedCount > 0 && (
                <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
                  {summary.returnedCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'pending' && <PendingTab />}
      {tab === 'returns' && <ReturnsTab />}
      {tab === 'settlement' && <SettlementTab />}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────

const SUMMARY_CARD_BG: Record<string, string> = {
  amber: 'bg-amber-500/10',
  blue: 'bg-blue-500/10',
  green: 'bg-green-500/10',
  red: 'bg-red-500/10',
};

function SummaryCard({
  icon,
  label,
  count,
  amount,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  amount: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${SUMMARY_CARD_BG[color] ?? 'bg-gray-500/10'}`}>{icon}</div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{count}</p>
          <p className="text-sm text-gray-600">{amount}</p>
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────

function OverviewTab() {
  const { data: distribution, isLoading: distLoading } = useAchReturnDistribution();
  const { data: settlement, isLoading: settLoading } = useAchSettlementByDate();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Return Code Distribution */}
      <div className="rounded-lg border border-gray-200 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Return Code Distribution</h3>
        {distLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : distribution.length === 0 ? (
          <p className="text-sm text-gray-400">No returns recorded</p>
        ) : (
          <div className="space-y-3">
            {distribution.map((d) => {
              const maxCount = Math.max(...distribution.map((x) => x.count));
              const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
              return (
                <div key={d.returnCode}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono font-medium text-gray-900">{d.returnCode}</span>
                    <span className="text-gray-500">{d.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-red-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">{d.returnReason}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Settlement Activity */}
      <div className="rounded-lg border border-gray-200 bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Settlement Activity (Last 30 Days)</h3>
        {settLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : settlement.length === 0 ? (
          <p className="text-sm text-gray-400">No settlement data yet</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-4 text-xs font-medium uppercase tracking-wider text-gray-500">
              <span>Date</span>
              <span className="text-right">Settled</span>
              <span className="text-right">Returned</span>
              <span className="text-right">Net</span>
            </div>
            {settlement.slice(0, 15).map((s) => (
              <div key={s.date} className="grid grid-cols-4 border-t border-gray-100 py-1.5 text-sm">
                <span className="text-gray-700">{formatDate(s.date)}</span>
                <span className="text-right font-medium text-green-500">
                  {formatCents(s.settledAmountCents)}
                </span>
                <span className="text-right font-medium text-red-500">
                  {s.returnedAmountCents > 0 ? `-${formatCents(s.returnedAmountCents)}` : '—'}
                </span>
                <span className="text-right font-medium text-gray-900">
                  {formatCents(s.settledAmountCents - s.returnedAmountCents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pending Tab ───────────────────────────────────────────────

function PendingTab() {
  const { items, meta, isLoading } = useAchPending({ limit: 50 });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-12">
        <CheckCircle2 className="h-8 w-8 text-green-400" />
        <p className="text-sm font-medium text-gray-600">No pending ACH payments</p>
        <p className="text-xs text-gray-400">All ACH payments have been settled or returned.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Account</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">SEC Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-200/50">
              <td className="whitespace-nowrap px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    item.achSettlementStatus === 'originated'
                      ? 'bg-blue-500/10 text-blue-500'
                      : 'bg-amber-500/10 text-amber-500'
                  }`}
                >
                  {item.achSettlementStatus === 'originated' ? 'In Transit' : 'Pending'}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                {formatCents(item.amountCents)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                {item.bankLast4 ? `••••${item.bankLast4}` : '—'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs font-mono text-gray-500">
                {item.achSecCode ?? '—'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {formatDate(item.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {meta.hasMore && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
          Showing {items.length} items — more available
        </div>
      )}
    </div>
  );
}

// ── Returns Tab ───────────────────────────────────────────────

function ReturnsTab() {
  const { items, meta, isLoading } = useAchReturns({ limit: 50 });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-12">
        <CheckCircle2 className="h-8 w-8 text-green-400" />
        <p className="text-sm font-medium text-gray-600">No ACH returns</p>
        <p className="text-xs text-gray-400">No bank rejections have been recorded.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Return Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Reason</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Return Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-200/50">
              <td className="whitespace-nowrap px-4 py-3">
                <span className="inline-flex items-center rounded bg-red-500/10 px-2 py-0.5 font-mono text-xs font-medium text-red-500">
                  {item.returnCode}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{item.returnReason}</td>
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                {formatCents(item.originalAmountCents)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                {formatDate(item.returnDate)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {item.resolvedAt ? (
                  <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-500">
                    Resolved
                  </span>
                ) : item.isAdministrative ? (
                  <span className="inline-flex items-center rounded-full bg-gray-500/10 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                    Administrative
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-500">
                    Unresolved
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {meta.hasMore && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
          Showing {items.length} items — more available
        </div>
      )}
    </div>
  );
}

// ── Settlement Tab ────────────────────────────────────────────

function SettlementTab() {
  const { data: settlement, isLoading } = useAchSettlementByDate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
        ))}
      </div>
    );
  }

  if (settlement.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-12">
        <Landmark className="h-8 w-8 text-gray-300" />
        <p className="text-sm font-medium text-gray-600">No settlement data</p>
        <p className="text-xs text-gray-400">ACH settlement data will appear here after the first funding poll.</p>
      </div>
    );
  }

  const totalSettled = settlement.reduce((s, r) => s + r.settledAmountCents, 0);
  const totalReturned = settlement.reduce((s, r) => s + r.returnedAmountCents, 0);

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Settled</p>
          <p className="mt-1 text-xl font-bold text-green-500">{formatCents(totalSettled)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Returned</p>
          <p className="mt-1 text-xl font-bold text-red-500">{formatCents(totalReturned)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Net ACH</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{formatCents(totalSettled - totalReturned)}</p>
        </div>
      </div>

      {/* Daily table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Settled</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Settled Amt</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Returned</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Returned Amt</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {settlement.map((s) => (
              <tr key={s.date} className="hover:bg-gray-200/50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {formatDate(s.date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                  {s.settledCount}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-green-500">
                  {formatCents(s.settledAmountCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                  {s.returnedCount}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-red-500">
                  {s.returnedAmountCents > 0 ? formatCents(s.returnedAmountCents) : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {formatCents(s.settledAmountCents - s.returnedAmountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
