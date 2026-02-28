'use client';

import { useState, useMemo } from 'react';
import {
  DollarSign,
  ReceiptText,
  ShoppingCart,
  UtensilsCrossed,
  Building2,
  FileText,
  CreditCard,
  Ticket,
  CircleDot,
  Loader2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Scale,
  BookOpen,
} from 'lucide-react';
import { useSalesHistory, type SalesHistoryFilters } from '@/hooks/use-sales-history';
import { useProfitAndLoss } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';

const SOURCE_ICONS: Record<string, typeof ShoppingCart> = {
  pos_retail: ShoppingCart,
  pos_fnb: UtensilsCrossed,
  pms_folio: Building2,
  ar_invoice: FileText,
  membership: CreditCard,
  voucher: Ticket,
};

const SOURCE_COLORS: Record<string, string> = {
  pos_retail: 'bg-blue-500',
  pos_fnb: 'bg-orange-500',
  pms_folio: 'bg-purple-500',
  ar_invoice: 'bg-emerald-500',
  membership: 'bg-amber-500',
  voucher: 'bg-pink-500',
};

const SOURCE_LABELS: Record<string, string> = {
  pos_retail: 'Retail POS',
  pos_fnb: 'F&B POS',
  pms_folio: 'Room Charges',
  ar_invoice: 'AR Invoices',
  membership: 'Membership',
  voucher: 'Vouchers',
  pos_order: 'POS Order',
};

type DateRange = '7d' | '30d' | 'mtd' | 'ytd' | 'custom';

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);

  switch (range) {
    case '7d': {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().slice(0, 10), to };
    }
    case '30d': {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString().slice(0, 10), to };
    }
    case 'mtd': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.toISOString().slice(0, 10), to };
    }
    case 'ytd': {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d.toISOString().slice(0, 10), to };
    }
    default:
      return { from: to, to };
  }
}

function getSourceLabel(source: string) {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RevenueReconciliationTab() {
  const [range, setRange] = useState<DateRange>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const dates = useMemo(() => {
    if (range === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    return getDateRange(range);
  }, [range, customFrom, customTo]);

  // Sales pipeline data (from rm_revenue_activity — recorded on order placement)
  const salesFilters: SalesHistoryFilters = useMemo(
    () => ({ dateFrom: dates.from, dateTo: dates.to }),
    [dates],
  );
  const { summary: salesSummary, isLoading: salesLoading } = useSalesHistory(salesFilters);

  // GL data (from journal entries — recorded on tender/payment)
  const { data: pnl, isLoading: glLoading } = useProfitAndLoss({
    startDate: dates.from,
    endDate: dates.to,
  });

  const isLoading = salesLoading || glLoading;

  // Computed reconciliation values
  const salesRevenue = salesSummary?.totalAmount ?? 0;
  const glRevenue = pnl?.totalRevenue ?? 0;
  const variance = salesRevenue - glRevenue;
  const varianceAbs = Math.abs(variance);
  const variancePct = salesRevenue > 0 ? (varianceAbs / salesRevenue) * 100 : 0;
  const isReconciled = varianceAbs < 0.01;

  // Source breakdown with percentages
  const sourcesWithPct = useMemo(() => {
    if (!salesSummary || salesSummary.totalAmount === 0) return [];
    return salesSummary.bySource.map((s) => ({
      ...s,
      pct: (s.totalAmount / salesSummary.totalAmount) * 100,
    }));
  }, [salesSummary]);

  // GL P&L breakdown for revenue sections
  const glRevenueSections = useMemo(() => {
    if (!pnl) return [];
    return pnl.sections.filter((s) => s.subtotal > 0 || s.accounts.some((a) => a.amount !== 0));
  }, [pnl]);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Period:</span>
        {(['7d', '30d', 'mtd', 'ytd'] as DateRange[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              range === r
                ? 'bg-indigo-600 text-white'
                : 'bg-surface border border-input text-foreground hover:bg-accent'
            }`}
          >
            {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : r === 'mtd' ? 'Month to Date' : 'Year to Date'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRange('custom')}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            range === 'custom'
              ? 'bg-indigo-600 text-white'
              : 'bg-surface border border-input text-foreground hover:bg-accent'
          }`}
        >
          Custom
        </button>
        {range === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-input bg-surface px-2 py-1 text-sm text-foreground"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-input bg-surface px-2 py-1 text-sm text-foreground"
            />
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Loading reconciliation data...</p>
        </div>
      ) : (
        <>
          {/* Reconciliation status banner */}
          <div
            className={`flex items-center gap-3 rounded-lg border p-4 ${
              isReconciled
                ? 'border-green-500/30 bg-green-500/10'
                : 'border-amber-500/30 bg-amber-500/10'
            }`}
          >
            {isReconciled ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            )}
            <div>
              <p className={`text-sm font-medium ${isReconciled ? 'text-green-500' : 'text-amber-500'}`}>
                {isReconciled
                  ? 'Revenue is fully reconciled'
                  : `Variance of ${formatAccountingMoney(varianceAbs)} (${variancePct.toFixed(1)}%) between sales pipeline and GL`}
              </p>
              {!isReconciled && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {variance > 0
                    ? 'Sales pipeline shows more revenue than GL — likely unpaid orders or pending tenders'
                    : 'GL shows more revenue than sales pipeline — possible manual journal entries or prior-period adjustments'}
                </p>
              )}
            </div>
          </div>

          {/* Side-by-side comparison cards */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Sales Pipeline */}
            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-500/10 p-2">
                  <ReceiptText className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sales Pipeline</p>
                  <p className="text-[10px] text-muted-foreground">All orders placed</p>
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
                {formatAccountingMoney(salesRevenue)}
              </p>
              {salesSummary && (
                <p className="text-xs text-muted-foreground">
                  {salesSummary.totalCount.toLocaleString()} transactions
                </p>
              )}
            </div>

            {/* Arrow / Variance */}
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface p-5">
              <ArrowRight className="hidden h-6 w-6 text-muted-foreground lg:block" />
              <div className="mt-2 text-center">
                <p className="text-xs font-medium text-muted-foreground">Variance</p>
                <p
                  className={`text-xl font-bold tabular-nums ${
                    isReconciled ? 'text-green-500' : variance > 0 ? 'text-amber-500' : 'text-red-500'
                  }`}
                >
                  {variance >= 0 ? '+' : ''}{formatAccountingMoney(variance)}
                </p>
                {!isReconciled && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {variancePct.toFixed(1)}% of sales
                  </p>
                )}
              </div>
            </div>

            {/* GL Revenue */}
            <div className="rounded-lg border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-green-500/10 p-2">
                  <BookOpen className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">GL Revenue</p>
                  <p className="text-[10px] text-muted-foreground">Posted journal entries</p>
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
                {formatAccountingMoney(glRevenue)}
              </p>
              {pnl && (
                <p className="text-xs text-muted-foreground">
                  Net Income: {formatAccountingMoney(pnl.netIncome)}
                </p>
              )}
            </div>
          </div>

          {/* GL P&L Summary */}
          {pnl && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Scale className="h-4 w-4 text-muted-foreground" />
                GL Profit & Loss Summary
              </h3>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Gross Revenue</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatAccountingMoney(pnl.grossRevenue)}
                  </span>
                </div>
                {pnl.contraRevenue !== 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Less: Contra Revenue</span>
                    <span className="text-sm tabular-nums text-red-500">
                      ({formatAccountingMoney(Math.abs(pnl.contraRevenue))})
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-sm font-medium text-foreground">Net Revenue</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {formatAccountingMoney(pnl.totalRevenue)}
                  </span>
                </div>
                {pnl.totalCogs !== 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Less: Cost of Goods Sold</span>
                    <span className="text-sm tabular-nums text-red-500">
                      ({formatAccountingMoney(Math.abs(pnl.totalCogs))})
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-sm font-medium text-foreground">Gross Profit</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {formatAccountingMoney(pnl.grossProfit)}
                  </span>
                </div>
                {pnl.totalExpenses !== 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Less: Operating Expenses</span>
                    <span className="text-sm tabular-nums text-red-500">
                      ({formatAccountingMoney(Math.abs(pnl.totalExpenses))})
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t-2 border-border pt-2">
                  <span className="text-sm font-semibold text-foreground">Net Income</span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      pnl.netIncome >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {formatAccountingMoney(pnl.netIncome)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Revenue by Source from sales pipeline */}
          {salesSummary && sourcesWithPct.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Sales Pipeline by Source
              </h3>

              {/* Stacked bar */}
              <div className="mt-4 flex h-4 overflow-hidden rounded-full">
                {sourcesWithPct.map((s) => (
                  <div
                    key={s.source}
                    className={`${SOURCE_COLORS[s.source] ?? 'bg-gray-500'}`}
                    style={{ width: `${Math.max(s.pct, 1)}%` }}
                    title={`${getSourceLabel(s.source)}: ${formatAccountingMoney(s.totalAmount)} (${s.pct.toFixed(1)}%)`}
                  />
                ))}
              </div>

              {/* Legend + details */}
              <div className="mt-4 space-y-2">
                {sourcesWithPct.map((s) => {
                  const Icon = SOURCE_ICONS[s.source] ?? CircleDot;
                  return (
                    <div key={s.source} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-sm ${SOURCE_COLORS[s.source] ?? 'bg-gray-500'}`} />
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">{getSourceLabel(s.source)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {s.count} txns
                        </span>
                        <span className="min-w-[80px] text-right text-sm font-semibold tabular-nums text-foreground">
                          {formatAccountingMoney(s.totalAmount)}
                        </span>
                        <span className="min-w-[50px] text-right text-xs tabular-nums text-muted-foreground">
                          {s.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total footer */}
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {salesSummary.totalCount} txns
                  </span>
                  <span className="min-w-[80px] text-right text-sm font-bold tabular-nums text-foreground">
                    {formatAccountingMoney(salesSummary.totalAmount)}
                  </span>
                  <span className="min-w-[50px] text-right text-xs tabular-nums text-muted-foreground">
                    100%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* GL Revenue account detail */}
          {glRevenueSections.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                GL Revenue Account Detail
              </h3>
              <div className="mt-4 space-y-3">
                {glRevenueSections.map((section) => (
                  <div key={section.label}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{section.label}</span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatAccountingMoney(section.subtotal)}
                      </span>
                    </div>
                    {section.accounts.length > 0 && (
                      <div className="mt-1 ml-4 space-y-0.5">
                        {section.accounts
                          .filter((a) => a.amount !== 0)
                          .map((a) => (
                            <div key={a.accountId} className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {a.accountNumber} — {a.accountName}
                              </span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {formatAccountingMoney(a.amount)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Explanation note */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">How reconciliation works:</strong>{' '}
              The Sales Pipeline records revenue when an order is placed. GL Revenue records
              revenue when payment is received (tender posted). A positive variance means some orders
              have not been paid yet — this is normal for open tabs, house accounts, and AR invoices.
              A negative variance may indicate manual journal entries, prior-period adjustments, or
              GL postings from sources not captured in the sales pipeline.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
