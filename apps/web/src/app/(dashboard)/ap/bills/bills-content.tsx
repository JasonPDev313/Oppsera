'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, AlertTriangle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { useAPBills, useAPSummary, type APBillFilters } from '@/hooks/use-ap';
import { formatAccountingMoney } from '@/types/accounting';

export default function BillsContent() {
  const [filters, setFilters] = useState<APBillFilters>({});
  const [search, setSearch] = useState('');

  const { data: bills, isLoading } = useAPBills({ ...filters, limit: 50 });
  const { data: summary } = useAPSummary();

  const today = new Date().toISOString().split('T')[0];

  return (
    <AccountingPageShell
      title="AP Bills"
      breadcrumbs={[{ label: 'Accounts Payable' }, { label: 'Bills' }]}
      actions={
        <Link
          href="/ap/bills/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Bill
        </Link>
      }
    >
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total Outstanding', value: formatAccountingMoney(summary.totalOutstanding), color: 'text-foreground' },
            { label: 'Overdue', value: formatAccountingMoney(summary.overdueAmount), color: summary.overdueAmount > 0 ? 'text-red-500' : 'text-foreground' },
            { label: 'Drafts', value: String(summary.draftCount), color: 'text-foreground' },
            { label: 'Due This Week', value: String(summary.dueThisWeek), color: 'text-foreground' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search bills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border py-2 pl-10 pr-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <select
          value={filters.status ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="voided">Voided</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={filters.overdueOnly ?? false}
            onChange={(e) => setFilters((f) => ({ ...f, overdueOnly: e.target.checked || undefined }))}
            className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
          />
          Overdue only
        </label>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && bills.length === 0 && (
        <AccountingEmptyState
          title="No bills found"
          description="Create a new AP bill to track vendor invoices."
          actionLabel="New Bill"
          actionHref="/ap/bills/new"
        />
      )}

      {/* Table */}
      {!isLoading && bills.length > 0 && (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Bill #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Bill Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Due Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => {
                  const isOverdue = bill.dueDate < today! && ['posted', 'partial'].includes(bill.status);
                  return (
                    <tr key={bill.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/ap/bills/${bill.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                          {bill.billNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{bill.vendorName ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{bill.billDate}</td>
                      <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-500 font-medium' : 'text-foreground'}`}>
                        {bill.dueDate}
                        {isOverdue && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                        {formatAccountingMoney(bill.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-foreground">
                        {formatAccountingMoney(bill.balanceDue)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={bill.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 md:hidden">
            {bills.map((bill) => (
              <Link
                key={bill.id}
                href={`/ap/bills/${bill.id}`}
                className="block rounded-lg border border-border bg-surface p-4 space-y-2 hover:border-border"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-indigo-600">{bill.billNumber}</span>
                  <StatusBadge status={bill.status} />
                </div>
                <p className="text-sm text-foreground">{bill.vendorName}</p>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{bill.billDate}</span>
                  <span>Due: {bill.dueDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total: {formatAccountingMoney(bill.totalAmount)}</span>
                  <span className="font-medium">Balance: {formatAccountingMoney(bill.balanceDue)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
