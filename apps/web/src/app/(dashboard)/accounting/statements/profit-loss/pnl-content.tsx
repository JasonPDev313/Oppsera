'use client';

import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useProfitAndLoss } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';

function getMonthRange() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const end = now.toISOString().split('T')[0]!;
  return { start, end };
}

export default function PnlContent() {
  const range = getMonthRange();
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);
  const [comparative, setComparative] = useState(false);

  const { data: pnl, isLoading } = useProfitAndLoss({ startDate, endDate, comparative });

  return (
    <AccountingPageShell
      title="Profit & Loss Statement"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Statements' },
        { label: 'Profit & Loss' },
      ]}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={() => window.open(`/api/v1/accounting/statements/profit-loss?from=${startDate}&to=${endDate}&format=csv`, '_blank')}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 print:hidden">
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
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={comparative}
            onChange={(e) => setComparative(e.target.checked)}
            className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-foreground">Show prior period</span>
        </label>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && pnl && (
        <div className="rounded-lg border border-border bg-surface p-6 space-y-6 font-mono text-sm">
          {pnl.sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</p>
              {section.accounts.map((acct) => (
                <div key={acct.accountId} className="flex justify-between py-0.5 pl-4">
                  <span className="text-foreground">
                    <span className="text-muted-foreground mr-2">{acct.accountNumber}</span>
                    {acct.accountName}
                  </span>
                  <span className="tabular-nums text-foreground">{formatAccountingMoney(acct.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1 pl-4 font-semibold">
                <span className="text-foreground">Total {section.label}</span>
                <span className="tabular-nums text-foreground">{formatAccountingMoney(section.subtotal)}</span>
              </div>
            </div>
          ))}

          {/* Summary */}
          <div className="border-t-2 border-border pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="font-sans font-medium text-foreground">Gross Profit</span>
              <span className="tabular-nums font-semibold text-foreground">{formatAccountingMoney(pnl.grossProfit)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-border border-double pt-2">
              <span className="font-sans text-base font-bold text-foreground">Net Income</span>
              <span className={`tabular-nums text-base font-bold ${pnl.netIncome >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatAccountingMoney(pnl.netIncome)}
              </span>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
