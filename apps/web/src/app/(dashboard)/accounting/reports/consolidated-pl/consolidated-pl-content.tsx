'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Search,
  DollarSign,
  TrendingDown,
  TrendingUp,
  MapPin,
  X,
  Building2,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { DrillDownDrawer, DrillDownAmount } from '@/components/accounting/drill-down-drawer';
import { useConsolidatedPL } from '@/hooks/use-statements';
import type {
  LocationPnl,
  ConsolidatedPLSection,
} from '@/hooks/use-statements';
import { useLocations } from '@/hooks/use-locations';
import { formatAccountingMoney } from '@/types/accounting';

// ── Constants ─────────────────────────────────────────────────

const _SECTION_KIND_ORDER = ['revenue', 'contra', 'expense'] as const;

function classifySection(label: string): 'revenue' | 'contra' | 'expense' {
  if (label.toLowerCase().startsWith('less:')) return 'contra';
  // The backend puts revenue sections first, then contra, then expense
  // We use the label to detect expense sections — anything not revenue/contra
  return 'revenue';
}

const SECTION_KIND_COLORS: Record<string, string> = {
  revenue: 'bg-green-500',
  contra: 'bg-amber-500',
  expense: 'bg-red-500',
};

// ── Helpers ───────────────────────────────────────────────────

function getDateRangeDefaults() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

/** Build a union of all section labels across locations + consolidated */
function collectAllSectionLabels(
  locations: LocationPnl[],
  consolidated: { sections: ConsolidatedPLSection[] },
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  // Use consolidated order as canonical
  for (const s of consolidated.sections) {
    if (!seen.has(s.label)) {
      seen.add(s.label);
      ordered.push(s.label);
    }
  }
  // Add any location-only sections
  for (const loc of locations) {
    for (const s of loc.sections) {
      if (!seen.has(s.label)) {
        seen.add(s.label);
        ordered.push(s.label);
      }
    }
  }
  return ordered;
}

/** Build a union of all account IDs within a section across all locations */
function collectAccountsForSection(
  sectionLabel: string,
  locations: LocationPnl[],
  consolidated: { sections: ConsolidatedPLSection[] },
) {
  const map = new Map<
    string,
    { accountId: string; accountNumber: string; accountName: string }
  >();
  const consSection = consolidated.sections.find(
    (s) => s.label === sectionLabel,
  );
  if (consSection) {
    for (const a of consSection.accounts) {
      if (!map.has(a.accountId)) {
        map.set(a.accountId, {
          accountId: a.accountId,
          accountNumber: a.accountNumber,
          accountName: a.accountName,
        });
      }
    }
  }
  for (const loc of locations) {
    const sec = loc.sections.find((s) => s.label === sectionLabel);
    if (sec) {
      for (const a of sec.accounts) {
        if (!map.has(a.accountId)) {
          map.set(a.accountId, {
            accountId: a.accountId,
            accountNumber: a.accountNumber,
            accountName: a.accountName,
          });
        }
      }
    }
  }
  // Sort by account number
  return Array.from(map.values()).sort((a, b) =>
    a.accountNumber.localeCompare(b.accountNumber),
  );
}

/** Get amount for an account in a location's section */
function getLocationAmount(
  loc: LocationPnl,
  sectionLabel: string,
  accountId: string,
): number {
  const sec = loc.sections.find((s) => s.label === sectionLabel);
  if (!sec) return 0;
  const acct = sec.accounts.find((a) => a.accountId === accountId);
  return acct?.amount ?? 0;
}

/** Get section subtotal for a location */
function getLocationSectionSubtotal(
  loc: LocationPnl,
  sectionLabel: string,
): number {
  return loc.sections.find((s) => s.label === sectionLabel)?.subtotal ?? 0;
}

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
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-1.5">
        <span className="text-xl font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Location Multi-Select ─────────────────────────────────────

function LocationMultiSelect({
  locations,
  selected,
  onChange,
}: {
  locations: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const label =
    selected.length === 0
      ? 'All Locations'
      : selected.length === 1
        ? locations.find((l) => l.id === selected[0])?.name ?? '1 location'
        : `${selected.length} locations`;

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        Locations
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-accent min-w-44"
      >
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-56 rounded-lg border border-border bg-surface shadow-lg">
            <div className="max-h-60 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
                  selected.length === 0
                    ? 'bg-indigo-500/10 text-indigo-500'
                    : 'text-foreground hover:bg-accent'
                }`}
              >
                All Locations
              </button>
              {locations.map((loc) => (
                <label
                  key={loc.id}
                  className="flex items-center gap-2 rounded px-3 py-2 text-sm text-foreground cursor-pointer hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(loc.id)}
                    onChange={() => toggle(loc.id)}
                    className="rounded border-border"
                  />
                  {loc.name}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function ConsolidatedPLContent() {
  // ── Date filters ────────────────────────────────────────────
  const defaults = useMemo(() => getDateRangeDefaults(), []);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

  const { data: allLocations, isLoading: _locationsLoading } = useLocations();

  const { data, isLoading, mutate } = useConsolidatedPL({
    from: fromDate,
    to: toDate,
    locationIds: selectedLocationIds.length > 0 ? selectedLocationIds : undefined,
  });

  // ── Local state ─────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );
  const [drillDown, setDrillDown] = useState<{
    accountId: string;
    accountName: string;
    locationId?: string;
  } | null>(null);

  // ── Derived data ────────────────────────────────────────────
  const allSectionLabels = useMemo(
    () => collectAllSectionLabels(data.locations, data.consolidated),
    [data.locations, data.consolidated],
  );

  // Classify sections
  const sectionsByKind = useMemo(() => {
    const revenue: string[] = [];
    const contra: string[] = [];
    const expense: string[] = [];
    for (const label of allSectionLabels) {
      const kind = classifySection(label);
      if (kind === 'contra') contra.push(label);
      else {
        // Check if any account in this section is an expense (check consolidated)
        const consSection = data.consolidated.sections.find(
          (s) => s.label === label,
        );
        if (consSection) {
          // Sections after contra are expenses in the backend order
          const idx = data.consolidated.sections.indexOf(consSection);
          const firstContraIdx = data.consolidated.sections.findIndex((s) =>
            s.label.toLowerCase().startsWith('less:'),
          );
          const isAfterContra =
            firstContraIdx >= 0 ? idx > firstContraIdx : false;
          // Check if it's NOT a revenue label
          const isRevenueSection =
            !isAfterContra || firstContraIdx < 0;
          if (
            isRevenueSection &&
            !contra.some((c) =>
              data.consolidated.sections.findIndex((s) => s.label === c),
            )
          ) {
            // Use a simpler heuristic: if there are no contra sections seen yet, it's revenue
            revenue.push(label);
          } else if (isAfterContra && !label.toLowerCase().startsWith('less:')) {
            expense.push(label);
          } else {
            revenue.push(label);
          }
        } else {
          revenue.push(label);
        }
      }
    }
    return { revenue, contra, expense };
  }, [allSectionLabels, data.consolidated.sections]);

  // Group sections by kind for rendering
  const sectionGroups = useMemo(() => {
    const groups: { kind: string; label: string; sections: string[] }[] = [];
    if (sectionsByKind.revenue.length > 0) {
      groups.push({
        kind: 'revenue',
        label: 'Revenue',
        sections: sectionsByKind.revenue,
      });
    }
    if (sectionsByKind.contra.length > 0) {
      groups.push({
        kind: 'contra',
        label: 'Contra-Revenue',
        sections: sectionsByKind.contra,
      });
    }
    if (sectionsByKind.expense.length > 0) {
      groups.push({
        kind: 'expense',
        label: 'Expenses',
        sections: sectionsByKind.expense,
      });
    }
    return groups;
  }, [sectionsByKind]);

  // Filter accounts by search
  const matchesSearch = useCallback(
    (accountName: string, accountNumber: string) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        accountName.toLowerCase().includes(q) ||
        accountNumber.toLowerCase().includes(q)
      );
    },
    [search],
  );

  const activeSections = useMemo(
    () => allSectionLabels.filter((label) => {
      const accounts = collectAccountsForSection(
        label,
        data.locations,
        data.consolidated,
      );
      return accounts.some((a) => matchesSearch(a.accountName, a.accountNumber));
    }),
    [allSectionLabels, data.locations, data.consolidated, matchesSearch],
  );

  const cons = data.consolidated;
  const locs = data.locations;
  const hasData = allSectionLabels.length > 0;

  // ── Handlers ────────────────────────────────────────────────
  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedSections(new Set(activeSections)),
    [activeSections],
  );

  const handleExport = () => {
    const colHeaders = [
      'Section',
      'Account #',
      'Account Name',
      ...locs.map((l) => l.locationName),
      'Consolidated',
    ];
    const rows: string[][] = [colHeaders];

    for (const sectionLabel of allSectionLabels) {
      const accounts = collectAccountsForSection(
        sectionLabel,
        locs,
        data.consolidated,
      );
      for (const acct of accounts) {
        const row = [
          sectionLabel,
          acct.accountNumber,
          acct.accountName,
          ...locs.map((loc) =>
            getLocationAmount(loc, sectionLabel, acct.accountId).toFixed(2),
          ),
        ];
        // Consolidated amount
        const consSection = cons.sections.find(
          (s) => s.label === sectionLabel,
        );
        const consAcct = consSection?.accounts.find(
          (a) => a.accountId === acct.accountId,
        );
        row.push((consAcct?.amount ?? 0).toFixed(2));
        rows.push(row);
      }
      // Section subtotal
      rows.push([
        sectionLabel,
        '',
        'Subtotal',
        ...locs.map((loc) =>
          getLocationSectionSubtotal(loc, sectionLabel).toFixed(2),
        ),
        (cons.sections.find((s) => s.label === sectionLabel)?.subtotal ?? 0).toFixed(2),
      ]);
    }

    // Summary rows
    rows.push([]);
    rows.push([
      '',
      '',
      'Gross Revenue',
      ...locs.map((l) => l.grossRevenue.toFixed(2)),
      cons.grossRevenue.toFixed(2),
    ]);
    rows.push([
      '',
      '',
      'Contra-Revenue',
      ...locs.map((l) => l.contraRevenue.toFixed(2)),
      cons.contraRevenue.toFixed(2),
    ]);
    rows.push([
      '',
      '',
      'Net Revenue',
      ...locs.map((l) => l.totalRevenue.toFixed(2)),
      cons.totalRevenue.toFixed(2),
    ]);
    rows.push([
      '',
      '',
      'Total Expenses',
      ...locs.map((l) => l.totalExpenses.toFixed(2)),
      cons.totalExpenses.toFixed(2),
    ]);
    rows.push([
      '',
      '',
      'Net Income',
      ...locs.map((l) => l.netIncome.toFixed(2)),
      cons.netIncome.toFixed(2),
    ]);

    const csv =
      '\uFEFF' +
      rows
        .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consolidated-pl-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <AccountingPageShell
      title="Consolidated P&L"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Consolidated P&L' },
      ]}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!hasData}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasData}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap print:hidden">
        <div>
          <label
            htmlFor="fromDate"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            From
          </label>
          <input
            id="fromDate"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label
            htmlFor="toDate"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            To
          </label>
          <input
            id="toDate"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        {allLocations.length > 1 && (
          <LocationMultiSelect
            locations={allLocations}
            selected={selectedLocationIds}
            onChange={setSelectedLocationIds}
          />
        )}
        <button
          type="button"
          onClick={() => mutate()}
          disabled={isLoading}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h2 className="text-lg font-bold">Consolidated Profit & Loss</h2>
        <div className="mt-1 flex gap-4 text-sm text-gray-600">
          <span>
            Period: {fromDate} to {toDate}
          </span>
          <span>Locations: {data.locationCount}</span>
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
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasData && (
        <div className="rounded-lg border border-border bg-surface p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h3 className="mt-3 text-sm font-medium text-foreground">
            No P&L Data
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No revenue or expense activity found for the selected period and
            locations.
          </p>
        </div>
      )}

      {/* Report content */}
      {!isLoading && hasData && (
        <div className="space-y-4">
          {/* KPI summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
            <KPICard
              label="Consolidated Revenue"
              value={formatAccountingMoney(cons.totalRevenue)}
              icon={TrendingUp}
              accent="text-green-500"
            />
            <KPICard
              label="Consolidated Expenses"
              value={formatAccountingMoney(cons.totalExpenses)}
              icon={TrendingDown}
              accent="text-red-500"
            />
            <KPICard
              label="Net Income"
              value={formatAccountingMoney(cons.netIncome)}
              icon={DollarSign}
              accent={cons.netIncome >= 0 ? 'text-green-500' : 'text-red-500'}
            />
            <KPICard
              label="Locations"
              value={`${data.locationCount}`}
              icon={MapPin}
              accent="text-sky-500"
            />
          </div>

          {/* Net income banner */}
          {cons.netIncome !== 0 && (
            <div
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                cons.netIncome >= 0
                  ? 'border-green-500/30 bg-green-500/10'
                  : 'border-red-500/30 bg-red-500/10'
              }`}
            >
              {cons.netIncome >= 0 ? (
                <TrendingUp className="h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 shrink-0 text-red-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  cons.netIncome >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {cons.netIncome >= 0
                  ? `Net profit of ${formatAccountingMoney(cons.netIncome)} across ${data.locationCount} location${data.locationCount !== 1 ? 's' : ''}`
                  : `Net loss of ${formatAccountingMoney(Math.abs(cons.netIncome))} across ${data.locationCount} location${data.locationCount !== 1 ? 's' : ''}`}
              </span>
            </div>
          )}

          {/* Toolbar: search + section controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by account name or number..."
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
              <button
                type="button"
                onClick={expandAll}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Expand All
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Collapse All
              </button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block print:block print:border-gray-300">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted print:bg-gray-100 print:border-gray-300">
                    <th className="w-8 px-2 py-3 print:hidden" />
                    <th className="sticky left-0 bg-muted px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground min-w-52 print:bg-gray-100">
                      Account
                    </th>
                    {locs.map((loc) => (
                      <th
                        key={loc.locationId}
                        className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground min-w-28"
                      >
                        {loc.locationName}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-foreground min-w-28 bg-muted/80 print:bg-gray-200">
                      Total
                    </th>
                  </tr>
                </thead>

                {sectionGroups.map((group) => {
                  const groupSections = group.sections.filter((label) =>
                    activeSections.includes(label),
                  );
                  if (groupSections.length === 0) return null;

                  return groupSections.map((sectionLabel) => {
                    const accounts = collectAccountsForSection(
                      sectionLabel,
                      locs,
                      cons,
                    ).filter((a) =>
                      matchesSearch(a.accountName, a.accountNumber),
                    );
                    if (accounts.length === 0) return null;

                    const isCollapsed = collapsedSections.has(sectionLabel);
                    const consSubtotal =
                      cons.sections.find((s) => s.label === sectionLabel)
                        ?.subtotal ?? 0;

                    return (
                      <tbody
                        key={sectionLabel}
                        className="print:break-inside-avoid"
                      >
                        {/* Section header */}
                        <tr
                          className="cursor-pointer select-none border-b border-border bg-muted/60 transition-colors hover:bg-muted print:cursor-default print:bg-gray-50"
                          onClick={() => toggleSection(sectionLabel)}
                        >
                          <td className="w-8 px-2 py-2.5 print:hidden">
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="px-4 py-2.5 print:pl-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`inline-block h-2.5 w-2.5 rounded-full ${
                                  SECTION_KIND_COLORS[
                                    classifySection(sectionLabel)
                                  ] ?? 'bg-gray-500'
                                }`}
                              />
                              <span className="text-sm font-semibold tracking-wide text-foreground">
                                {sectionLabel}
                              </span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground print:bg-gray-200">
                                {accounts.length}
                              </span>
                            </div>
                          </td>
                          {locs.map((loc) => (
                            <td
                              key={loc.locationId}
                              className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground"
                            >
                              {getLocationSectionSubtotal(
                                loc,
                                sectionLabel,
                              ) !== 0
                                ? formatAccountingMoney(
                                    getLocationSectionSubtotal(
                                      loc,
                                      sectionLabel,
                                    ),
                                  )
                                : ''}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground bg-muted/30">
                            {consSubtotal !== 0
                              ? formatAccountingMoney(consSubtotal)
                              : ''}
                          </td>
                        </tr>

                        {/* Detail rows */}
                        {!isCollapsed &&
                          accounts.map((acct) => {
                            const consSection = cons.sections.find(
                              (s) => s.label === sectionLabel,
                            );
                            const consAmount =
                              consSection?.accounts.find(
                                (a) => a.accountId === acct.accountId,
                              )?.amount ?? 0;

                            return (
                              <tr
                                key={acct.accountId}
                                className="border-b border-border/50 transition-colors last:border-border hover:bg-accent/30"
                              >
                                <td className="print:hidden" />
                                <td className="py-2 pl-10 pr-4 text-sm text-foreground print:pl-6">
                                  <span className="font-mono text-muted-foreground">
                                    {acct.accountNumber}
                                  </span>
                                  <span className="ml-2">
                                    {acct.accountName}
                                  </span>
                                </td>
                                {locs.map((loc) => {
                                  const amt = getLocationAmount(
                                    loc,
                                    sectionLabel,
                                    acct.accountId,
                                  );
                                  return (
                                    <td
                                      key={loc.locationId}
                                      className="px-4 py-2 text-right text-sm tabular-nums text-foreground"
                                    >
                                      {amt !== 0 ? (
                                        <DrillDownAmount
                                          onClick={() =>
                                            setDrillDown({
                                              accountId: acct.accountId,
                                              accountName: `${acct.accountNumber} ${acct.accountName}`,
                                              locationId: loc.locationId,
                                            })
                                          }
                                        >
                                          {formatAccountingMoney(amt)}
                                        </DrillDownAmount>
                                      ) : (
                                        ''
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="px-4 py-2 text-right text-sm font-medium tabular-nums text-foreground bg-muted/10">
                                  {consAmount !== 0 ? (
                                    <DrillDownAmount
                                      onClick={() =>
                                        setDrillDown({
                                          accountId: acct.accountId,
                                          accountName: `${acct.accountNumber} ${acct.accountName}`,
                                        })
                                      }
                                    >
                                      {formatAccountingMoney(consAmount)}
                                    </DrillDownAmount>
                                  ) : (
                                    ''
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    );
                  });
                })}

                {/* Summary rows */}
                <tfoot>
                  {/* Gross Revenue */}
                  <tr className="border-t border-border bg-muted/40 print:bg-gray-50">
                    <td className="print:hidden" />
                    <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
                      Gross Revenue
                    </td>
                    {locs.map((loc) => (
                      <td
                        key={loc.locationId}
                        className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground"
                      >
                        {formatAccountingMoney(loc.grossRevenue)}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground bg-muted/30">
                      {formatAccountingMoney(cons.grossRevenue)}
                    </td>
                  </tr>

                  {/* Contra-Revenue */}
                  {cons.contraRevenue !== 0 && (
                    <tr className="bg-muted/20">
                      <td className="print:hidden" />
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        Less: Contra-Revenue
                      </td>
                      {locs.map((loc) => (
                        <td
                          key={loc.locationId}
                          className="px-4 py-2 text-right text-sm tabular-nums text-muted-foreground"
                        >
                          {loc.contraRevenue !== 0
                            ? formatAccountingMoney(loc.contraRevenue)
                            : ''}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right text-sm tabular-nums text-muted-foreground bg-muted/10">
                        {formatAccountingMoney(cons.contraRevenue)}
                      </td>
                    </tr>
                  )}

                  {/* Net Revenue */}
                  <tr className="border-t border-border bg-muted/40 print:bg-gray-50">
                    <td className="print:hidden" />
                    <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
                      Net Revenue
                    </td>
                    {locs.map((loc) => (
                      <td
                        key={loc.locationId}
                        className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground"
                      >
                        {formatAccountingMoney(loc.totalRevenue)}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground bg-muted/30">
                      {formatAccountingMoney(cons.totalRevenue)}
                    </td>
                  </tr>

                  {/* Total Expenses */}
                  <tr className="bg-muted/20">
                    <td className="print:hidden" />
                    <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
                      Total Expenses
                    </td>
                    {locs.map((loc) => (
                      <td
                        key={loc.locationId}
                        className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-red-500"
                      >
                        {formatAccountingMoney(loc.totalExpenses)}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-red-500 bg-muted/10">
                      {formatAccountingMoney(cons.totalExpenses)}
                    </td>
                  </tr>

                  {/* Net Income */}
                  <tr className="border-t-2 border-border bg-muted font-bold print:bg-gray-100 print:border-gray-400">
                    <td className="print:hidden" />
                    <td className="px-4 py-3 text-sm text-foreground">
                      Net Income
                    </td>
                    {locs.map((loc) => (
                      <td
                        key={loc.locationId}
                        className={`px-4 py-3 text-right text-sm tabular-nums ${
                          loc.netIncome >= 0
                            ? 'text-green-500'
                            : 'text-red-500'
                        }`}
                      >
                        {formatAccountingMoney(loc.netIncome)}
                      </td>
                    ))}
                    <td
                      className={`px-4 py-3 text-right text-sm tabular-nums bg-muted/80 ${
                        cons.netIncome >= 0
                          ? 'text-green-500'
                          : 'text-red-500'
                      }`}
                    >
                      {formatAccountingMoney(cons.netIncome)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-3 md:hidden print:hidden">
            {/* Location summary cards */}
            {locs.map((loc) => (
              <div
                key={loc.locationId}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {loc.locationName}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      loc.netIncome >= 0
                        ? 'text-green-500'
                        : 'text-red-500'
                    }`}
                  >
                    {formatAccountingMoney(loc.netIncome)}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex justify-between text-sm text-foreground">
                    <span className="text-muted-foreground">Revenue</span>
                    <span className="tabular-nums">
                      {formatAccountingMoney(loc.totalRevenue)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-foreground">
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="tabular-nums text-red-500">
                      {formatAccountingMoney(loc.totalExpenses)}
                    </span>
                  </div>
                  <div className="border-t border-border pt-1.5">
                    <div className="flex justify-between text-sm font-semibold text-foreground">
                      <span>Net Income</span>
                      <span
                        className={`tabular-nums ${
                          loc.netIncome >= 0
                            ? 'text-green-500'
                            : 'text-red-500'
                        }`}
                      >
                        {formatAccountingMoney(loc.netIncome)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Mobile consolidated totals */}
            <div className="rounded-lg border border-border bg-muted p-4 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Consolidated
              </div>
              <div className="flex justify-between text-sm text-foreground">
                <span>Gross Revenue</span>
                <span className="tabular-nums">
                  {formatAccountingMoney(cons.grossRevenue)}
                </span>
              </div>
              {cons.contraRevenue !== 0 && (
                <div className="flex justify-between text-sm text-foreground">
                  <span>Contra-Revenue</span>
                  <span className="tabular-nums">
                    {formatAccountingMoney(cons.contraRevenue)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm text-foreground">
                <span>Net Revenue</span>
                <span className="tabular-nums">
                  {formatAccountingMoney(cons.totalRevenue)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-foreground">
                <span>Total Expenses</span>
                <span className="tabular-nums text-red-500">
                  {formatAccountingMoney(cons.totalExpenses)}
                </span>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex justify-between text-sm font-bold text-foreground">
                  <span>Net Income</span>
                  <span
                    className={`tabular-nums ${
                      cons.netIncome >= 0
                        ? 'text-green-500'
                        : 'text-red-500'
                    }`}
                  >
                    {formatAccountingMoney(cons.netIncome)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <DrillDownDrawer
        accountId={drillDown?.accountId ?? null}
        accountName={drillDown?.accountName ?? ''}
        from={fromDate}
        to={toDate}
        locationId={drillDown?.locationId}
        onClose={() => setDrillDown(null)}
      />
    </AccountingPageShell>
  );
}
