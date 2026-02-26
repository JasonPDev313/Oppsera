'use client';

import { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useARAging } from '@/hooks/use-ar';
import { formatAccountingMoney } from '@/types/accounting';

export default function ARAgingContent() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]!);
  const { data: rows, isLoading } = useARAging({ asOfDate });

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

  return (
    <AccountingPageShell
      title="AR Aging Report"
      breadcrumbs={[
        { label: 'Accounts Receivable' },
        { label: 'Reports' },
        { label: 'Aging' },
      ]}
      actions={
        <button
          type="button"
          onClick={() => window.open(`/api/v1/ar/reports/aging?asOfDate=${asOfDate}&format=csv`, '_blank')}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      }
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">As of Date</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-green-500">Current</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-yellow-500">1-30</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-orange-500">31-60</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-red-500">61-90</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-red-500">90+</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.customerId} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground">{row.customerName}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-green-500">
                      {row.current > 0 ? formatAccountingMoney(row.current) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-yellow-500">
                      {row.days1to30 > 0 ? formatAccountingMoney(row.days1to30) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-orange-500">
                      {row.days31to60 > 0 ? formatAccountingMoney(row.days31to60) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-red-500">
                      {row.days61to90 > 0 ? formatAccountingMoney(row.days61to90) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-red-500">
                      {row.days90plus > 0 ? formatAccountingMoney(row.days90plus) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold text-foreground">
                      {formatAccountingMoney(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-bold">
                  <td className="px-4 py-3 text-sm text-foreground">Total</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-green-500">{formatAccountingMoney(totals.current)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-yellow-500">{formatAccountingMoney(totals.days1to30)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-orange-500">{formatAccountingMoney(totals.days31to60)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-red-500">{formatAccountingMoney(totals.days61to90)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-red-500">{formatAccountingMoney(totals.days90plus)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 p-4 md:hidden">
            {rows.map((row) => (
              <div key={row.customerId} className="rounded border border-border p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium text-foreground">{row.customerName}</span>
                  <span className="font-semibold tabular-nums">{formatAccountingMoney(row.total)}</span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-xs">
                  {[
                    { label: 'Current', value: row.current, color: 'text-green-500' },
                    { label: '1-30', value: row.days1to30, color: 'text-yellow-500' },
                    { label: '31-60', value: row.days31to60, color: 'text-orange-500' },
                    { label: '61-90', value: row.days61to90, color: 'text-red-500' },
                    { label: '90+', value: row.days90plus, color: 'text-red-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center">
                      <p className="text-muted-foreground">{label}</p>
                      <p className={`tabular-nums ${color}`}>{formatAccountingMoney(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
