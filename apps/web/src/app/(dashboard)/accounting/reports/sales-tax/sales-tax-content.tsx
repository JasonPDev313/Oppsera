'use client';

import { useState, useMemo } from 'react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useSalesTaxLiability } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';

function getQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const startMonth = q * 3;
  const start = `${now.getFullYear()}-${String(startMonth + 1).padStart(2, '0')}-01`;
  const end = now.toISOString().split('T')[0]!;
  return { start, end };
}

export default function SalesTaxContent() {
  const range = getQuarterRange();
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);

  const { data: rows, isLoading } = useSalesTaxLiability({ startDate, endDate });

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        collected: acc.collected + r.taxCollected,
        remitted: acc.remitted + r.taxRemitted,
        liability: acc.liability + r.netLiability,
      }),
      { collected: 0, remitted: 0, liability: 0 },
    );
  }, [rows]);

  return (
    <AccountingPageShell
      title="Sales Tax Liability"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Reports' },
        { label: 'Sales Tax' },
      ]}
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tax Group</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Jurisdiction</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Remitted</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Net Liability</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.taxGroupId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{row.taxGroupName}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700">{row.jurisdiction}</td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-700">{(row.rate * 100).toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-900">
                      {formatAccountingMoney(row.taxCollected)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-gray-900">
                      {formatAccountingMoney(row.taxRemitted)}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${row.netLiability > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatAccountingMoney(row.netLiability)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td colSpan={3} className="px-4 py-3 text-sm text-gray-800">Total</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">{formatAccountingMoney(totals.collected)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">{formatAccountingMoney(totals.remitted)}</td>
                  <td className={`px-4 py-3 text-right text-sm tabular-nums ${totals.liability > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatAccountingMoney(totals.liability)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
