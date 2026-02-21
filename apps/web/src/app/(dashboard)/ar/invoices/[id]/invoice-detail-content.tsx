'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Pencil } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { useARInvoice, useARInvoiceMutations } from '@/hooks/use-ar';
import { formatAccountingMoney } from '@/types/accounting';
import { useToast } from '@/components/ui/toast';

export default function InvoiceDetailContent() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const { data: invoice, isLoading, mutate } = useARInvoice(id);
  const { postInvoice, voidInvoice } = useARInvoiceMutations();

  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  const handlePost = async () => {
    if (!invoice) return;
    setIsPosting(true);
    try {
      await postInvoice.mutateAsync(invoice.id);
      toast.success('Invoice posted');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post invoice');
    } finally {
      setIsPosting(false);
    }
  };

  const handleVoid = async () => {
    if (!invoice || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      await voidInvoice.mutateAsync({ id: invoice.id, reason: voidReason.trim() });
      toast.success('Invoice voided');
      setShowVoidDialog(false);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to void invoice');
    } finally {
      setIsVoiding(false);
    }
  };

  if (isLoading) {
    return (
      <AccountingPageShell title="Invoice" breadcrumbs={[{ label: 'AR Invoices', href: '/ar/invoices' }, { label: 'Loading...' }]}>
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />)}</div>
      </AccountingPageShell>
    );
  }

  if (!invoice) {
    return (
      <AccountingPageShell title="Invoice" breadcrumbs={[{ label: 'AR Invoices', href: '/ar/invoices' }, { label: 'Not Found' }]}>
        <div className="text-center py-12 text-gray-500">Invoice not found.</div>
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell
      title={`Invoice ${invoice.invoiceNumber}`}
      breadcrumbs={[
        { label: 'AR Invoices', href: '/ar/invoices' },
        { label: invoice.invoiceNumber },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {invoice.status === 'draft' && (
            <>
              <Link
                href={`/ar/invoices/new?edit=${invoice.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
              <button
                type="button"
                onClick={handlePost}
                disabled={isPosting}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                {isPosting ? 'Posting...' : 'Post'}
              </button>
            </>
          )}
          {invoice.status === 'posted' && (
            <button
              type="button"
              onClick={() => setShowVoidDialog(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4" />
              Void
            </button>
          )}
        </div>
      }
    >
      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={invoice.status} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Customer</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{invoice.customerName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Invoice Date</p>
            <p className="mt-1 text-sm text-gray-900">{invoice.invoiceDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Due Date</p>
            <p className="mt-1 text-sm text-gray-900">{invoice.dueDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Source</p>
            <p className="mt-1 text-sm capitalize text-gray-900">{invoice.sourceType.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{formatAccountingMoney(invoice.totalAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Tax</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{formatAccountingMoney(invoice.taxAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Balance Due</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${Number(invoice.balanceDue) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatAccountingMoney(invoice.balanceDue)}
            </p>
          </div>
        </div>
      </div>

      {/* Lines */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Invoice Lines</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Unit Price</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {line.revenueAccountNumber && <span className="mr-1 font-mono text-xs text-gray-500">{line.revenueAccountNumber}</span>}
                      {line.revenueAccountName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{line.description ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{line.quantity}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{formatAccountingMoney(line.unitPrice)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-gray-900">{formatAccountingMoney(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-4 py-3 text-sm text-gray-700">Total</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900">{formatAccountingMoney(invoice.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Mobile */}
          <div className="space-y-3 p-4 md:hidden">
            {invoice.lines.map((line) => (
              <div key={line.id} className="rounded border border-gray-100 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-900">{line.revenueAccountName ?? line.revenueAccountId}</span>
                  <span className="font-medium tabular-nums">{formatAccountingMoney(line.amount)}</span>
                </div>
                {line.description && <p className="text-xs text-gray-500">{line.description}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Link
        href="/ar/invoices"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to AR Invoices
      </Link>

      {/* Void Dialog */}
      {showVoidDialog && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowVoidDialog(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-gray-200 bg-surface p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Void Invoice</h3>
            <p className="text-sm text-gray-500">This will create a reversal GL entry. This cannot be undone.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="Reason for voiding..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowVoidDialog(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={!voidReason.trim() || isVoiding}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isVoiding ? 'Voiding...' : 'Void Invoice'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </AccountingPageShell>
  );
}
