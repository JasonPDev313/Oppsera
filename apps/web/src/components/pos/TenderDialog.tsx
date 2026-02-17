'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, Check, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import type { POSConfig, Order, TenderSummary, RecordTenderResult } from '@/types/pos';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TenderDialogProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  config: POSConfig;
  shiftId?: string;
  onPaymentComplete: (result: RecordTenderResult) => void;
}

export function TenderDialog({ open, onClose, order, config, shiftId, onPaymentComplete }: TenderDialogProps) {
  const { user } = useAuthContext();
  const { toast } = useToast();

  const [tenderSummary, setTenderSummary] = useState<TenderSummary | null>(null);
  const [amountGiven, setAmountGiven] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<RecordTenderResult | null>(null);

  // Fetch existing tenders when dialog opens
  useEffect(() => {
    if (!open) {
      setAmountGiven('');
      setTipAmount('');
      setLastResult(null);
      return;
    }
    fetchTenders();
  }, [open, order.id]);

  const fetchTenders = async () => {
    try {
      const res = await apiFetch<{ data: TenderSummary }>(
        `/api/v1/orders/${order.id}/tenders?orderTotal=${order.total}`
      );
      setTenderSummary(res.data);
    } catch {
      // First tender — no existing tenders
      setTenderSummary(null);
    }
  };

  const remaining = tenderSummary
    ? tenderSummary.summary.remainingBalance
    : order.total;

  const amountCents = Math.round(parseFloat(amountGiven || '0') * 100);
  const tipCents = Math.round(parseFloat(tipAmount || '0') * 100);

  // Quick amount buttons
  const quickAmounts = [500, 1000, 2000, 5000, 10000]; // $5, $10, $20, $50, $100

  const setExact = () => {
    setAmountGiven((remaining / 100).toFixed(2));
  };

  const handleSubmit = async () => {
    if (amountCents <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ data: RecordTenderResult }>(
        `/api/v1/orders/${order.id}/tenders`,
        {
          method: 'POST',
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            orderId: order.id,
            tenderType: 'cash',
            amountGiven: amountCents,
            tipAmount: tipCents,
            terminalId: config.terminalId,
            employeeId: user?.id ?? '',
            businessDate: todayBusinessDate(),
            shiftId: shiftId ?? undefined,
            posMode: config.posMode,
            version: order.version,
          }),
        }
      );
      const result = res.data;
      setLastResult(result);

      if (result.isFullyPaid) {
        toast.success(`Payment complete! Change: ${formatMoney(result.changeGiven)}`);
        onPaymentComplete(result);
        // Auto-close after 2s
        setTimeout(() => onClose(), 2000);
      } else {
        toast.info(`Partial payment recorded. Remaining: ${formatMoney(result.remainingBalance)}`);
        setAmountGiven('');
        setTipAmount('');
        // Refresh tenders for next split payment
        await fetchTenders();
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        toast.error('Payment conflict — please try again');
      } else {
        const e = err instanceof Error ? err : new Error('Payment failed');
        toast.error(e.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  // Show the "fully paid" success state
  if (lastResult?.isFullyPaid) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" />
        <div className="relative w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900">Payment Complete</h2>
          {lastResult.changeGiven > 0 && (
            <p className="mt-2 text-2xl font-bold text-green-600">
              Change: {formatMoney(lastResult.changeGiven)}
            </p>
          )}
          <p className="mt-2 text-sm text-gray-500">Order fully paid</p>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Cash Payment</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Order summary */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Order Total</span>
              <span className="font-medium text-gray-900">{formatMoney(order.total)}</span>
            </div>
            {tenderSummary && tenderSummary.summary.totalTendered > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Already Paid</span>
                <span className="font-medium text-green-600">{formatMoney(tenderSummary.summary.totalTendered)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
              <span className="text-gray-900">Remaining</span>
              <span className="text-gray-900">{formatMoney(remaining)}</span>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label htmlFor="amountGiven" className="block text-sm font-medium text-gray-700 mb-1">
              Amount Given
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                id="amountGiven"
                type="number"
                step="0.01"
                min="0"
                value={amountGiven}
                onChange={(e) => setAmountGiven(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-3 pl-8 pr-4 text-right text-xl font-bold text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          {/* Quick denomination buttons */}
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map((cents) => (
              <button
                key={cents}
                type="button"
                onClick={() => setAmountGiven((cents / 100).toFixed(2))}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:border-gray-300"
              >
                {formatMoney(cents)}
              </button>
            ))}
            <button
              type="button"
              onClick={setExact}
              className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
            >
              Exact
            </button>
          </div>

          {/* Tip section (only if enabled) */}
          {config.tipEnabled && (
            <div>
              <label htmlFor="tipAmount" className="block text-sm font-medium text-gray-700 mb-1">
                Tip
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  id="tipAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-4 text-right text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}

          {/* Change preview */}
          {amountCents > remaining && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
              <span className="text-sm text-green-700">Change Due: </span>
              <span className="text-lg font-bold text-green-700">{formatMoney(amountCents - remaining)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || amountCents <= 0}
            className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Processing...' : `Pay ${amountCents > 0 ? formatMoney(Math.min(amountCents, remaining)) : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
