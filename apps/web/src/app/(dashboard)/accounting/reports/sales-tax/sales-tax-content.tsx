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
          <label className="block text-sm font-medium text-foreground mb-1">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Tax Group</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Jurisdiction</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Rate</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Collected</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Remitted</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Net Liability</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.taxGroupId} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground">{row.taxGroupName}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{row.jurisdiction}</td>
                    <td className="px-4 py-2.5 text-right text-sm text-foreground">{(row.rate * 100).toFixed(2)}%</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                      {formatAccountingMoney(row.taxCollected)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                      {formatAccountingMoney(row.taxRemitted)}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${row.netLiability > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {formatAccountingMoney(row.netLiability)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-bold">
                  <td colSpan={3} className="px-4 py-3 text-sm text-foreground">Total</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(totals.collected)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(totals.remitted)}</td>
                  <td className={`px-4 py-3 text-right text-sm tabular-nums ${totals.liability > 0 ? 'text-red-500' : 'text-green-500'}`}>
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
