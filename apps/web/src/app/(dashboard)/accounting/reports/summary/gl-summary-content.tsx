'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { useGLSummary } from '@/hooks/use-journals';
import { formatAccountingMoney } from '@/types/accounting';

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: start.toISOString().split('T')[0]!,
    endDate: now.toISOString().split('T')[0]!,
  };
}

export default function GLSummaryContent() {
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [groupBy, setGroupBy] = useState<'classification' | 'accountType'>('classification');

  const { data: rows, isLoading } = useGLSummary({ startDate, endDate, groupBy });

  const totalDebits = rows.reduce((sum, r) => sum + r.totalDebits, 0);
  const totalCredits = rows.reduce((sum, r) => sum + r.totalCredits, 0);
  const totalNet = rows.reduce((sum, r) => sum + r.netBalance, 0);

  return (
    <AccountingPageShell
      title="General Ledger Summary"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports/trial-balance' },
        { label: 'GL Summary' },
      ]}
      actions={
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            params.set('startDate', startDate);
            params.set('endDate', endDate);
            params.set('groupBy', groupBy);
            params.set('format', 'csv');
            window.open(`/api/v1/accounting/reports/summary?${params.toString()}`, '_blank');
          }}
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
          <label className="block text-sm font-medium text-foreground mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Group By</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'classification' | 'accountType')}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="classification">Classification</option>
            <option value="accountType">Account Type</option>
          </select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && rows.length === 0 && (
        <AccountingEmptyState
          title="No data"
          description="No GL activity found for the selected date range."
        />
      )}

      {/* Table */}
      {!isLoading && rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {groupBy === 'classification' ? 'Classification' : 'Account Type'}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Debits</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Credits</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.groupLabel} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{row.groupLabel}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(row.totalDebits)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(row.totalCredits)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-foreground">{formatAccountingMoney(row.netBalance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-bold">
                  <td className="px-4 py-3 text-sm text-foreground">Grand Total</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(totalDebits)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(totalCredits)}</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(totalNet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 p-4 md:hidden">
            {rows.map((row) => (
              <div key={row.groupLabel} className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-sm font-medium text-foreground">{row.groupLabel}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Debits</span>
                  <span className="tabular-nums">{formatAccountingMoney(row.totalDebits)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Credits</span>
                  <span className="tabular-nums">{formatAccountingMoney(row.totalCredits)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-foreground">Net</span>
                  <span className="tabular-nums">{formatAccountingMoney(row.netBalance)}</span>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
              <div className="flex justify-between text-sm font-bold">
                <span>Total Debits</span>
                <span className="tabular-nums">{formatAccountingMoney(totalDebits)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span>Total Credits</span>
                <span className="tabular-nums">{formatAccountingMoney(totalCredits)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span>Net Balance</span>
                <span className="tabular-nums">{formatAccountingMoney(totalNet)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
