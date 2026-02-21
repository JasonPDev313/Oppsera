'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { useARReceipts, type ARReceiptFilters } from '@/hooks/use-ar';
import { formatAccountingMoney } from '@/types/accounting';

export default function ReceiptsContent() {
  const [filters, setFilters] = useState<ARReceiptFilters>({});
  const { data: receipts, isLoading } = useARReceipts(filters);

  return (
    <AccountingPageShell
      title="AR Receipts"
      breadcrumbs={[{ label: 'Accounts Receivable' }, { label: 'Receipts' }]}
      actions={
        <Link
          href="/ar/receipts/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Receipt
        </Link>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filters.status ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        <input
          type="date"
          value={filters.endDate ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value || undefined }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {!isLoading && receipts.length === 0 && (
        <AccountingEmptyState
          title="No receipts found"
          description="Record a receipt to apply customer payments against invoices."
          actionLabel="New Receipt"
          actionHref="/ar/receipts/new"
        />
      )}

      {!isLoading && receipts.length > 0 && (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Reference</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((rcpt) => (
                  <tr key={rcpt.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm text-gray-700">{rcpt.receiptDate}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{rcpt.customerName ?? '—'}</td>
                    <td className="px-4 py-3 text-sm capitalize text-gray-700">{rcpt.paymentMethod}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{rcpt.referenceNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-gray-900">
                      {formatAccountingMoney(rcpt.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={rcpt.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 md:hidden">
            {receipts.map((rcpt) => (
              <div
                key={rcpt.id}
                className="rounded-lg border border-gray-200 bg-surface p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{rcpt.customerName ?? '—'}</span>
                  <StatusBadge status={rcpt.status} />
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{rcpt.receiptDate}</span>
                  <span className="capitalize">{rcpt.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ref: {rcpt.referenceNumber ?? '—'}</span>
                  <span className="font-medium tabular-nums">{formatAccountingMoney(rcpt.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
