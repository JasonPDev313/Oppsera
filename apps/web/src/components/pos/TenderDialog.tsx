'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, FileText, X } from 'lucide-react';
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

const TENDER_LABELS: Record<string, string> = {
  cash: 'Cash Payment',
  check: 'Check Payment',
  voucher: 'Voucher Payment',
};

interface TenderDialogProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  config: POSConfig;
  tenderType: 'cash' | 'check' | 'voucher';
  shiftId?: string;
  onPaymentComplete: (result: RecordTenderResult) => void;
  onPartialPayment?: (remaining: number, version: number) => void;
}

export function TenderDialog({ open, onClose, order, config, tenderType, shiftId, onPaymentComplete, onPartialPayment }: TenderDialogProps) {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const locationHeaders = { 'X-Location-Id': order.locationId };

  const [tenderSummary, setTenderSummary] = useState<TenderSummary | null>(null);
  const [amountGiven, setAmountGiven] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<RecordTenderResult | null>(null);

  // Track whether the order has been placed (for fetchTenders guard).
  // Starts from the order prop, set to true after first successful payment.
  const isPlacedRef = useRef(order.status === 'placed');

  // Reset when working on a new order
  const prevOrderIdRef = useRef(order.id);
  useEffect(() => {
    if (order.id !== prevOrderIdRef.current) {
      prevOrderIdRef.current = order.id;
      isPlacedRef.current = order.status === 'placed';
      setTenderSummary(null);
    } else if (order.status === 'placed') {
      isPlacedRef.current = true;
    }
  }, [order.id, order.status]);

  // When dialog opens, fetch tenders for split payment reopens
  useEffect(() => {
    if (!open) {
      setAmountGiven('');
      setTipAmount('');
      setCheckNumber('');
      setLastResult(null);
      return;
    }
    fetchTenders();
  }, [open, order.id]);

  const fetchTenders = async () => {
    if (!order.id) return;
    // Don't fetch tenders for unplaced orders — there can't be any yet
    if (!isPlacedRef.current) {
      setTenderSummary(null);
      if (tenderType === 'check') {
        setAmountGiven((order.total / 100).toFixed(2));
      }
      return;
    }
    try {
      const res = await apiFetch<{ data: TenderSummary }>(
        `/api/v1/orders/${order.id}/tenders?orderTotal=${order.total}`,
        { headers: locationHeaders },
      );
      setTenderSummary(res.data);
      if (tenderType === 'check') {
        setAmountGiven((res.data.summary.remainingBalance / 100).toFixed(2));
      }
    } catch {
      setTenderSummary(null);
      if (tenderType === 'check') {
        setAmountGiven((order.total / 100).toFixed(2));
      }
    }
  };

  const remaining = tenderSummary
    ? tenderSummary.summary.remainingBalance
    : order.total;

  const amountCents = Math.round(parseFloat(amountGiven || '0') * 100);
  const tipCents = Math.round(parseFloat(tipAmount || '0') * 100);

  // Quick amount buttons (cash only) — these ADD to the current amount
  const quickAmounts = [100, 500, 1000, 2000, 5000, 10000]; // $1, $5, $10, $20, $50, $100

  const setExact = () => {
    setAmountGiven((remaining / 100).toFixed(2));
  };

  const handleSubmit = async (overrideAmountCents?: number) => {
    // V1 offline guard — block tenders when connectivity is lost
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Offline — payments disabled until connection restored');
      return;
    }
    const submitAmountCents = overrideAmountCents ?? amountCents;
    if (submitAmountCents <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    if (tenderType === 'check' && !checkNumber.trim()) {
      toast.error('Check number is required');
      return;
    }
    if (!order.id) {
      toast.error('Order is still being created — please wait');
      return;
    }
    setIsSubmitting(true);
    try {
      // Single API call: places the order (if still open) + records the tender.
      // The server handles version tracking internally — no client-side version needed.
      const body: Record<string, unknown> = {
        clientRequestId: crypto.randomUUID(),
        placeClientRequestId: crypto.randomUUID(),
        orderId: order.id,
        tenderType,
        amountGiven: submitAmountCents,
        tipAmount: tipCents,
        terminalId: config.terminalId,
        employeeId: user?.id ?? '',
        businessDate: todayBusinessDate(),
        shiftId: shiftId ?? undefined,
        posMode: config.posMode,
      };

      if (tenderType === 'check') {
        body.metadata = { checkNumber: checkNumber.trim() };
      }

      const res = await apiFetch<{ data: RecordTenderResult }>(
        `/api/v1/orders/${order.id}/place-and-pay`,
        {
          method: 'POST',
          headers: locationHeaders,
          body: JSON.stringify(body),
        }
      );
      const result = res.data;
      setLastResult(result);
      isPlacedRef.current = true;

      if (result.isFullyPaid) {
        toast.success(`Payment complete! ${tenderType === 'cash' && result.changeGiven > 0 ? `Change: ${formatMoney(result.changeGiven)}` : ''}`);
        onPaymentComplete(result);
      } else {
        toast.info(`Partial payment recorded. Remaining: ${formatMoney(result.remainingBalance)}`);
        onPartialPayment?.(result.remainingBalance, 0);
        setAmountGiven('');
        setTipAmount('');
        setCheckNumber('');
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
      <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" />
        <div className="relative w-full max-w-md rounded-2xl bg-surface p-8 text-center shadow-xl">
          <div className="payment-success-icon mx-auto flex h-16 w-16 items-center justify-center">
            <svg viewBox="0 0 56 56" className="h-14 w-14" fill="none">
              <circle cx="28" cy="28" r="26" stroke="#22c55e" strokeWidth="2" className="payment-success-circle" />
              <path d="M16 28l8 8 16-16" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="payment-success-check" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-bold text-gray-900">Payment Complete</h2>
          {tenderType === 'cash' && lastResult.changeGiven > 0 && (
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

  const HeaderIcon = tenderType === 'check' ? FileText : DollarSign;
  const headerColor = tenderType === 'check' ? 'text-blue-600' : 'text-green-600';

  return createPortal(
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <HeaderIcon className={`h-5 w-5 ${headerColor}`} />
            <h2 className="text-lg font-semibold text-gray-900">{TENDER_LABELS[tenderType] ?? 'Payment'}</h2>
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

          {/* Check-specific fields */}
          {tenderType === 'check' ? (
            <>
              {/* Amount */}
              <div>
                <label htmlFor="amountGiven" className="block text-sm font-medium text-gray-700 mb-1">
                  Amount
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
                    className="w-full rounded-lg border border-gray-300 py-3 pl-8 pr-4 text-right text-xl font-bold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="0.00"
                  />
                </div>
              </div>
              {/* Check Number */}
              <div>
                <label htmlFor="checkNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Check Number
                </label>
                <input
                  id="checkNumber"
                  type="text"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Enter check number"
                  autoFocus
                />
              </div>
            </>
          ) : (
            <>
              {/* Cash: Amount input */}
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

              {/* Cash: Quick denomination buttons — additive */}
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((cents) => (
                  <button
                    key={cents}
                    type="button"
                    onClick={() => setAmountGiven((prev) => {
                      const current = Math.round(parseFloat(prev || '0') * 100);
                      return ((current + cents) / 100).toFixed(2);
                    })}
                    className="rounded-lg border border-gray-200 bg-surface px-3 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:border-gray-300"
                  >
                    +{formatMoney(cents)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setExact(); handleSubmit(remaining); }}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Processing...' : `Pay Exact — ${formatMoney(remaining)}`}
              </button>

              {/* Cash: Tip section (only if enabled) */}
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

              {/* Cash: Change preview */}
              {amountCents > remaining && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                  <span className="text-sm text-green-700">Change Due: </span>
                  <span className="text-lg font-bold text-green-700">{formatMoney(amountCents - remaining)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-red-500/40 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { setAmountGiven(''); setTipAmount(''); }}
            className="flex-1 rounded-lg border border-orange-500/40 px-4 py-3 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-500/10"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isSubmitting || amountCents <= 0 || (tenderType === 'check' && !checkNumber.trim())}
            className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              tenderType === 'check'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isSubmitting ? 'Processing...' : `Pay ${amountCents > 0 ? formatMoney(Math.min(amountCents, remaining)) : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
