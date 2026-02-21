'use client';

import { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useAPAging } from '@/hooks/use-ap';
import { formatAccountingMoney } from '@/types/accounting';

const AGING_COLORS: Record<string, string> = {
  current: 'text-green-700',
  days1to30: 'text-yellow-600',
  days31to60: 'text-orange-600',
  days61to90: 'text-red-600',
  days90plus: 'text-red-800',
};

export default function APAgingContent() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]!);
  const { data: rows, isLoading } = useAPAging({ asOfDate });

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        days1to30: acc.days1to30 + r.days1to30,
        days31to60: acc.days31to60 + r.days31to60,
        days61to90: acc.days61to90 + r.days61to90,
        days90plus: acc.days90plus + r.days90plus,
        total: acc.total + r.total,
      }),
      { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 },
    );
  }, [rows]);

  const overdue = totals.days1to30 + totals.days31to60 + totals.days61to90 + totals.days90plus;

  const handleExport = () => {
    window.open(`/api/v1/ap/reports/aging?asOfDate=${asOfDate}&format=csv`, '_blank');
  };

  return (
    <AccountingPageShell
      title="AP Aging Report"
      breadcrumbs={[
        { label: 'Accounts Payable' },
        { label: 'Reports' },
        { label: 'Aging' },
      ]}
      actions={
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total AP Outstanding</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{formatAccountingMoney(totals.total)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Current</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-green-600">{formatAccountingMoney(totals.current)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Overdue</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatAccountingMoney(overdue)}
          </p>
        </div>
      </div>

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
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {/* Table */}
      {!isLoading && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Vendor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-green-600">Current</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-yellow-600">1-30</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-orange-600">31-60</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-red-600">61-90</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-red-800">90+</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.vendorId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{row.vendorName}</td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${AGING_COLORS.current}`}>
                      {row.current > 0 ? formatAccountingMoney(row.current) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${AGING_COLORS.days1to30}`}>
                      {row.days1to30 > 0 ? formatAccountingMoney(row.days1to30) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${AGING_COLORS.days31to60}`}>
                      {row.days31to60 > 0 ? formatAccountingMoney(row.days31to60) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${AGING_COLORS.days61to90}`}>
                      {row.days61to90 > 0 ? formatAccountingMoney(row.days61to90) : ''}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${AGING_COLORS.days90plus}`}>
                      {row.days90plus > 0 ? formatAccountingMoney(row.days90plus) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold text-gray-900">
                      {formatAccountingMoney(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td className="px-4 py-3 text-sm text-gray-800">Total</td>
                  <td className={`px-4 py-3 text-right text-sm tabular-nums ${AGING_COLORS.current}`}>{formatAccountingMoney(totals.current)}</td>
                  <td className={`px-4 py-3 text-right text-sm tabular-nums ${AGING_COLORS.days1to30}`}>{formatAccountingMoney(totals.days1to30)}</td>
                  <td className={`px-4 py-3 text-right text-sm tabular-nums ${AGING_COLORS.days31to60}`}>{formatAccountingMoney(totals.days31to60)}</td>
                  <td className={`px-4 py-3 text-right text-sm tabular-nums ${AGING_COLORS.days61to90}`}>{formatAccountingMoney(totals.days61to90)}</td>
                  <td className={`px-4 py-3 text-right text-sm tabular-nums ${AGING_COLORS.days90plus}`}>{formatAccountingMoney(totals.days90plus)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">{formatAccountingMoney(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 p-4 md:hidden">
            {rows.map((row) => (
              <div key={row.vendorId} className="rounded border border-gray-100 p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900">{row.vendorName}</span>
                  <span className="font-semibold tabular-nums">{formatAccountingMoney(row.total)}</span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-xs">
                  <div className="text-center">
                    <p className="text-gray-500">Current</p>
                    <p className={`tabular-nums ${AGING_COLORS.current}`}>{formatAccountingMoney(row.current)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">1-30</p>
                    <p className={`tabular-nums ${AGING_COLORS.days1to30}`}>{formatAccountingMoney(row.days1to30)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">31-60</p>
                    <p className={`tabular-nums ${AGING_COLORS.days31to60}`}>{formatAccountingMoney(row.days31to60)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">61-90</p>
                    <p className={`tabular-nums ${AGING_COLORS.days61to90}`}>{formatAccountingMoney(row.days61to90)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">90+</p>
                    <p className={`tabular-nums ${AGING_COLORS.days90plus}`}>{formatAccountingMoney(row.days90plus)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
