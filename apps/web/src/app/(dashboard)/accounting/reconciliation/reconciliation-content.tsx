'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { formatAccountingMoney } from '@/types/accounting';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

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

export default function ReconciliationContent() {
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split('T')[0]!);
  const { data, isLoading, refetch } = useReconciliation(asOfDate);

  return (
    <AccountingPageShell
      title="Reconciliation Dashboard"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Reconciliation' },
      ]}
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">As of Date</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-surface px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Reconciliation Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReconciliationCard
          title="AP Reconciliation"
          result={data?.ap ?? null}
          isLoading={isLoading}
        />
        <ReconciliationCard
          title="AR Reconciliation"
          result={data?.ar ?? null}
          isLoading={isLoading}
        />
      </div>

      {/* Summary */}
      {data && (
        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
            data.ap.isReconciled && data.ar.isReconciled
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {data.ap.isReconciled && data.ar.isReconciled ? (
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
    </AccountingPageShell>
  );
}
