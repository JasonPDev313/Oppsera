'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MoneyInput } from '@/components/accounting/money-input';
import { useVendorCreditMutations } from '@/hooks/use-ap';
import { useToast } from '@/components/ui/toast';

interface VendorCreditDialogProps {
  open: boolean;
  onClose: () => void;
}

export function VendorCreditDialog({ open, onClose }: VendorCreditDialogProps) {
  const { toast } = useToast();
  const { createCredit } = useVendorCreditMutations();

  const [vendorId, setVendorId] = useState('');
  const [creditDate, setCreditDate] = useState(new Date().toISOString().split('T')[0]!);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [glAccountId, setGlAccountId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!vendorId || !amount || !glAccountId) return;
    setIsSubmitting(true);
    try {
      await createCredit.mutateAsync({
        vendorId,
        creditDate,
        amount,
        memo: memo || null,
        glAccountId,
      });
      toast.success('Vendor credit created');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create credit');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-gray-200 bg-surface p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Vendor Credit</h3>
        <p className="text-sm text-gray-500">Create a credit memo (negative bill) for a vendor.</p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              placeholder="Vendor ID"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credit Date</label>
              <input
                type="date"
                value={creditDate}
                onChange={(e) => setCreditDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <MoneyInput value={amount} onChange={setAmount} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expense/Inventory Account <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={glAccountId}
              onChange={(e) => setGlAccountId(e.target.value)}
              placeholder="Account to credit-back"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Memo</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="Reason for credit..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!vendorId || !amount || !glAccountId || isSubmitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Credit'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
