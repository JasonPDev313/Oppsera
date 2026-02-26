'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, XCircle, Pencil } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { StatusBadge } from '@/components/accounting/status-badge';
import { useAPBill, useAPBillMutations } from '@/hooks/use-ap';
import { formatAccountingMoney } from '@/types/accounting';
import { useToast } from '@/components/ui/toast';

export default function BillDetailContent() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const { data: bill, isLoading, mutate } = useAPBill(id);
  const { postBill, voidBill } = useAPBillMutations();

  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  const handlePost = async () => {
    if (!bill) return;
    setIsPosting(true);
    try {
      await postBill.mutateAsync(bill.id);
      toast.success('Bill posted');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post bill');
    } finally {
      setIsPosting(false);
    }
  };

  const handleVoid = async () => {
    if (!bill || !voidReason.trim()) return;
    setIsVoiding(true);
    try {
      await voidBill.mutateAsync({ id: bill.id, reason: voidReason.trim() });
      toast.success('Bill voided');
      setShowVoidDialog(false);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to void bill');
    } finally {
      setIsVoiding(false);
    }
  };

  if (isLoading) {
    return (
      <AccountingPageShell title="Bill" breadcrumbs={[{ label: 'AP Bills', href: '/ap/bills' }, { label: 'Loading...' }]}>
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      </AccountingPageShell>
    );
  }

  if (!bill) {
    return (
      <AccountingPageShell title="Bill" breadcrumbs={[{ label: 'AP Bills', href: '/ap/bills' }, { label: 'Not Found' }]}>
        <div className="text-center py-12 text-muted-foreground">Bill not found.</div>
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell
      title={`Bill ${bill.billNumber}`}
      breadcrumbs={[
        { label: 'AP Bills', href: '/ap/bills' },
        { label: bill.billNumber },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {bill.status === 'draft' && (
            <>
              <Link
                href={`/ap/bills/new?edit=${bill.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
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
          {bill.status === 'posted' && (
            <button
              type="button"
              onClick={() => setShowVoidDialog(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4" />
              Void
            </button>
          )}
        </div>
      }
    >
      {/* Header */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={bill.status} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendor</p>
            <p className="mt-1 text-sm font-medium text-foreground">{bill.vendorName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bill Date</p>
            <p className="mt-1 text-sm text-foreground">{bill.billDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Due Date</p>
            <p className="mt-1 text-sm text-foreground">{bill.dueDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</p>
            <p className="mt-1 text-sm text-foreground">{new Date(bill.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatAccountingMoney(bill.totalAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tax</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatAccountingMoney(bill.taxAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance Due</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${Number(bill.balanceDue) > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {formatAccountingMoney(bill.balanceDue)}
            </p>
          </div>
        </div>
        {bill.memo && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Memo</p>
            <p className="mt-1 text-sm text-foreground">{bill.memo}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bill Lines</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm capitalize text-foreground">{line.lineType}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {line.glAccountNumber && <span className="mr-1 font-mono text-xs text-muted-foreground">{line.glAccountNumber}</span>}
                      {line.glAccountName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{line.description ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{line.quantity}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(line.unitCost)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-foreground">{formatAccountingMoney(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted font-semibold">
                  <td colSpan={5} className="px-4 py-3 text-sm text-foreground">Total</td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">{formatAccountingMoney(bill.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Mobile */}
          <div className="space-y-3 p-4 md:hidden">
            {bill.lines.map((line) => (
              <div key={line.id} className="rounded border border-border p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{line.lineType}</span>
                  <span className="font-medium tabular-nums">{formatAccountingMoney(line.amount)}</span>
                </div>
                <p className="text-sm text-foreground">{line.glAccountName ?? line.glAccountId}</p>
                {line.description && <p className="text-xs text-muted-foreground">{line.description}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Link
        href="/ap/bills"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to AP Bills
      </Link>

      {/* Void Dialog */}
      {showVoidDialog && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowVoidDialog(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Void Bill</h3>
            <p className="text-sm text-muted-foreground">This will create a reversal GL entry. This cannot be undone.</p>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="Reason for voiding..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowVoidDialog(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">Cancel</button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={!voidReason.trim() || isVoiding}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isVoiding ? 'Voiding...' : 'Void Bill'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </AccountingPageShell>
  );
}
