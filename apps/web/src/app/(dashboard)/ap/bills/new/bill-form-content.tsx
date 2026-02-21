'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountPicker } from '@/components/accounting/account-picker';
import { MoneyInput } from '@/components/accounting/money-input';
import { useAPBillMutations, usePaymentTerms } from '@/hooks/use-ap';
import { useToast } from '@/components/ui/toast';
import { formatAccountingMoney } from '@/types/accounting';
import type { APLineType } from '@/types/accounting';

interface FormLine {
  key: string;
  lineType: APLineType;
  glAccountId: string | null;
  description: string;
  quantity: string;
  unitCost: string;
}

function newLine(): FormLine {
  return {
    key: Math.random().toString(36).slice(2),
    lineType: 'expense',
    glAccountId: null,
    description: '',
    quantity: '1',
    unitCost: '',
  };
}

export default function BillFormContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { createBill } = useAPBillMutations();
  const { data: terms } = usePaymentTerms();

  const [vendorId, setVendorId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]!);
  const [dueDate, setDueDate] = useState('');
  const [paymentTermsId, setPaymentTermsId] = useState('');
  const [memo, setMemo] = useState('');
  const [taxAmount, setTaxAmount] = useState('0.00');
  const [lines, setLines] = useState<FormLine[]>([newLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const lineAmounts = useMemo(() =>
    lines.map((l) => {
      const qty = parseFloat(l.quantity) || 0;
      const cost = parseFloat(l.unitCost) || 0;
      return qty * cost;
    }), [lines]);

  const subtotal = lineAmounts.reduce((s, a) => s + a, 0);
  const tax = parseFloat(taxAmount) || 0;
  const total = subtotal + tax;

  const handleTermsChange = (termsId: string) => {
    setPaymentTermsId(termsId);
    const term = terms.find((t) => t.id === termsId);
    if (term && billDate) {
      const date = new Date(billDate);
      date.setDate(date.getDate() + term.dueDays);
      setDueDate(date.toISOString().split('T')[0]!);
    }
  };

  const updateLine = useCallback((key: string, field: keyof FormLine, value: string | null) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, newLine()]);
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!vendorId) newErrors.vendorId = 'Vendor is required';
    if (!billNumber.trim()) newErrors.billNumber = 'Bill number is required';
    if (!billDate) newErrors.billDate = 'Bill date is required';
    if (!dueDate) newErrors.dueDate = 'Due date is required';

    for (const line of lines) {
      if (!line.glAccountId) newErrors[`line_${line.key}_account`] = 'Account required';
      if (!line.unitCost || parseFloat(line.unitCost) <= 0) newErrors[`line_${line.key}_cost`] = 'Cost required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (autoPost: boolean) => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const result = await createBill.mutateAsync({
        vendorId,
        billNumber: billNumber.trim(),
        billDate,
        dueDate,
        paymentTermsId: paymentTermsId || null,
        memo: memo || null,
        taxAmount: tax.toFixed(2),
        lines: lines.map((l, i) => ({
          lineType: l.lineType,
          glAccountId: l.glAccountId!,
          description: l.description || null,
          quantity: l.quantity || '1',
          unitCost: l.unitCost || '0',
          amount: lineAmounts[i]!.toFixed(2),
        })),
      });

      if (autoPost) {
        // TODO: post immediately after creation
      }

      toast.success('Bill saved');
      router.push(`/ap/bills/${result.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save bill');
    } finally {
      setIsSaving(false);
    }
  };

  const lineTypes: { value: APLineType; label: string }[] = [
    { value: 'expense', label: 'Expense' },
    { value: 'inventory', label: 'Inventory' },
    { value: 'asset', label: 'Asset' },
    { value: 'freight', label: 'Freight' },
  ];

  return (
    <AccountingPageShell
      title="New Bill"
      breadcrumbs={[
        { label: 'AP Bills', href: '/ap/bills' },
        { label: 'New Bill' },
      ]}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header fields */}
        <div className="rounded-lg border border-gray-200 bg-surface p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => { setVendorName(e.target.value); setVendorId(e.target.value ? 'vendor_placeholder' : ''); }}
                placeholder="Search vendors..."
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none ${
                  errors.vendorId ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                }`}
              />
              {errors.vendorId && <p className="mt-1 text-xs text-red-600">{errors.vendorId}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bill Number <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="INV-001"
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none ${
                  errors.billNumber ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                }`}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bill Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
              <select
                value={paymentTermsId}
                onChange={(e) => handleTermsChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Select terms...</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Memo</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Bill description..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Lines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Bill Lines</h2>
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> Add Line
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-28">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-52">Account</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Description</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500 w-20">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500 w-28">Unit Cost</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500 w-28">Amount</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.key} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2">
                        <select
                          value={line.lineType}
                          onChange={(e) => updateLine(line.key, 'lineType', e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        >
                          {lineTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <AccountPicker value={line.glAccountId} onChange={(v) => updateLine(line.key, 'glAccountId', v)} className="w-full" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={line.description} onChange={(e) => updateLine(line.key, 'description', e.target.value)} placeholder="Description" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" value={line.quantity} onChange={(e) => updateLine(line.key, 'quantity', e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                      </td>
                      <td className="px-3 py-2">
                        <MoneyInput value={line.unitCost} onChange={(v) => updateLine(line.key, 'unitCost', v)} />
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums font-medium text-gray-900">
                        {formatAccountingMoney(lineAmounts[idx] ?? 0)}
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeLine(line.key)} disabled={lines.length <= 1} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="space-y-4 p-4 md:hidden">
              {lines.map((line, idx) => (
                <div key={line.key} className="rounded border border-gray-100 p-3 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Line {idx + 1}</span>
                    <button type="button" onClick={() => removeLine(line.key)} disabled={lines.length <= 1} className="text-gray-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <select value={line.lineType} onChange={(e) => updateLine(line.key, 'lineType', e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none">
                    {lineTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <AccountPicker value={line.glAccountId} onChange={(v) => updateLine(line.key, 'glAccountId', v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Qty</label>
                      <input type="number" value={line.quantity} onChange={(e) => updateLine(line.key, 'quantity', e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Unit Cost</label>
                      <MoneyInput value={line.unitCost} onChange={(v) => updateLine(line.key, 'unitCost', v)} />
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium">{formatAccountingMoney(lineAmounts[idx] ?? 0)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
              <div className="text-right">
                <span className="text-xs text-gray-500">Subtotal</span>
                <p className="text-sm font-semibold tabular-nums">{formatAccountingMoney(subtotal)}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500">Tax</span>
                <MoneyInput value={taxAmount} onChange={setTaxAmount} className="w-28" />
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500">Total</span>
                <p className="text-lg font-bold tabular-nums">{formatAccountingMoney(total)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => router.push('/ap/bills')} className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => handleSubmit(false)} disabled={isSaving} className="rounded-lg border border-indigo-300 px-6 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
          <button type="button" onClick={() => handleSubmit(true)} disabled={isSaving} className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Save & Post'}
          </button>
        </div>
      </div>
    </AccountingPageShell>
  );
}
