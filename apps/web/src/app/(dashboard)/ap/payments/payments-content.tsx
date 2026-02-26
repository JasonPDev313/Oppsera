'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { useAPPayments, type APPaymentFilters } from '@/hooks/use-ap';
import { formatAccountingMoney } from '@/types/accounting';

const PAYMENT_METHODS: Record<string, string> = {
  check: 'Check',
  ach: 'ACH',
  wire: 'Wire',
  card: 'Card',
  cash: 'Cash',
};

export default function PaymentsContent() {
  const [filters, setFilters] = useState<APPaymentFilters>({});
  const { data: payments, isLoading } = useAPPayments(filters);

  return (
    <AccountingPageShell
      title="AP Payments"
      breadcrumbs={[{ label: 'Accounts Payable' }, { label: 'Payments' }]}
      actions={
        <Link
          href="/ap/payments/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Payment
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
          <option value="voided">Voided</option>
        </select>
        <input
          type="date"
          value={filters.startDate ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value || undefined }))}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          placeholder="From"
        />
        <input
          type="date"
          value={filters.endDate ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value || undefined }))}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          placeholder="To"
        />
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
      {!isLoading && payments.length === 0 && (
        <AccountingEmptyState
          title="No payments found"
          description="Create a payment to apply against vendor bills."
          actionLabel="New Payment"
          actionHref="/ap/payments/new"
        />
      )}

      {/* Table */}
      {!isLoading && payments.length > 0 && (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Reference #</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pmt) => (
                  <tr key={pmt.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-3 text-sm text-foreground">{pmt.paymentDate}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/ap/payments/${pmt.id}`} className="font-medium text-indigo-600 hover:text-indigo-500">
                        {pmt.vendorName ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{PAYMENT_METHODS[pmt.paymentMethod] ?? pmt.paymentMethod}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{pmt.referenceNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-foreground">
                      {formatAccountingMoney(pmt.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={pmt.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 md:hidden">
            {payments.map((pmt) => (
              <Link
                key={pmt.id}
                href={`/ap/payments/${pmt.id}`}
                className="block rounded-lg border border-border bg-surface p-4 space-y-2 hover:border-muted-foreground"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-indigo-600">{pmt.vendorName ?? '—'}</span>
                  <StatusBadge status={pmt.status} />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{pmt.paymentDate}</span>
                  <span>{PAYMENT_METHODS[pmt.paymentMethod] ?? pmt.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ref: {pmt.referenceNumber ?? '—'}</span>
                  <span className="font-medium tabular-nums">{formatAccountingMoney(pmt.amount)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
