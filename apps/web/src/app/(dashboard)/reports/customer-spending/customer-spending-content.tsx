'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users,
  DollarSign,
  TrendingUp,
  Building2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Printer,
  Download,
  ArrowUpDown,
  Mail,
  Phone,
} from 'lucide-react';
import { useCustomerSpending, formatReportMoney, downloadCsvExport } from '@/hooks/use-reports';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import { useProfileDrawer } from '@/components/customer-profile-drawer';
import type { CustomerSpendingRow } from '@/types/reports';

// ── Helpers ──────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── KPI Card ─────────────────────────────────────────────────────

interface KpiCardProps {
  icon: typeof Users;
  label: string;
  value: string;
  accent: string;
}

function KpiCard({ icon: Icon, label, value, accent }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-3">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Department Breakdown ─────────────────────────────────────────

const DEPT_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
];

function DepartmentBar({ departments, total }: { departments: CustomerSpendingRow['departments']; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {departments.map((dept, i) => {
        const pct = (dept.totalSpend / total) * 100;
        if (pct < 1) return null;
        return (
          <div
            key={dept.departmentId}
            className={`${DEPT_COLORS[i % DEPT_COLORS.length]} transition-all`}
            style={{ width: `${pct}%` }}
            title={`${dept.departmentName}: ${formatReportMoney(dept.totalSpend)} (${pct.toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function CustomerSpendingContent() {
  const [dateFrom, setDateFrom] = useState(daysAgo(29));
  const [dateTo, setDateTo] = useState(today());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'totalSpend' | 'customerName'>('totalSpend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  // Debounce search input — 300ms
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const profileDrawer = useProfileDrawer();

  const { data, isLoading, isFetching, error } = useCustomerSpending({
    dateFrom,
    dateTo,
    search: debouncedSearch || undefined,
    sortBy,
    sortDir,
  });

  const summary = data?.summary;
  const customers = data?.customers ?? [];

  // Collect all unique departments across all customers for the legend
  const allDepartments = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      for (const d of c.departments) {
        if (!map.has(d.departmentId)) map.set(d.departmentId, d.departmentName);
      }
    }
    return Array.from(map.entries());
  }, [customers]);

  // Toggle sort
  function handleSort(col: 'totalSpend' | 'customerName') {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'totalSpend' ? 'desc' : 'asc');
    }
  }

  // Toggle expand
  function toggleCustomer(id: string) {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedCustomers(new Set(customers.map((c) => c.customerId)));
  }

  function collapseAll() {
    setExpandedCustomers(new Set());
  }

  // CSV export
  function handleExport() {
    downloadCsvExport('/api/v1/reports/customer-spending', {
      dateFrom,
      dateTo,
      search: search || undefined,
      sortBy,
      sortDir,
      format: 'csv',
    }).catch(() => {
      // Build client-side CSV fallback
      const rows: string[] = [];
      rows.push('Customer Name,Email,Phone,Department,Department Spend,Total Spend');
      for (const c of customers) {
        if (c.departments.length === 0) {
          rows.push(`"${c.customerName}","${c.customerEmail ?? ''}","${c.customerPhone ?? ''}","","","${c.totalSpend.toFixed(2)}"`);
        } else {
          for (const d of c.departments) {
            rows.push(`"${c.customerName}","${c.customerEmail ?? ''}","${c.customerPhone ?? ''}","${d.departmentName}","${d.totalSpend.toFixed(2)}","${c.totalSpend.toFixed(2)}"`);
          }
        }
      }
      const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-spending-${dateFrom}-to-${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Print
  function handlePrint() {
    window.print();
  }

  // ── Loading ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-10 w-full animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <Users className="h-12 w-12 text-muted-foreground/40" />
        <h3 className="text-lg font-semibold text-foreground">Failed to load report</h3>
        <p className="text-sm text-muted-foreground">{String(error)}</p>
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────────────
  if (customers.length === 0 && !isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Customer Spending Report</h1>
        </div>
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold text-foreground">No customer spending data</h3>
          <p className="text-sm text-muted-foreground">
            No orders with attached customers were found for this date range.
          </p>
        </div>
      </div>
    );
  }

  // ── Main Render ────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6">
      {/* Print-only header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Customer Spending Report</h1>
        <p className="text-sm text-muted-foreground">
          {dateFrom} to {dateTo} &bull; {summary?.totalCustomers ?? 0} customers
        </p>
      </div>

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Customer Spending Report</h1>
          {isFetching && !isLoading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Date Range */}
      <div className="print:hidden">
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Total Customers"
          value={String(summary?.totalCustomers ?? 0)}
          accent="bg-blue-500/10 text-blue-500"
        />
        <KpiCard
          icon={DollarSign}
          label="Total Spend"
          value={formatReportMoney(summary?.totalSpend ?? 0)}
          accent="bg-emerald-500/10 text-emerald-500"
        />
        <KpiCard
          icon={TrendingUp}
          label="Avg per Customer"
          value={formatReportMoney(summary?.avgSpendPerCustomer ?? 0)}
          accent="bg-amber-500/10 text-amber-500"
        />
        <KpiCard
          icon={Building2}
          label="Top Department"
          value={summary?.topDepartment ? `${summary.topDepartment.name}` : 'N/A'}
          accent="bg-purple-500/10 text-purple-500"
        />
      </div>

      {/* Department Legend */}
      {allDepartments.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3 print:border-gray-300">
          <span className="text-xs font-medium text-muted-foreground">Departments:</span>
          {allDepartments.map(([id, name], i) => (
            <div key={id} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${DEPT_COLORS[i % DEPT_COLORS.length]}`} />
              <span className="text-xs text-foreground">{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border print:border-gray-300">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 print:bg-gray-100">
              <th className="w-8 px-3 py-3" />
              <th className="px-3 py-3 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('customerName')}
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  Customer
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contact
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Department Breakdown
              </th>
              <th className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('totalSpend')}
                  className="ml-auto flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  Total Spend
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {customers.map((customer) => {
              const isExpanded = expandedCustomers.has(customer.customerId);
              return (
                <CustomerTableRow
                  key={customer.customerId}
                  customer={customer}
                  isExpanded={isExpanded}
                  onToggle={() => toggleCustomer(customer.customerId)}
                  onOpenProfile={() => profileDrawer.open(customer.customerId, { source: 'customer-spending-report' })}
                />
              );
            })}
          </tbody>
          {/* Grand Total Footer */}
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-semibold print:bg-gray-100">
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-foreground">
                Grand Total ({customers.length} customers)
              </td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right tabular-nums text-foreground">
                {formatReportMoney(summary?.totalSpend ?? 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 md:hidden">
        {customers.map((customer) => {
          const isExpanded = expandedCustomers.has(customer.customerId);
          return (
            <CustomerMobileCard
              key={customer.customerId}
              customer={customer}
              isExpanded={isExpanded}
              onToggle={() => toggleCustomer(customer.customerId)}
              onOpenProfile={() => profileDrawer.open(customer.customerId, { source: 'customer-spending-report' })}
            />
          );
        })}
        {/* Mobile Grand Total */}
        <div className="rounded-lg border-2 border-border bg-muted/30 p-4 print:bg-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Grand Total ({customers.length} customers)
            </span>
            <span className="text-lg font-bold tabular-nums text-foreground">
              {formatReportMoney(summary?.totalSpend ?? 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Desktop Table Row ────────────────────────────────────────────

interface CustomerRowProps {
  customer: CustomerSpendingRow;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenProfile: () => void;
}

function CustomerTableRow({ customer, isExpanded, onToggle, onOpenProfile }: CustomerRowProps) {
  return (
    <>
      <tr className="transition-colors hover:bg-muted/50 print:break-inside-avoid">
        {/* Expand Toggle */}
        <td className="px-3 py-3 print:hidden">
          <button
            type="button"
            onClick={onToggle}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>

        {/* Customer Name (clickable) */}
        <td className="px-3 py-3">
          <button
            type="button"
            onClick={onOpenProfile}
            className="text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:underline text-left"
          >
            {customer.customerName}
          </button>
        </td>

        {/* Contact */}
        <td className="px-3 py-3">
          <div className="flex flex-col gap-0.5">
            {customer.customerEmail && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[180px]">{customer.customerEmail}</span>
              </span>
            )}
            {customer.customerPhone && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                {customer.customerPhone}
              </span>
            )}
            {!customer.customerEmail && !customer.customerPhone && (
              <span className="text-xs text-muted-foreground/60">—</span>
            )}
          </div>
        </td>

        {/* Department Bar */}
        <td className="px-3 py-3">
          <DepartmentBar departments={customer.departments} total={customer.totalSpend} />
        </td>

        {/* Total Spend */}
        <td className="px-3 py-3 text-right tabular-nums font-medium text-foreground">
          {formatReportMoney(customer.totalSpend)}
        </td>
      </tr>

      {/* Expanded Department Breakdown */}
      {isExpanded && customer.departments.length > 0 && (
        <tr className="print:break-inside-avoid">
          <td colSpan={5} className="px-6 pb-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3 print:border-gray-300">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Department</th>
                    <th className="pb-2 text-right font-medium">Spend</th>
                    <th className="pb-2 text-right font-medium">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {customer.departments
                    .sort((a, b) => b.totalSpend - a.totalSpend)
                    .map((dept, i) => (
                      <tr key={dept.departmentId}>
                        <td className="py-1.5 text-foreground">
                          <span className="flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 rounded-full ${DEPT_COLORS[i % DEPT_COLORS.length]}`} />
                            {dept.departmentName}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-foreground">
                          {formatReportMoney(dept.totalSpend)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {customer.totalSpend > 0
                            ? ((dept.totalSpend / customer.totalSpend) * 100).toFixed(1)
                            : '0.0'}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Mobile Card ──────────────────────────────────────────────────

function CustomerMobileCard({ customer, isExpanded, onToggle, onOpenProfile }: CustomerRowProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:break-inside-avoid">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={onOpenProfile}
            className="text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:underline text-left"
          >
            {customer.customerName}
          </button>
          <div className="mt-1 flex flex-col gap-0.5">
            {customer.customerEmail && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{customer.customerEmail}</span>
              </span>
            )}
            {customer.customerPhone && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                {customer.customerPhone}
              </span>
            )}
          </div>
        </div>
        <span className="text-base font-semibold tabular-nums text-foreground whitespace-nowrap">
          {formatReportMoney(customer.totalSpend)}
        </span>
      </div>

      {/* Department bar */}
      <div className="mt-3">
        <DepartmentBar departments={customer.departments} total={customer.totalSpend} />
      </div>

      {/* Expand toggle */}
      {customer.departments.length > 0 && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <>
              <ChevronDown className="h-3 w-3" />
              Hide departments
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" />
              Show {customer.departments.length} department{customer.departments.length !== 1 ? 's' : ''}
            </>
          )}
        </button>
      )}

      {/* Expanded breakdown */}
      {isExpanded && customer.departments.length > 0 && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-border/50 bg-muted/20 p-3">
          {customer.departments
            .sort((a, b) => b.totalSpend - a.totalSpend)
            .map((dept, i) => (
              <div key={dept.departmentId} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-foreground">
                  <span className={`inline-block h-2 w-2 rounded-full ${DEPT_COLORS[i % DEPT_COLORS.length]}`} />
                  {dept.departmentName}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatReportMoney(dept.totalSpend)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
