'use client';

import { useState, useMemo } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useTrialBalance } from '@/hooks/use-journals';
import { formatAccountingMoney } from '@/types/accounting';
import type { AccountType, TrialBalanceRow } from '@/types/accounting';

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

export default function TrialBalanceContent() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]!);
  const [showZeroBalances, setShowZeroBalances] = useState(false);

  const { data: rows, isLoading } = useTrialBalance({ asOfDate, showZeroBalances });

  const grouped = useMemo(() => {
    const result: Record<string, TrialBalanceRow[]> = {};
    for (const type of TYPE_ORDER) {
      const items = rows.filter((r) => r.accountType === type);
      if (items.length > 0 || showZeroBalances) {
        result[type] = items;
      }
    }
    return result;
  }, [rows, showZeroBalances]);

  const totalDebits = rows.reduce((sum, r) => sum + r.debitBalance, 0);
  const totalCredits = rows.reduce((sum, r) => sum + r.creditBalance, 0);
  const variance = Math.abs(totalDebits - totalCredits);
  const isBalanced = variance < 0.01;

  const handleExport = () => {
    const params = new URLSearchParams();
    params.set('asOfDate', asOfDate);
    if (showZeroBalances) params.set('showZeroBalances', 'true');
    params.set('format', 'csv');
    window.open(`/api/v1/accounting/reports/trial-balance?${params.toString()}`, '_blank');
  };

  return (
    <AccountingPageShell
      title="Trial Balance"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports/trial-balance' },
        { label: 'Trial Balance' },
      ]}
      actions={
        <button
          type="button"
          onClick={handleExport}
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
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={showZeroBalances}
            onChange={(e) => setShowZeroBalances(e.target.checked)}
            className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-foreground">Show zero-balance accounts</span>
        </label>
      </div>

      {/* Out of balance alert */}
      {!isLoading && !isBalanced && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <span className="text-sm font-medium text-red-500">
            Trial balance is out of balance by {formatAccountingMoney(variance)}
          </span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Table */}
      {!isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Account #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Account Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Classification</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_ORDER.map((type) => {
                  const items = grouped[type];
                  if (!items || items.length === 0) return null;
                  const sectionDebits = items.reduce((s, r) => s + r.debitBalance, 0);
                  const sectionCredits = items.reduce((s, r) => s + r.creditBalance, 0);

                  return (
                    <tbody key={type}>
                      {/* Section header */}
                      <tr className="bg-muted/50">
                        <td colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {TYPE_LABELS[type]}
                        </td>
                      </tr>
                      {/* Rows */}
                      {items.map((row) => (
                        <tr key={row.accountId} className="border-b border-border last:border-0 hover:bg-muted/50">
                          <td className="px-4 py-2.5 text-sm font-mono text-foreground">{row.accountNumber}</td>
                          <td className="px-4 py-2.5 text-sm text-foreground">{row.accountName}</td>
                          <td className="px-4 py-2.5 text-sm text-muted-foreground">{row.classificationName ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                            {row.debitBalance > 0 ? formatAccountingMoney(row.debitBalance) : ''}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                            {row.creditBalance > 0 ? formatAccountingMoney(row.creditBalance) : ''}
                          </td>
                        </tr>
                      ))}
                      {/* Section subtotal */}
                      <tr className="border-b border-border bg-muted/30">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                          {TYPE_LABELS[type]} Subtotal
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                          {sectionDebits > 0 ? formatAccountingMoney(sectionDebits) : ''}
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                          {sectionCredits > 0 ? formatAccountingMoney(sectionCredits) : ''}
                        </td>
                      </tr>
                    </tbody>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted font-bold">
                  <td colSpan={3} className="px-4 py-3 text-right text-sm text-foreground">
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                    {formatAccountingMoney(totalDebits)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                    {formatAccountingMoney(totalCredits)}
                  </td>
                </tr>
                {!isBalanced && (
                  <tr className="bg-red-500/10 font-semibold">
                    <td colSpan={3} className="px-4 py-2 text-right text-sm text-red-500">Variance</td>
                    <td colSpan={2} className="px-4 py-2 text-right text-sm tabular-nums text-red-500">
                      {formatAccountingMoney(variance)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-4 p-4 md:hidden">
            {TYPE_ORDER.map((type) => {
              const items = grouped[type];
              if (!items || items.length === 0) return null;
              return (
                <div key={type} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {TYPE_LABELS[type]}
                  </h3>
                  {items.map((row) => (
                    <div key={row.accountId} className="flex items-center justify-between rounded border border-border p-2">
                      <div>
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{row.accountNumber}</span>
                        <span className="text-sm text-foreground">{row.accountName}</span>
                      </div>
                      <span className="text-sm tabular-nums text-foreground">
                        {row.debitBalance > 0
                          ? formatAccountingMoney(row.debitBalance)
                          : formatAccountingMoney(row.creditBalance)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            {/* Totals */}
            <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
              <div className="flex justify-between text-sm font-bold">
                <span>Total Debits</span>
                <span className="tabular-nums">{formatAccountingMoney(totalDebits)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span>Total Credits</span>
                <span className="tabular-nums">{formatAccountingMoney(totalCredits)}</span>
              </div>
              {!isBalanced && (
                <div className="flex justify-between text-sm font-bold text-red-500">
                  <span>Variance</span>
                  <span className="tabular-nums">{formatAccountingMoney(variance)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
