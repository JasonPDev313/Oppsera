'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Banknote } from 'lucide-react';
import type { TipBalanceItem, TipPayoutType } from '@/types/accounting';

interface TipPayoutDialogProps {
  open: boolean;
  onClose: () => void;
  employee: TipBalanceItem | null;
  onSubmit: (input: {
    payoutType: TipPayoutType;
    amountCents: number;
    notes?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

export function TipPayoutDialog({
  open,
  onClose,
  employee,
  onSubmit,
  isLoading,
}: TipPayoutDialogProps) {
  const [payoutType, setPayoutType] = useState<TipPayoutType>('cash');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const maxBalance = employee?.balanceCents ?? 0;
  const maxDollars = (maxBalance / 100).toFixed(2);

  const handlePayFull = useCallback(() => {
    setAmount(maxDollars);
  }, [maxDollars]);

  const handleSubmit = useCallback(async () => {
    setError('');

    const dollars = parseFloat(amount);
    if (isNaN(dollars) || dollars <= 0) {
      setError('Enter a valid amount');
      return;
    }

    const cents = Math.round(dollars * 100);
    if (cents > maxBalance) {
      setError(`Amount exceeds balance of $${maxDollars}`);
      return;
    }

    try {
      await onSubmit({
        payoutType,
        amountCents: cents,
        notes: notes.trim() || undefined,
      });
      // Reset form
      setPayoutType('cash');
      setAmount('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payout failed');
    }
  }, [amount, maxBalance, maxDollars, payoutType, notes, onSubmit]);

  if (!open || !employee) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Pay Out Tips</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Employee Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-900">
              {employee.employeeName ?? employee.employeeId.slice(0, 8)}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              Outstanding balance:{' '}
              <span className="font-semibold text-gray-900">
                ${(employee.balanceCents / 100).toFixed(2)}
              </span>
            </p>
          </div>

          {/* Payout Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payout Method
            </label>
            <div className="flex gap-2">
              {(['cash', 'payroll', 'check'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPayoutType(t)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                    payoutType === t
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t === 'cash' ? 'Cash' : t === 'payroll' ? 'Payroll' : 'Check'}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Amount</label>
              <button
                onClick={handlePayFull}
                className="text-xs text-indigo-600 hover:text-indigo-500"
              >
                Pay full balance
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={maxDollars}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 rounded-md border border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., End of shift payout"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          {/* GL Preview */}
          {amount && parseFloat(amount) > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
              <p className="font-medium text-blue-800 mb-1">GL Journal Preview</p>
              <div className="space-y-0.5 text-blue-700">
                <p>Dr Tips Payable — ${parseFloat(amount).toFixed(2)}</p>
                <p>
                  Cr {payoutType === 'payroll' ? 'Payroll Clearing' : 'Cash'} — $
                  {parseFloat(amount).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !amount}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Confirm Payout'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
