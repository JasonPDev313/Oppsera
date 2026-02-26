'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useCashFlow } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';

function getMonthRange() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const end = now.toISOString().split('T')[0]!;
  return { start, end };
}

export default function CashFlowContent() {
  const range = getMonthRange();
  const [startDate, setStartDate] = useState(range.start);
  const [endDate, setEndDate] = useState(range.end);

  const { data: cf, isLoading } = useCashFlow({ startDate, endDate });

  return (
    <AccountingPageShell
      title="Cash Flow Statement"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Statements' },
        { label: 'Cash Flow' },
      ]}
      actions={
        <button
          type="button"
          onClick={() => window.open(`/api/v1/accounting/statements/cash-flow?from=${startDate}&to=${endDate}&format=csv`, '_blank')}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      }
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && cf && (
        <div className="rounded-lg border border-border bg-surface p-6 space-y-6 font-mono text-sm">
          {/* Operating */}
          <div className="space-y-1">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">Operating Activities</p>
            {cf.operatingActivities.map((item, idx) => (
              <div key={idx} className="flex justify-between py-0.5 pl-4">
                <span className="text-foreground">{item.label}</span>
                <span className="tabular-nums text-foreground">{formatAccountingMoney(item.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 pl-4 font-semibold">
              <span className="text-foreground">Net Cash from Operations</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(cf.netCashFromOperations)}</span>
            </div>
          </div>

          {/* Investing */}
          <div className="space-y-1">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">Investing Activities</p>
            {cf.investingActivities.length === 0 ? (
              <p className="pl-4 text-muted-foreground italic">(No data — future module)</p>
            ) : (
              cf.investingActivities.map((item, idx) => (
                <div key={idx} className="flex justify-between py-0.5 pl-4">
                  <span className="text-foreground">{item.label}</span>
                  <span className="tabular-nums text-foreground">{formatAccountingMoney(item.amount)}</span>
                </div>
              ))
            )}
            <div className="flex justify-between border-t border-border pt-1 pl-4 font-semibold">
              <span className="text-foreground">Net Cash from Investing</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(cf.netCashFromInvesting)}</span>
            </div>
          </div>

          {/* Financing */}
          <div className="space-y-1">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">Financing Activities</p>
            {cf.financingActivities.length === 0 ? (
              <p className="pl-4 text-muted-foreground italic">(No data — future module)</p>
            ) : (
              cf.financingActivities.map((item, idx) => (
                <div key={idx} className="flex justify-between py-0.5 pl-4">
                  <span className="text-foreground">{item.label}</span>
                  <span className="tabular-nums text-foreground">{formatAccountingMoney(item.amount)}</span>
                </div>
              ))
            )}
            <div className="flex justify-between border-t border-border pt-1 pl-4 font-semibold">
              <span className="text-foreground">Net Cash from Financing</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(cf.netCashFromFinancing)}</span>
            </div>
          </div>

          {/* Summary */}
          <div className="border-t-2 border-border pt-4 space-y-2">
            <div className="flex justify-between font-semibold">
              <span className="font-sans text-foreground">Net Change in Cash</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(cf.netChangeInCash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-muted-foreground">Beginning Cash Balance</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(cf.beginningCashBalance)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-border border-double pt-2 font-bold">
              <span className="font-sans text-base text-foreground">Ending Cash Balance</span>
              <span className="tabular-nums text-base text-foreground">{formatAccountingMoney(cf.endingCashBalance)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic font-sans">
            This is a simplified cash flow statement. Full indirect method available in a future update.
          </p>
        </div>
      )}
    </AccountingPageShell>
  );
}
