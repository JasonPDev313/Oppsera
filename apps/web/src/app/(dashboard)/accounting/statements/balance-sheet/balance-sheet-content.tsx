'use client';

import { useState } from 'react';
import { Download, Printer, AlertTriangle, CheckCircle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useBalanceSheet } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';
import type { FinancialStatementSection } from '@/types/accounting';

function StatementSection({ section, sectionType: _sectionType }: { section: FinancialStatementSection; sectionType: string }) {
  return (
    <div className="space-y-1">
      <p className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</p>
      {section.accounts.map((acct) => (
        <div key={acct.accountId} className="flex justify-between py-0.5 pl-6">
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
  );
}

export default function BalanceSheetContentPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]!);

  const { data: bs, isLoading } = useBalanceSheet({ asOfDate });

  return (
    <AccountingPageShell
      title="Balance Sheet"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Statements' },
        { label: 'Balance Sheet' },
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
            onClick={() => window.open(`/api/v1/accounting/statements/balance-sheet?asOfDate=${asOfDate}&format=csv`, '_blank')}
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
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && bs && (
        <div className="rounded-lg border border-border bg-surface p-6 space-y-8 font-mono text-sm">
          {/* Assets */}
          <div className="space-y-3">
            <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-foreground">Assets</h2>
            {bs.assets.map((section) => (
              <StatementSection key={section.label} section={section} sectionType="asset" />
            ))}
            <div className="flex justify-between border-t-2 border-border pt-2 font-bold">
              <span className="font-sans text-foreground">Total Assets</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(bs.totalAssets)}</span>
            </div>
          </div>

          {/* Liabilities */}
          <div className="space-y-3">
            <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-foreground">Liabilities</h2>
            {bs.liabilities.map((section) => (
              <StatementSection key={section.label} section={section} sectionType="liability" />
            ))}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span className="font-sans text-foreground">Total Liabilities</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(bs.totalLiabilities)}</span>
            </div>
          </div>

          {/* Equity */}
          <div className="space-y-3">
            <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-foreground">Equity</h2>
            {bs.equity.map((section) => (
              <StatementSection key={section.label} section={section} sectionType="equity" />
            ))}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span className="font-sans text-foreground">Total Equity</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(bs.totalEquity)}</span>
            </div>
          </div>

          {/* Total L+E */}
          <div className="flex justify-between border-t-2 border-border border-double pt-3 font-bold">
            <span className="font-sans text-base text-foreground">Total Liabilities & Equity</span>
            <span className="tabular-nums text-base text-foreground">
              {formatAccountingMoney(bs.totalLiabilities + bs.totalEquity)}
            </span>
          </div>

          {/* Balance check */}
          <div className={`flex items-center gap-2 rounded-lg p-3 ${bs.isBalanced ? 'border border-green-500/30 bg-green-500/10' : 'border border-red-500/30 bg-red-500/10'}`}>
            {bs.isBalanced ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-green-500">Assets = Liabilities + Equity</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-500">
                  OUT OF BALANCE — difference: {formatAccountingMoney(Math.abs(bs.totalAssets - bs.totalLiabilities - bs.totalEquity))}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
