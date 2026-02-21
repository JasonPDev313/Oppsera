'use client';

import { useState } from 'react';
import { Download, Printer, AlertTriangle, CheckCircle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useBalanceSheet } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';
import type { FinancialStatementSection } from '@/types/accounting';

function StatementSection({ section, sectionType }: { section: FinancialStatementSection; sectionType: string }) {
  return (
    <div className="space-y-1">
      <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">{section.label}</p>
      {section.accounts.map((acct) => (
        <div key={acct.accountId} className="flex justify-between py-0.5 pl-6">
          <span className="text-gray-700">
            <span className="text-gray-400 mr-2">{acct.accountNumber}</span>
            {acct.accountName}
          </span>
          <span className="tabular-nums text-gray-900">{formatAccountingMoney(acct.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-gray-200 pt-1 pl-4 font-semibold">
        <span className="text-gray-700">Total {section.label}</span>
        <span className="tabular-nums text-gray-900">{formatAccountingMoney(section.subtotal)}</span>
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
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={() => window.open(`/api/v1/accounting/statements/balance-sheet?asOfDate=${asOfDate}&format=csv`, '_blank')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">As of Date</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      )}

      {!isLoading && bs && (
        <div className="rounded-lg border border-gray-200 bg-surface p-6 space-y-8 font-mono text-sm">
          {/* Assets */}
          <div className="space-y-3">
            <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-gray-800">Assets</h2>
            {bs.assets.map((section) => (
              <StatementSection key={section.label} section={section} sectionType="asset" />
            ))}
            <div className="flex justify-between border-t-2 border-gray-300 pt-2 font-bold">
              <span className="font-sans text-gray-900">Total Assets</span>
              <span className="tabular-nums text-gray-900">{formatAccountingMoney(bs.totalAssets)}</span>
            </div>
          </div>

          {/* Liabilities */}
          <div className="space-y-3">
            <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-gray-800">Liabilities</h2>
            {bs.liabilities.map((section) => (
              <StatementSection key={section.label} section={section} sectionType="liability" />
            ))}
            <div className="flex justify-between border-t border-gray-300 pt-2 font-semibold">
              <span className="font-sans text-gray-900">Total Liabilities</span>
              <span className="tabular-nums text-gray-900">{formatAccountingMoney(bs.totalLiabilities)}</span>
            </div>
          </div>

          {/* Equity */}
          <div className="space-y-3">
            <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-gray-800">Equity</h2>
            {bs.equity.map((section) => (
              <StatementSection key={section.label} section={section} sectionType="equity" />
            ))}
            <div className="flex justify-between border-t border-gray-300 pt-2 font-semibold">
              <span className="font-sans text-gray-900">Total Equity</span>
              <span className="tabular-nums text-gray-900">{formatAccountingMoney(bs.totalEquity)}</span>
            </div>
          </div>

          {/* Total L+E */}
          <div className="flex justify-between border-t-2 border-gray-400 border-double pt-3 font-bold">
            <span className="font-sans text-base text-gray-900">Total Liabilities & Equity</span>
            <span className="tabular-nums text-base text-gray-900">
              {formatAccountingMoney(bs.totalLiabilities + bs.totalEquity)}
            </span>
          </div>

          {/* Balance check */}
          <div className={`flex items-center gap-2 rounded-lg p-3 ${bs.isBalanced ? 'border border-green-300 bg-green-50' : 'border border-red-300 bg-red-50'}`}>
            {bs.isBalanced ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Assets = Liabilities + Equity</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">
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
