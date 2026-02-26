'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, AlertTriangle } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { useARInvoices, type ARInvoiceFilters } from '@/hooks/use-ar';
import { formatAccountingMoney } from '@/types/accounting';

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'bg-blue-500/20 text-blue-500' },
  membership: { label: 'Membership', color: 'bg-purple-500/20 text-purple-500' },
  event: { label: 'Event', color: 'bg-green-500/20 text-green-500' },
  pos_house_account: { label: 'POS House', color: 'bg-teal-500/20 text-teal-500' },
};

export default function InvoicesContent() {
  const [filters, setFilters] = useState<ARInvoiceFilters>({});
  const { data: invoices, isLoading } = useARInvoices({ ...filters, limit: 50 });

  const today = new Date().toISOString().split('T')[0];

  return (
    <AccountingPageShell
      title="AR Invoices"
      breadcrumbs={[{ label: 'Accounts Receivable' }, { label: 'Invoices' }]}
      actions={
        <Link
          href="/ar/invoices/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Invoice
        </Link>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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
        <select
          value={filters.sourceType ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, sourceType: e.target.value || undefined }))}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">All Sources</option>
          <option value="manual">Manual</option>
          <option value="membership">Membership</option>
          <option value="event">Event</option>
          <option value="pos_house_account">POS House Account</option>
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
      {!isLoading && invoices.length === 0 && (
        <AccountingEmptyState
          title="No invoices found"
          description="Create a new invoice to bill a customer."
          actionLabel="New Invoice"
          actionHref="/ar/invoices/new"
        />
      )}

      {/* Table */}
      {!isLoading && invoices.length > 0 && (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Due Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const isOverdue = inv.dueDate < today! && ['posted', 'partial'].includes(inv.status);
                  const src = SOURCE_BADGES[inv.sourceType];
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/ar/invoices/${inv.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{inv.customerName ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{inv.invoiceDate}</td>
                      <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-500 font-medium' : 'text-foreground'}`}>
                        {inv.dueDate}
                        {isOverdue && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-red-500" />}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                        {formatAccountingMoney(inv.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-foreground">
                        {formatAccountingMoney(inv.balanceDue)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {src && (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${src.color}`}>
                            {src.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 md:hidden">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/ar/invoices/${inv.id}`}
                className="block rounded-lg border border-border bg-surface p-4 space-y-2 hover:border-muted-foreground"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-indigo-600">{inv.invoiceNumber}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <p className="text-sm text-foreground">{inv.customerName}</p>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{inv.invoiceDate}</span>
                  <span>Due: {inv.dueDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total: {formatAccountingMoney(inv.totalAmount)}</span>
                  <span className="font-medium">Balance: {formatAccountingMoney(inv.balanceDue)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
