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
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={() => window.open(`/api/v1/accounting/statements/profit-loss?startDate=${startDate}&endDate=${endDate}&format=csv`, '_blank')}
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
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={comparative}
            onChange={(e) => setComparative(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">Show prior period</span>
        </label>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      )}

      {!isLoading && pnl && (
        <div className="rounded-lg border border-gray-200 bg-surface p-6 space-y-6 font-mono text-sm">
          {pnl.sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">{section.label}</p>
              {section.accounts.map((acct) => (
                <div key={acct.accountId} className="flex justify-between py-0.5 pl-4">
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
          ))}

          {/* Summary */}
          <div className="border-t-2 border-gray-300 pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="font-sans font-medium text-gray-700">Gross Profit</span>
              <span className="tabular-nums font-semibold text-gray-900">{formatAccountingMoney(pnl.grossProfit)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-gray-400 border-double pt-2">
              <span className="font-sans text-base font-bold text-gray-900">Net Income</span>
              <span className={`tabular-nums text-base font-bold ${pnl.netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatAccountingMoney(pnl.netIncome)}
              </span>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}
