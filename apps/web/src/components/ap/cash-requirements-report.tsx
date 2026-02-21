'use client';

import { useState } from 'react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useCashRequirements } from '@/hooks/use-ap';
import { formatAccountingMoney } from '@/types/accounting';

export function CashRequirementsReport() {
  const [groupBy, setGroupBy] = useState<'week' | 'month'>('week');
  const { data: rows, isLoading } = useCashRequirements({ groupBy });

  const totalDue = rows.reduce((sum, r) => sum + r.totalDue, 0);
  const nextRow = rows[0];

  return (
    <AccountingPageShell
      title="Cash Requirements"
      breadcrumbs={[
        { label: 'Accounts Payable' },
        { label: 'Reports' },
        { label: 'Cash Requirements' },
      ]}
    >
      {/* Summary */}
      {nextRow && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
          <p className="text-sm text-indigo-700">
            You need <span className="font-bold tabular-nums">{formatAccountingMoney(nextRow.totalDue)}</span> by{' '}
            <span className="font-semibold">{nextRow.period}</span>{' '}
            ({nextRow.billCount} bill{nextRow.billCount !== 1 ? 's' : ''})
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Group By</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'week' | 'month')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Period</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Bills</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Due</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Running Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{row.period}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-700">{row.billCount}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-900">
                    {formatAccountingMoney(row.totalDue)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-gray-900">
                    {formatAccountingMoney(row.runningTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                <td className="px-4 py-3 text-sm text-gray-800">Total</td>
                <td className="px-4 py-3 text-right text-sm text-gray-700">
                  {rows.reduce((sum, r) => sum + r.billCount, 0)}
                </td>
                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">
                  {formatAccountingMoney(totalDue)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </AccountingPageShell>
  );
}

export default CashRequirementsReport;
