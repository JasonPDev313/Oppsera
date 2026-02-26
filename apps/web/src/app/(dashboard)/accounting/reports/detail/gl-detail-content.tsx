'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker } from '@/components/accounting/account-picker';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { useGLDetail } from '@/hooks/use-journals';
import { formatAccountingMoney, SOURCE_MODULE_BADGES } from '@/types/accounting';

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: start.toISOString().split('T')[0]!,
    endDate: now.toISOString().split('T')[0]!,
  };
}

export default function GLDetailContent() {
  const defaults = getDefaultDateRange();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

  const { data: rows, meta, isLoading } = useGLDetail({
    accountId,
    startDate,
    endDate,
  });

  return (
    <AccountingPageShell
      title="General Ledger Detail"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports/trial-balance' },
        { label: 'GL Detail' },
      ]}
      actions={
        accountId ? (
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              params.set('accountId', accountId);
              params.set('startDate', startDate);
              params.set('endDate', endDate);
              params.set('format', 'csv');
              window.open(`/api/v1/accounting/reports/detail?${params.toString()}`, '_blank');
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        ) : undefined
      }
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-72">
          <label className="block text-sm font-medium text-foreground mb-1">Account</label>
          <AccountPicker value={accountId} onChange={setAccountId} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* No account selected */}
      {!accountId && (
        <AccountingEmptyState
          title="Select an account"
          description="Choose a GL account above to view its transaction detail."
        />
      )}

      {/* Loading */}
      {accountId && isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Table */}
      {accountId && !isLoading && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Journal #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Memo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance */}
                <tr className="border-b border-border bg-blue-500/10">
                  <td colSpan={6} className="px-4 py-2 text-sm font-medium text-foreground">
                    Opening Balance
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                    {formatAccountingMoney(meta.openingBalance)}
                  </td>
                </tr>

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No transactions found for this period.
                    </td>
                  </tr>
                )}

                {rows.map((row, i) => {
                  const badge = SOURCE_MODULE_BADGES[row.sourceModule];
                  return (
                    <tr key={`${row.journalId}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 text-sm text-foreground">{row.date}</td>
                      <td className="px-4 py-2.5 text-sm">
                        <Link href={`/accounting/journals/${row.journalId}`} className="text-indigo-600 hover:text-indigo-500">
                          #{row.journalNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        <span className="text-xs text-muted-foreground">{badge?.label ?? row.sourceModule}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground max-w-[200px] truncate">
                        {row.memo ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                        {row.debit > 0 ? formatAccountingMoney(row.debit) : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                        {row.credit > 0 ? formatAccountingMoney(row.credit) : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-foreground">
                        {formatAccountingMoney(row.runningBalance)}
                      </td>
                    </tr>
                  );
                })}

                {/* Closing balance */}
                <tr className="border-t-2 border-border bg-blue-500/10">
                  <td colSpan={6} className="px-4 py-2 text-sm font-medium text-foreground">
                    Closing Balance
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-foreground">
                    {formatAccountingMoney(meta.closingBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 p-4 md:hidden">
            <div className="flex justify-between rounded-lg bg-blue-500/10 p-2 text-sm">
              <span className="font-medium text-foreground">Opening Balance</span>
              <span className="font-semibold tabular-nums">{formatAccountingMoney(meta.openingBalance)}</span>
            </div>
            {rows.map((row, i) => (
              <div key={`${row.journalId}-${i}`} className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <Link href={`/accounting/journals/${row.journalId}`} className="text-sm font-medium text-indigo-600">
                    #{row.journalNumber}
                  </Link>
                  <span className="text-xs text-muted-foreground">{row.date}</span>
                </div>
                {row.memo && <p className="text-xs text-muted-foreground truncate">{row.memo}</p>}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {row.debit > 0 ? `DR ${formatAccountingMoney(row.debit)}` : `CR ${formatAccountingMoney(row.credit)}`}
                  </span>
                  <span className="font-medium tabular-nums">{formatAccountingMoney(row.runningBalance)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between rounded-lg bg-blue-500/10 p-2 text-sm">
              <span className="font-bold text-foreground">Closing Balance</span>
              <span className="font-bold tabular-nums">{formatAccountingMoney(meta.closingBalance)}</span>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
