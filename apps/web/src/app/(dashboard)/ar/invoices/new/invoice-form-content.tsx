'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useARInvoiceMutations } from '@/hooks/use-ar';
import { formatAccountingMoney } from '@/types/accounting';
import { useToast } from '@/components/ui/toast';

interface InvoiceLine {
  revenueAccountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxGroupId: string;
  taxAmount: string;
}

const emptyLine = (): InvoiceLine => ({
  revenueAccountId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  taxGroupId: '',
  taxAmount: '0',
});

export default function InvoiceFormContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { createInvoice } = useARInvoiceMutations();

  const [customerId, setCustomerId] = useState('');
  const [billingAccountId, setBillingAccountId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]!);
  const [dueDate, setDueDate] = useState('');
  const [sourceType, setSourceType] = useState('manual');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateLine = (index: number, field: keyof InvoiceLine, value: string) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    );
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const computeLineAmount = (line: InvoiceLine) => {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    return qty * price;
  };

  const subtotal = lines.reduce((sum, l) => sum + computeLineAmount(l), 0);
  const taxTotal = lines.reduce((sum, l) => sum + (parseFloat(l.taxAmount) || 0), 0);
  const grandTotal = subtotal + taxTotal;

  const handleSubmit = async (_postNow: boolean) => {
    if (!customerId || !invoiceDate || !dueDate || lines.length === 0) return;
    setIsSubmitting(true);
    try {
      await createInvoice.mutateAsync({
        customerId,
        billingAccountId: billingAccountId || null,
        invoiceDate,
        dueDate,
        sourceType,
        memo: memo || null,
        lines: lines.map((l) => ({
          revenueAccountId: l.revenueAccountId,
          description: l.description || null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          amount: computeLineAmount(l).toFixed(2),
          taxGroupId: l.taxGroupId || null,
          taxAmount: l.taxAmount || '0',
        })),
      });

      toast.success('Invoice created');
      router.push('/ar/invoices');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AccountingPageShell
      title="New Invoice"
      breadcrumbs={[
        { label: 'AR Invoices', href: '/ar/invoices' },
        { label: 'New Invoice' },
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
              <label className="block text-sm font-medium text-foreground mb-1">Billing Account</label>
              <input
                type="text"
                value={billingAccountId}
                onChange={(e) => setBillingAccountId(e.target.value)}
                placeholder="Auto-filled from customer"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Source Type</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="manual">Manual</option>
                <option value="membership">Membership</option>
                <option value="event">Event</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
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

        {/* Lines */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Invoice Lines</h2>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
            >
              <Plus className="h-4 w-4" /> Add Line
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Revenue Account</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-20">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Unit Price</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Amount</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.revenueAccountId}
                          onChange={(e) => updateLine(idx, 'revenueAccountId', e.target.value)}
                          placeholder="Account"
                          className="w-full rounded border border-border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateLine(idx, 'description', e.target.value)}
                          placeholder="Description"
                          className="w-full rounded border border-border px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                          className="w-full rounded border border-border px-2 py-1 text-right text-sm tabular-nums focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded border border-border px-2 py-1 text-right text-sm tabular-nums focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums font-medium text-foreground">
                        {formatAccountingMoney(computeLineAmount(line))}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length <= 1}
                          className="text-muted-foreground hover:text-red-500 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="mt-3 flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatAccountingMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{formatAccountingMoney(taxTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatAccountingMoney(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/ar/invoices"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </Link>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting || !customerId || !dueDate}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting || !customerId || !dueDate}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save & Post'}
            </button>
          </div>
        </div>
      </div>
    </AccountingPageShell>
  );
}
