'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { MoneyInput } from '@/components/accounting/money-input';
import { useARReceiptMutations, useOpenInvoices } from '@/hooks/use-ar';
import { formatAccountingMoney } from '@/types/accounting';
import { useToast } from '@/components/ui/toast';

interface AllocationRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  balanceDue: string;
  paymentAmount: string;
}

export default function ReceiptFormContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { createReceipt } = useARReceiptMutations();

  const [customerId, setCustomerId] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]!);
  const [paymentMethod, setPaymentMethod] = useState('check');
  const [bankAccountId] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: openInvoices } = useOpenInvoices(customerId || null);

  useMemo(() => {
    if (openInvoices.length > 0 && customerId) {
      setAllocations(
        openInvoices.map((inv) => ({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          dueDate: inv.dueDate,
          totalAmount: inv.totalAmount,
          balanceDue: inv.balanceDue,
          paymentAmount: '',
        })),
      );
    }
  }, [openInvoices, customerId]);

  const totalAllocated = allocations.reduce(
    (sum, a) => sum + (parseFloat(a.paymentAmount) || 0),
    0,
  );
  const paymentNum = parseFloat(amount) || 0;
  const unapplied = paymentNum - totalAllocated;

  const handlePayAll = () => {
    let remaining = paymentNum;
    const updated = allocations.map((a) => {
      const bal = parseFloat(a.balanceDue) || 0;
      const pay = Math.min(bal, remaining);
      remaining -= pay;
      return { ...a, paymentAmount: pay > 0 ? pay.toFixed(2) : '' };
    });
    setAllocations(updated);
  };

  const handleAllocationChange = (index: number, value: string) => {
    setAllocations((prev) =>
      prev.map((a, i) => (i === index ? { ...a, paymentAmount: value } : a)),
    );
  };

  const handleSubmit = async () => {
    if (!customerId || paymentNum <= 0) return;
    setIsSubmitting(true);
    try {
      const filledAllocations = allocations
        .filter((a) => parseFloat(a.paymentAmount) > 0)
        .map((a) => ({ invoiceId: a.invoiceId, amount: a.paymentAmount }));

      await createReceipt.mutateAsync({
        customerId,
        receiptDate,
        paymentMethod,
        bankAccountId: bankAccountId || null,
        referenceNumber: referenceNumber || null,
        amount: paymentNum.toFixed(2),
        memo: memo || null,
        allocations: filledAllocations,
      });

      toast.success('Receipt created');
      router.push('/ar/receipts');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create receipt');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AccountingPageShell
      title="New Receipt"
      breadcrumbs={[
        { label: 'AR Receipts', href: '/ar/receipts' },
        { label: 'New Receipt' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Customer <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="Customer ID"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Receipt Date</label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="check">Check</option>
                <option value="ach">ACH</option>
                <option value="wire">Wire</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Reference #</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Memo</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Invoice Allocation */}
        {allocations.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Invoice Allocation</h2>
              <button
                type="button"
                onClick={handlePayAll}
                disabled={paymentNum <= 0}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                Apply All
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Due</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a, idx) => (
                      <tr key={a.invoiceId} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-sm font-medium text-indigo-600">{a.invoiceNumber}</td>
                        <td className="px-4 py-2.5 text-sm text-foreground">{a.invoiceDate}</td>
                        <td className="px-4 py-2.5 text-sm text-foreground">{a.dueDate}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                          {formatAccountingMoney(a.totalAmount)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                          {formatAccountingMoney(a.balanceDue)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="text"
                            value={a.paymentAmount}
                            onChange={(e) => handleAllocationChange(idx, e.target.value)}
                            placeholder="0.00"
                            className="w-28 rounded border border-border px-2 py-1 text-right text-sm tabular-nums focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Total Applied:</span>{' '}
                <span className="font-medium tabular-nums">{formatAccountingMoney(totalAllocated)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Unapplied:</span>{' '}
                <span className={`font-medium tabular-nums ${unapplied > 0.005 ? 'text-amber-500' : 'text-green-500'}`}>
                  {formatAccountingMoney(unapplied)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/ar/receipts"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Receipts
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !customerId || paymentNum <= 0}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : 'Save & Post'}
          </button>
        </div>
      </div>
    </AccountingPageShell>
  );
}
