'use client';

import { useState, useCallback } from 'react';
import { CheckCircle, XCircle, RefreshCw, Download, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { formatAccountingMoney } from '@/types/accounting';
import type { WaterfallStage, ReconciliationWaterfall } from '@/types/accounting';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useReconciliationWaterfall } from '@/hooks/use-reconciliation-waterfall';

// ── Cents formatter ──────────────────────────────────────────
function formatCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 0) {
    return `($${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Subledger Reconciliation ─────────────────────────────────

interface ReconciliationResult {
  module: string;
  glBalance: number;
  subledgerBalance: number;
  difference: number;
  isReconciled: boolean;
  asOfDate: string;
}

function useReconciliation(asOfDate: string) {
  const result = useQuery({
    queryKey: ['reconciliation', asOfDate],
    queryFn: async () => {
      const p = new URLSearchParams({ asOfDate });
      const [ap, ar] = await Promise.all([
        apiFetch<{ data: ReconciliationResult }>(
          `/api/v1/accounting/reconciliation/ap?${p}`,
        )
          .then((r) => r.data)
          .catch(() => ({
            module: 'ap',
            glBalance: 0,
            subledgerBalance: 0,
            difference: 0,
            isReconciled: true,
            asOfDate,
          })),
        apiFetch<{ data: ReconciliationResult }>(
          `/api/v1/accounting/reconciliation/ar?${p}`,
        )
          .then((r) => r.data)
          .catch(() => ({
            module: 'ar',
            glBalance: 0,
            subledgerBalance: 0,
            difference: 0,
            isReconciled: true,
            asOfDate,
          })),
      ]);
      return { ap, ar };
    },
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}

function ReconciliationCard({
  title,
  result,
  isLoading,
}: {
  title: string;
  result: ReconciliationResult | null;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-surface p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 space-y-3">
          <div className="h-5 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-5 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div
      className={`rounded-lg border p-6 ${
        result.isReconciled
          ? 'border-green-200 bg-green-50/50'
          : 'border-red-200 bg-red-50/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {result.isReconciled ? (
          <span className="flex items-center gap-1 text-sm font-medium text-green-600">
            <CheckCircle className="h-4 w-4" /> Reconciled
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm font-medium text-red-600">
            <XCircle className="h-4 w-4" /> Unreconciled
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">GL Control Balance</span>
          <span className="font-mono font-medium tabular-nums text-gray-900">
            {formatAccountingMoney(result.glBalance)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Subledger Balance</span>
          <span className="font-mono font-medium tabular-nums text-gray-900">
            {formatAccountingMoney(result.subledgerBalance)}
          </span>
        </div>
        <div className="border-t border-gray-200 pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Difference</span>
            <span
              className={`font-mono font-bold tabular-nums ${
                result.difference === 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatAccountingMoney(result.difference)}
            </span>
          </div>
        </div>
      </div>

      {!result.isReconciled && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {expanded ? 'Hide Details' : 'View Details'}
        </button>
      )}

      {expanded && !result.isReconciled && (
        <div className="mt-3 rounded border border-red-100 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Possible causes:</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-red-700">
            <li>Unposted {title.includes('AP') ? 'bills' : 'invoices'} in draft status</li>
            <li>Voided entries not properly reversed</li>
            <li>Manual GL adjustments to control account</li>
            <li>Rounding differences exceeding tolerance ($0.01)</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Waterfall Row ────────────────────────────────────────────

function WaterfallRow({ stage }: { stage: WaterfallStage }) {
  const isTopLevel = stage.indent === 0;
  const hasVariance = stage.variance !== null && stage.variance !== 0;
  const varianceColor = !hasVariance
    ? ''
    : Math.abs(stage.variance!) < 100
      ? 'text-green-600'
      : Math.abs(stage.variance!) < 500
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <tr className={`${isTopLevel ? 'bg-gray-50/50 font-medium' : ''} border-b border-gray-100`}>
      <td className="py-3 pr-4">
        <div className={`flex items-center gap-2 ${stage.indent === 1 ? 'pl-6' : ''}`}>
          {isTopLevel && <ArrowRight className="h-3.5 w-3.5 text-gray-400" />}
          <span className={`text-sm ${isTopLevel ? 'text-gray-900' : 'text-gray-600'}`}>
            {stage.label}
          </span>
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        <span className={`font-mono text-sm tabular-nums ${isTopLevel ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
          {formatCents(stage.amount)}
        </span>
      </td>
      <td className="py-3 px-4 text-right">
        {stage.expected !== null ? (
          <span className="font-mono text-sm tabular-nums text-gray-500">
            {formatCents(stage.expected)}
          </span>
        ) : (
          <span className="text-sm text-gray-300">&mdash;</span>
        )}
      </td>
      <td className="py-3 pl-4 text-right">
        {stage.variance !== null ? (
          <span className={`font-mono text-sm font-medium tabular-nums ${varianceColor || 'text-green-600'}`}>
            {stage.variance === 0 ? '$0.00' : formatCents(stage.variance)}
          </span>
        ) : (
          <span className="text-sm text-gray-300">&mdash;</span>
        )}
      </td>
    </tr>
  );
}

// ── Waterfall Component ──────────────────────────────────────

function WaterfallView({
  waterfall,
  isLoading,
}: {
  waterfall: ReconciliationWaterfall | null;
  isLoading: boolean;
}) {
  const [showDetails, setShowDetails] = useState(true);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
        ))}
      </div>
    );
  }

  if (!waterfall) {
    return (
      <div className="rounded-lg border border-gray-200 bg-surface p-8 text-center text-sm text-gray-500">
        No data available for the selected date.
      </div>
    );
  }

  const topLevelStages = waterfall.stages.filter((s) => s.indent === 0);
  const displayStages = showDetails
    ? waterfall.stages
    : topLevelStages;

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div
        className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
          waterfall.isBalanced
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        {waterfall.isBalanced ? (
          <>
            <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
            <span>
              All stages balanced for {waterfall.businessDate}. Total variance: {formatCents(waterfall.totalVariance)}
            </span>
          </>
        ) : (
          <>
            <XCircle className="h-5 w-5 shrink-0 text-amber-600" />
            <span>
              Variances detected for {waterfall.businessDate}. Total variance: {formatCents(waterfall.totalVariance)}
            </span>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {showDetails ? (
            <><ChevronDown className="h-4 w-4" /> Hide Sub-Items</>
          ) : (
            <><ChevronRight className="h-4 w-4" /> Show Sub-Items</>
          )}
        </button>
      </div>

      {/* Waterfall table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="py-3 pr-4 pl-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Stage
              </th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Actual
              </th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Expected
              </th>
              <th className="py-3 pl-4 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Variance
              </th>
            </tr>
          </thead>
          <tbody>
            {displayStages.map((stage) => (
              <WaterfallRow key={stage.stage} stage={stage} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td className="py-3 pr-4 pl-4 text-sm font-bold text-gray-900">
                Total Variance (Absolute)
              </td>
              <td className="py-3 px-4" />
              <td className="py-3 px-4" />
              <td className="py-3 pl-4 pr-4 text-right">
                <span
                  className={`font-mono text-sm font-bold tabular-nums ${
                    waterfall.isBalanced ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCents(waterfall.totalVariance)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────

function exportWaterfallCsv(waterfall: ReconciliationWaterfall) {
  const BOM = '\uFEFF';
  const header = 'Stage,Label,Actual ($),Expected ($),Variance ($),Level';
  const rows = waterfall.stages.map((s) => {
    const actual = (s.amount / 100).toFixed(2);
    const expected = s.expected !== null ? (s.expected / 100).toFixed(2) : '';
    const variance = s.variance !== null ? (s.variance / 100).toFixed(2) : '';
    const escapedLabel = s.label.includes(',') ? `"${s.label}"` : s.label;
    return `${s.stage},${escapedLabel},${actual},${expected},${variance},${s.indent === 0 ? 'Summary' : 'Detail'}`;
  });
  const csv = BOM + [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reconciliation-waterfall-${waterfall.businessDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main ─────────────────────────────────────────────────────

type Tab = 'waterfall' | 'subledger';

export default function ReconciliationContent() {
  const [activeTab, setActiveTab] = useState<Tab>('waterfall');
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().split('T')[0]!);
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split('T')[0]!);

  // Subledger data
  const { data: subledgerData, isLoading: subledgerLoading, refetch: refetchSubledger } = useReconciliation(asOfDate);

  // Waterfall data
  const { data: waterfallData, isLoading: waterfallLoading, refetch: refetchWaterfall } = useReconciliationWaterfall({
    businessDate,
  });

  const handleRefresh = useCallback(() => {
    if (activeTab === 'waterfall') {
      refetchWaterfall();
    } else {
      refetchSubledger();
    }
  }, [activeTab, refetchWaterfall, refetchSubledger]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'waterfall', label: 'Chain of Custody' },
    { id: 'subledger', label: 'Subledger Reconciliation' },
  ];

  return (
    <AccountingPageShell
      title="Reconciliation Dashboard"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Reconciliation' },
      ]}
    >
      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        {activeTab === 'waterfall' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Date</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">As of Date</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        )}
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-surface px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
        {activeTab === 'waterfall' && waterfallData && (
          <button
            onClick={() => exportWaterfallCsv(waterfallData)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-surface px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Content */}
      {activeTab === 'waterfall' && (
        <WaterfallView waterfall={waterfallData} isLoading={waterfallLoading} />
      )}

      {activeTab === 'subledger' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ReconciliationCard
              title="AP Reconciliation"
              result={subledgerData?.ap ?? null}
              isLoading={subledgerLoading}
            />
            <ReconciliationCard
              title="AR Reconciliation"
              result={subledgerData?.ar ?? null}
              isLoading={subledgerLoading}
            />
          </div>

          {subledgerData && (
            <div
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                subledgerData.ap.isReconciled && subledgerData.ar.isReconciled
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {subledgerData.ap.isReconciled && subledgerData.ar.isReconciled ? (
                <>
                  <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
                  <span>All subledgers are reconciled with the general ledger as of {asOfDate}.</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 shrink-0 text-amber-600" />
                  <span>
                    One or more subledgers have differences. Review and resolve before closing the period.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </AccountingPageShell>
  );
}
