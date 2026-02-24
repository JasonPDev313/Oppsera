'use client';

import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ReconciliationResult } from '@/hooks/use-import-jobs';

function formatCents(cents: number | null): string {
  if (cents == null) return '-';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDiff(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = `$${(abs / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (cents > 0) return `+${formatted}`;
  if (cents < 0) return `-${formatted}`;
  return formatted;
}

interface ReconciliationComparisonProps {
  data: ReconciliationResult;
}

export function ReconciliationComparison({ data }: ReconciliationComparisonProps) {
  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className={`flex items-center gap-3 rounded-lg border p-4 ${
        data.isBalanced
          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
          : 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
      }`}>
        {data.isBalanced ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Balanced</p>
              <p className="text-xs text-green-600 dark:text-green-500">
                All differences are within $1.00 tolerance
              </p>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                Differences Detected
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-500">
                Review the comparison below before proceeding
              </p>
            </div>
          </>
        )}
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left dark:border-gray-700">
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Legacy System</th>
              <th className="px-4 py-3 text-right font-medium">OppsEra</th>
              <th className="px-4 py-3 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody>
            <ComparisonRow
              label="Revenue"
              legacy={data.legacyRevenueCents}
              oppsera={data.oppseraRevenueCents}
              diff={data.revenueDifferenceCents}
            />
            <ComparisonRow
              label="Payments"
              legacy={data.legacyPaymentCents}
              oppsera={data.oppseraPaymentCents}
              diff={data.paymentDifferenceCents}
            />
            <ComparisonRow
              label="Tax"
              legacy={data.legacyTaxCents}
              oppsera={data.oppseraTaxCents}
              diff={data.taxDifferenceCents}
            />
            <tr className="border-t-2 border-gray-300 dark:border-gray-600">
              <td className="px-4 py-2 font-medium">Record Count</td>
              <td className="px-4 py-2 text-right">
                {data.legacyRowCount?.toLocaleString() ?? '-'} rows
              </td>
              <td className="px-4 py-2 text-right">
                {data.oppseraOrderCount?.toLocaleString() ?? '-'} orders
              </td>
              <td className="px-4 py-2 text-right text-gray-500">-</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  legacy,
  oppsera,
  diff,
}: {
  label: string;
  legacy: number | null;
  oppsera: number | null;
  diff: number;
}) {
  const diffColor =
    Math.abs(diff) < 100
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className="px-4 py-2 font-medium">{label}</td>
      <td className="px-4 py-2 text-right font-mono">{formatCents(legacy)}</td>
      <td className="px-4 py-2 text-right font-mono">{formatCents(oppsera)}</td>
      <td className={`px-4 py-2 text-right font-mono ${diffColor}`}>
        {formatDiff(diff)}
      </td>
    </tr>
  );
}
