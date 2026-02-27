'use client';

import { useState, useMemo } from 'react';
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Landmark,
  ArrowUpDown,
  Banknote,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { GLReadinessBanner } from '@/components/accounting/gl-readiness-banner';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { useReportFilters } from '@/hooks/use-report-filters';
import { useCashFlow } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

// ── Constants ─────────────────────────────────────────────────

type CashFlowSection = 'operating' | 'investing' | 'financing';

const SECTION_ORDER: CashFlowSection[] = ['operating', 'investing', 'financing'];

const SECTION_LABELS: Record<CashFlowSection, string> = {
  operating: 'Cash from Operating Activities',
  investing: 'Cash from Investing Activities',
  financing: 'Cash from Financing Activities',
};

const SECTION_COLORS: Record<CashFlowSection, string> = {
  operating: 'bg-green-500',
  investing: 'bg-indigo-500',
  financing: 'bg-amber-500',
};

const SECTION_ICONS: Record<CashFlowSection, typeof DollarSign> = {
  operating: TrendingUp,
  investing: Landmark,
  financing: Banknote,
};

// ── KPI Card ──────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent ?? 'text-muted-foreground'}`} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5">
        <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────

export default function CashFlowContent() {
  const { locations } = useAuthContext();
  const filters = useReportFilters({ defaultPreset: 'month_to_date' });
  const { data: cf, isLoading, mutate } = useCashFlow({
    startDate: filters.dateFrom,
    endDate: filters.dateTo,
  });

  // Section collapse state
  const [collapsed, setCollapsed] = useState<Set<CashFlowSection>>(new Set());

  const toggle = (section: CashFlowSection) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(section)) { next.delete(section); } else { next.add(section); }
      return next;
    });

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(SECTION_ORDER));

  // Resolve section data
  const sectionData: Record<CashFlowSection, { items: { label: string; amount: number }[]; net: number }> = useMemo(() => {
    if (!cf) return { operating: { items: [], net: 0 }, investing: { items: [], net: 0 }, financing: { items: [], net: 0 } };
    return {
      operating: { items: cf.operatingActivities, net: cf.netCashFromOperations },
      investing: { items: cf.investingActivities, net: cf.netCashFromInvesting },
      financing: { items: cf.financingActivities, net: cf.netCashFromFinancing },
    };
  }, [cf]);

  const netChange = cf?.netChangeInCash ?? 0;
  const beginBalance = cf?.beginningCashBalance ?? 0;
  const endBalance = cf?.endingCashBalance ?? 0;
  const isPositiveChange = netChange >= 0;

  // Export
  const handleExport = () => {
    const qs = buildQueryString({ from: filters.dateFrom, to: filters.dateTo, format: 'csv' });
    window.open(`/api/v1/accounting/statements/cash-flow${qs}`, '_blank');
  };

  const handlePrint = () => window.print();

  // ── Render ────────────────────────────────────────────────

  return (
    <AccountingPageShell
      title="Cash Flow Statement"
      breadcrumbs={[
        { label: 'Accounting' },
        { label: 'Statements' },
        { label: 'Cash Flow' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      <GLReadinessBanner />

      {/* ── Print Header ─────────────────────────────────── */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Cash Flow Statement</h1>
        <p className="text-sm text-muted-foreground">
          Period: {filters.dateFrom} to {filters.dateTo}
        </p>
      </div>

      {/* ── Filter Bar ───────────────────────────────────── */}
      <ReportFilterBar
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        preset={filters.preset}
        onDateChange={filters.setDateRange}
        locationId={filters.locationId}
        onLocationChange={filters.setLocationId}
        locations={locations}
        isLoading={isLoading}
        onRefresh={() => mutate()}
        onReset={filters.reset}
        hideLocation
        className="print:hidden"
      />

      {/* ── KPI Cards ────────────────────────────────────── */}
      {!isLoading && cf && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4 print:gap-2">
          <KPICard
            label="Net Cash from Operations"
            value={formatAccountingMoney(cf.netCashFromOperations)}
            icon={TrendingUp}
            accent="text-green-500"
          />
          <KPICard
            label="Net Change in Cash"
            value={formatAccountingMoney(netChange)}
            icon={isPositiveChange ? TrendingUp : TrendingDown}
            accent={isPositiveChange ? 'text-green-500' : 'text-red-500'}
          />
          <KPICard
            label="Beginning Balance"
            value={formatAccountingMoney(beginBalance)}
            icon={DollarSign}
          />
          <KPICard
            label="Ending Balance"
            value={formatAccountingMoney(endBalance)}
            icon={Banknote}
            accent="text-indigo-500"
          />
        </div>
      )}

      {/* ── Net Cash Change Banner ────────────────────────── */}
      {!isLoading && cf && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 ${
            isPositiveChange
              ? 'border-green-500/30 bg-green-500/10'
              : 'border-red-500/30 bg-red-500/10'
          }`}
        >
          <ArrowUpDown className={`h-4 w-4 shrink-0 ${isPositiveChange ? 'text-green-500' : 'text-red-500'}`} />
          <span className={`text-sm font-medium ${isPositiveChange ? 'text-green-500' : 'text-red-500'}`}>
            Net change in cash: {formatAccountingMoney(netChange)} — Ending balance: {formatAccountingMoney(endBalance)}
          </span>
        </div>
      )}

      {/* ── Expand/Collapse ──────────────────────────────── */}
      {!isLoading && cf && (
        <div className="flex items-center gap-3 print:hidden">
          <button type="button" onClick={expandAll} className="text-xs font-medium text-indigo-500 hover:underline">
            Expand All
          </button>
          <span className="text-muted-foreground">|</span>
          <button type="button" onClick={collapseAll} className="text-xs font-medium text-indigo-500 hover:underline">
            Collapse All
          </button>
        </div>
      )}

      {/* ── Loading Skeleton ─────────────────────────────── */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────── */}
      {!isLoading && !cf && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <ArrowUpDown className="h-10 w-10" />
          <p className="text-sm">No cash flow data for the selected period.</p>
        </div>
      )}

      {/* ── Desktop Table ────────────────────────────────── */}
      {!isLoading && cf && (
        <div className="hidden md:block overflow-hidden rounded-lg border border-border bg-surface print:block print:border-gray-300">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted print:bg-gray-100">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-48">
                  Amount
                </th>
              </tr>
            </thead>

            {SECTION_ORDER.map((section) => {
              const { items, net } = sectionData[section];
              const isCollapsed = collapsed.has(section);
              const SectionIcon = SECTION_ICONS[section];

              return (
                <tbody key={section} className="print:break-inside-avoid">
                  {/* Section header */}
                  <tr
                    className="cursor-pointer border-b border-border bg-muted/50 hover:bg-accent/50 print:bg-gray-50 print:cursor-default"
                    onClick={() => toggle(section)}
                  >
                    <td className="px-4 py-2.5" colSpan={2}>
                      <div className="flex items-center gap-2">
                        <span className="print:hidden">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className={`h-2.5 w-2.5 rounded-full ${SECTION_COLORS[section]} print:hidden`} />
                        <SectionIcon className="h-4 w-4 text-muted-foreground hidden print:inline" />
                        <span className="text-sm font-semibold text-foreground">
                          {SECTION_LABELS[section]}
                        </span>
                        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {items.length}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Items */}
                  {!isCollapsed && items.length > 0 &&
                    items.map((item, idx) => (
                      <tr key={idx} className="border-b border-border last:border-0 hover:bg-accent/50">
                        <td className="px-4 py-2 pl-12 text-sm text-foreground">{item.label}</td>
                        <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                          {formatAccountingMoney(item.amount)}
                        </td>
                      </tr>
                    ))}

                  {/* Empty section placeholder */}
                  {!isCollapsed && items.length === 0 && (
                    <tr className="border-b border-border">
                      <td colSpan={2} className="px-4 py-2 pl-12 text-sm italic text-muted-foreground">
                        No activity in this period
                      </td>
                    </tr>
                  )}

                  {/* Section subtotal */}
                  <tr className="border-b border-border bg-muted/30 print:bg-gray-50">
                    <td className="px-4 py-2 pl-12 text-right text-xs font-medium text-muted-foreground">
                      Net {SECTION_LABELS[section]}
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                      {formatAccountingMoney(net)}
                    </td>
                  </tr>
                </tbody>
              );
            })}

            {/* Summary footer */}
            <tfoot>
              <tr className="border-t-2 border-border bg-muted print:bg-gray-100">
                <td className="px-4 py-2.5 text-right text-sm font-bold text-foreground">
                  Net Change in Cash
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-foreground">
                  {formatAccountingMoney(netChange)}
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-2 text-right text-sm text-muted-foreground">
                  Beginning Cash Balance
                </td>
                <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                  {formatAccountingMoney(beginBalance)}
                </td>
              </tr>
              <tr className="border-t-2 border-border border-double bg-muted print:bg-gray-100">
                <td className="px-4 py-3 text-right text-base font-bold text-foreground">
                  Ending Cash Balance
                </td>
                <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-foreground">
                  {formatAccountingMoney(endBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Mobile Cards ─────────────────────────────────── */}
      {!isLoading && cf && (
        <div className="space-y-4 md:hidden print:hidden">
          {SECTION_ORDER.map((section) => {
            const { items, net } = sectionData[section];
            const isCollapsed = collapsed.has(section);
            const SectionIcon = SECTION_ICONS[section];

            return (
              <div key={section} className="rounded-lg border border-border bg-surface">
                {/* Section header */}
                <button
                  type="button"
                  onClick={() => toggle(section)}
                  className="flex w-full items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${SECTION_COLORS[section]}`} />
                    <SectionIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">{SECTION_LABELS[section]}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {/* Items */}
                {!isCollapsed && (
                  <div className="border-t border-border px-4 py-2 space-y-1">
                    {items.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground py-1">No activity in this period</p>
                    ) : (
                      items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1">
                          <span className="text-sm text-foreground">{item.label}</span>
                          <span className="text-sm tabular-nums text-foreground">
                            {formatAccountingMoney(item.amount)}
                          </span>
                        </div>
                      ))
                    )}
                    {/* Subtotal */}
                    <div className="flex items-center justify-between border-t border-border pt-2 mt-1">
                      <span className="text-xs font-medium text-muted-foreground">Net</span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {formatAccountingMoney(net)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary card */}
          <div className="rounded-lg border border-border bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm font-bold">
              <span>Net Change in Cash</span>
              <span className="tabular-nums">{formatAccountingMoney(netChange)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Beginning Balance</span>
              <span className="tabular-nums text-foreground">{formatAccountingMoney(beginBalance)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-border pt-2 text-base font-bold">
              <span>Ending Cash Balance</span>
              <span className="tabular-nums">{formatAccountingMoney(endBalance)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Print footer ─────────────────────────────────── */}
      <div className="hidden print:block print:mt-4 print:text-xs print:text-muted-foreground print:italic">
        Simplified cash flow statement. Generated {new Date().toLocaleDateString()}.
      </div>
    </AccountingPageShell>
  );
}
