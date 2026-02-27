'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Search,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  Landmark,
  Scale,
  X,
  FileText,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { GLReadinessBanner } from '@/components/accounting/gl-readiness-banner';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { useReportFilters } from '@/hooks/use-report-filters';
import { useBalanceSheet } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';
import type { FinancialStatementSection } from '@/types/accounting';
import { buildQueryString } from '@/lib/query-string';

// ── Category colors ──────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  assets: 'bg-green-500',
  liabilities: 'bg-amber-500',
  equity: 'bg-indigo-500',
};

function getSectionColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('current asset') || l.includes('cash')) return 'bg-green-500';
  if (l.includes('fixed') || l.includes('long-term asset') || l.includes('non-current asset')) return 'bg-emerald-500';
  if (l.includes('current liabilit')) return 'bg-amber-500';
  if (l.includes('long-term') || l.includes('non-current liabilit')) return 'bg-orange-500';
  if (l.includes('retained') || l.includes('equity') || l.includes('capital')) return 'bg-indigo-500';
  return 'bg-sky-500';
}

// ── KPI Card ─────────────────────────────────────────────────

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
        <span className={`text-xl font-semibold tabular-nums ${accent ?? 'text-foreground'}`}>{value}</span>
      </div>
    </div>
  );
}

// ── Section renderer ─────────────────────────────────────────

function renderCategory(
  category: string,
  categoryLabel: string,
  sections: FinancialStatementSection[],
  total: number,
  collapsedSections: Set<string>,
  toggleSection: (label: string) => void,
  search: string,
) {
  const q = search.toLowerCase();
  const filteredSections = search.trim()
    ? sections
        .map((s) => ({
          ...s,
          accounts: s.accounts.filter(
            (a) => a.accountName.toLowerCase().includes(q) || a.accountNumber.toLowerCase().includes(q),
          ),
        }))
        .filter((s) => s.accounts.length > 0)
    : sections;

  if (filteredSections.length === 0) return null;

  return (
    <React.Fragment key={category}>
      {/* Category header */}
      <tr className="print:break-inside-avoid">
        <td className="print:hidden" />
        <td colSpan={2} className="px-4 py-3 print:pl-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${CATEGORY_COLORS[category] ?? 'bg-gray-500'}`} />
            <span className="text-sm font-bold uppercase tracking-wider text-foreground">
              {categoryLabel}
            </span>
          </div>
        </td>
      </tr>

      {filteredSections.map((section) => {
        const isCollapsed = collapsedSections.has(`${category}-${section.label}`);
        const sectionKey = `${category}-${section.label}`;
        return (
          <React.Fragment key={sectionKey}>
            {/* Section header */}
            <tr
              className="cursor-pointer select-none border-b border-border bg-muted/40 transition-colors hover:bg-muted print:cursor-default print:bg-gray-50"
              onClick={() => toggleSection(sectionKey)}
            >
              <td className="w-8 px-2 py-2 print:hidden">
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </td>
              <td className="px-4 py-2 print:pl-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${getSectionColor(section.label)}`} />
                  <span className="text-sm font-semibold text-foreground">{section.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground print:bg-gray-200">
                    {section.accounts.length}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
                {formatAccountingMoney(section.subtotal)}
              </td>
            </tr>

            {/* Account rows */}
            {!isCollapsed &&
              section.accounts.map((acct) => (
                <tr
                  key={acct.accountId}
                  className="border-b border-border/50 transition-colors last:border-border hover:bg-accent/30"
                >
                  <td className="print:hidden" />
                  <td className="py-2 pl-12 pr-4 text-sm text-foreground print:pl-8">
                    <span className="font-mono text-muted-foreground mr-2">{acct.accountNumber}</span>
                    {acct.accountName}
                  </td>
                  <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                    {formatAccountingMoney(acct.amount)}
                  </td>
                </tr>
              ))}
          </React.Fragment>
        );
      })}

      {/* Category total */}
      <tr className="border-b border-border bg-muted/30 print:bg-gray-50">
        <td className="print:hidden" />
        <td className="px-4 py-2 text-right text-sm font-semibold text-foreground">
          Total {categoryLabel}
        </td>
        <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-foreground">
          {formatAccountingMoney(total)}
        </td>
      </tr>
    </React.Fragment>
  );
}

// ── Main Component ───────────────────────────────────────────

import React from 'react';

export default function BalanceSheetContent() {
  const { locations } = useAuthContext();
  const filters = useReportFilters({ defaultPreset: 'today' });

  const { data: bs, isLoading, mutate } = useBalanceSheet({
    asOfDate: filters.dateTo,
    locationId: filters.selectedLocationId,
  });

  // ── Local state ────────────────────────────────────────────

  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // ── Derived ────────────────────────────────────────────────

  const totalAccounts = useMemo(() => {
    if (!bs) return 0;
    return (
      bs.assets.reduce((s, sec) => s + sec.accounts.length, 0) +
      bs.liabilities.reduce((s, sec) => s + sec.accounts.length, 0) +
      bs.equity.reduce((s, sec) => s + sec.accounts.length, 0)
    );
  }, [bs]);

  const difference = bs ? Math.abs(bs.totalAssets - bs.totalLiabilities - bs.totalEquity) : 0;

  // ── Handlers ───────────────────────────────────────────────

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseAll = useCallback(() => {
    if (!bs) return;
    const keys = new Set<string>();
    bs.assets.forEach((s) => keys.add(`assets-${s.label}`));
    bs.liabilities.forEach((s) => keys.add(`liabilities-${s.label}`));
    bs.equity.forEach((s) => keys.add(`equity-${s.label}`));
    setCollapsedSections(keys);
  }, [bs]);

  const handleExport = () => {
    const qs = buildQueryString({
      asOfDate: filters.dateTo,
      locationId: filters.selectedLocationId,
      format: 'csv',
    });
    window.open(`/api/v1/accounting/statements/balance-sheet${qs}`, '_blank');
  };

  const locationName = useMemo(() => {
    if (!filters.selectedLocationId) return 'All Locations';
    return locations.find((l) => l.id === filters.selectedLocationId)?.name ?? 'Unknown';
  }, [filters.selectedLocationId, locations]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <AccountingPageShell
      title="Balance Sheet"
      breadcrumbs={[
        { label: 'Statements', href: '/accounting/statements/balance-sheet' },
        { label: 'Balance Sheet' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!bs}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!bs}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      <GLReadinessBanner />

      {/* Filters */}
      <div className="print:hidden">
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
        />
      </div>

      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h2 className="text-lg font-bold">Balance Sheet</h2>
        <div className="mt-1 flex gap-4 text-sm text-gray-600">
          <span>As of: {filters.dateTo}</span>
          <span>Location: {locationName}</span>
          <span>Generated: {new Date().toLocaleString()}</span>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-4">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-6 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !bs && (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">No Balance Sheet Data</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No financial data found for the selected date and location.
          </p>
        </div>
      )}

      {/* Report content */}
      {!isLoading && bs && (
        <div className="space-y-4">
          {/* KPI summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
            <KPICard
              label="Total Assets"
              value={formatAccountingMoney(bs.totalAssets)}
              icon={DollarSign}
              accent="text-green-500"
            />
            <KPICard
              label="Total Liabilities"
              value={formatAccountingMoney(bs.totalLiabilities)}
              icon={Landmark}
              accent="text-amber-500"
            />
            <KPICard
              label="Total Equity"
              value={formatAccountingMoney(bs.totalEquity)}
              icon={Scale}
              accent="text-indigo-500"
            />
            <KPICard
              label="Balance Status"
              value={bs.isBalanced ? 'A = L + E' : `Variance: ${formatAccountingMoney(difference)}`}
              icon={bs.isBalanced ? CheckCircle : AlertTriangle}
              accent={bs.isBalanced ? 'text-green-500' : 'text-red-500'}
            />
          </div>

          {/* Balance status banner */}
          <div
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 print:border-gray-300 print:bg-gray-50 ${
              bs.isBalanced
                ? 'border-green-500/30 bg-green-500/10'
                : 'border-red-500/30 bg-red-500/10'
            }`}
          >
            {bs.isBalanced ? (
              <>
                <CheckCircle className="h-5 w-5 shrink-0 text-green-500 print:text-gray-600" />
                <span className="text-sm font-medium text-green-500 print:text-gray-700">
                  Assets = Liabilities + Equity. Balance sheet is balanced as of {filters.dateTo}.
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                <span className="text-sm font-medium text-red-500">
                  OUT OF BALANCE — difference of {formatAccountingMoney(difference)}. Assets do not
                  equal Liabilities + Equity.
                </span>
              </>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by account..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button type="button" onClick={expandAll} className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                Expand All
              </button>
              <span className="text-border">|</span>
              <button type="button" onClick={collapseAll} className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                Collapse All
              </button>
            </div>
          </div>

          {/* Print metadata */}
          <div className="hidden print:flex print:justify-between print:text-xs print:text-gray-500 print:border-b print:border-gray-300 print:pb-2">
            <span>Location: {locationName}</span>
            <span>{totalAccounts} accounts</span>
            <span>Generated: {new Date().toLocaleString()}</span>
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block print:block print:border-gray-300">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted print:bg-gray-100 print:border-gray-300">
                    <th className="w-8 px-2 py-3 print:hidden" />
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Account
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {renderCategory('assets', 'Assets', bs.assets, bs.totalAssets, collapsedSections, toggleSection, search)}
                  {renderCategory('liabilities', 'Liabilities', bs.liabilities, bs.totalLiabilities, collapsedSections, toggleSection, search)}
                  {renderCategory('equity', 'Equity', bs.equity, bs.totalEquity, collapsedSections, toggleSection, search)}
                </tbody>
                <tfoot>
                  {/* Total L+E */}
                  <tr className="border-t border-border bg-muted/40 print:bg-gray-50">
                    <td className="print:hidden" />
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">
                      Total Liabilities & Equity
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">
                      {formatAccountingMoney(bs.totalLiabilities + bs.totalEquity)}
                    </td>
                  </tr>
                  {/* Balance check */}
                  <tr className="border-t-2 border-border bg-muted font-bold print:bg-gray-100 print:border-gray-400">
                    <td className="print:hidden" />
                    <td className="px-4 py-3 text-right text-sm text-foreground">
                      <span className="flex items-center justify-end gap-1.5">
                        {bs.isBalanced ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {bs.isBalanced ? 'Balanced' : 'Variance'}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right text-sm tabular-nums ${
                        bs.isBalanced ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {bs.isBalanced ? '$0.00' : formatAccountingMoney(difference)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-4 md:hidden print:hidden">
            {/* Assets */}
            {bs.assets.length > 0 && (
              <MobileCategory
                category="assets"
                label="Assets"
                sections={bs.assets}
                total={bs.totalAssets}
                collapsedSections={collapsedSections}
                toggleSection={toggleSection}
                search={search}
              />
            )}
            {/* Liabilities */}
            {bs.liabilities.length > 0 && (
              <MobileCategory
                category="liabilities"
                label="Liabilities"
                sections={bs.liabilities}
                total={bs.totalLiabilities}
                collapsedSections={collapsedSections}
                toggleSection={toggleSection}
                search={search}
              />
            )}
            {/* Equity */}
            {bs.equity.length > 0 && (
              <MobileCategory
                category="equity"
                label="Equity"
                sections={bs.equity}
                total={bs.totalEquity}
                collapsedSections={collapsedSections}
                toggleSection={toggleSection}
                search={search}
              />
            )}

            {/* Mobile totals */}
            <div className="rounded-lg border border-border bg-muted p-4 space-y-2">
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total Assets</span>
                <span className="tabular-nums">{formatAccountingMoney(bs.totalAssets)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-foreground">
                <span>Total L + E</span>
                <span className="tabular-nums">{formatAccountingMoney(bs.totalLiabilities + bs.totalEquity)}</span>
              </div>
              <div className="border-t border-border pt-2">
                <div
                  className={`flex justify-between text-sm font-bold ${
                    bs.isBalanced ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {bs.isBalanced ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {bs.isBalanced ? 'Balanced' : 'Variance'}
                  </span>
                  <span className="tabular-nums">
                    {bs.isBalanced ? '$0.00' : formatAccountingMoney(difference)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AccountingPageShell>
  );
}

// ── Mobile Category Component ────────────────────────────────

function MobileCategory({
  category,
  label,
  sections,
  total,
  collapsedSections,
  toggleSection,
  search,
}: {
  category: string;
  label: string;
  sections: FinancialStatementSection[];
  total: number;
  collapsedSections: Set<string>;
  toggleSection: (key: string) => void;
  search: string;
}) {
  const q = search.toLowerCase();
  const filtered = search.trim()
    ? sections
        .map((s) => ({
          ...s,
          accounts: s.accounts.filter(
            (a) => a.accountName.toLowerCase().includes(q) || a.accountNumber.toLowerCase().includes(q),
          ),
        }))
        .filter((s) => s.accounts.length > 0)
    : sections;

  if (filtered.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
        <span className={`h-3 w-3 rounded-full ${CATEGORY_COLORS[category] ?? 'bg-gray-500'}`} />
        {label}
      </h3>
      {filtered.map((section) => {
        const key = `${category}-${section.label}`;
        const isCollapsed = collapsedSections.has(key);
        return (
          <div key={key} className="overflow-hidden rounded-lg border border-border bg-surface">
            <button
              type="button"
              onClick={() => toggleSection(key)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <span className={`h-2 w-2 rounded-full ${getSectionColor(section.label)}`} />
                <span className="text-sm font-semibold text-foreground">{section.label}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {section.accounts.length}
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatAccountingMoney(section.subtotal)}
              </span>
            </button>
            {!isCollapsed && (
              <div className="border-t border-border/50 divide-y divide-border/30">
                {section.accounts.map((acct) => (
                  <div key={acct.accountId} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground mr-1.5">{acct.accountNumber}</span>
                      <span className="text-sm text-foreground">{acct.accountName}</span>
                    </div>
                    <span className="text-sm tabular-nums text-foreground">{formatAccountingMoney(acct.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex justify-between rounded-lg bg-muted/50 px-4 py-2 text-sm font-semibold text-foreground">
        <span>Total {label}</span>
        <span className="tabular-nums">{formatAccountingMoney(total)}</span>
      </div>
    </div>
  );
}
