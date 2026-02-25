'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Banknote,
  CreditCard,
  FileText,
  Ticket,
  ArrowLeft,
} from 'lucide-react';
import { Numpad } from './Numpad';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import type { Order, POSConfig, TenderSummary, RecordTenderResult } from '@/types/pos';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type TenderType = 'cash' | 'check' | 'voucher' | 'card';

interface PaymentPanelProps {
  order: Order;
  config: POSConfig;
  shiftId?: string;
  onPaymentComplete: (result: RecordTenderResult) => void;
  onCancel: () => void;
}

// ── Tender Type Selector ──────────────────────────────────────────

const TENDER_TYPES: { type: TenderType; label: string; icon: typeof Banknote; color: string }[] = [
  { type: 'cash', label: 'Cash', icon: Banknote, color: 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100' },
  { type: 'card', label: 'Card', icon: CreditCard, color: 'text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100' },
  { type: 'check', label: 'Check', icon: FileText, color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100' },
  { type: 'voucher', label: 'Voucher', icon: Ticket, color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' },
];

// ── Quick Cash Amounts ────────────────────────────────────────────

const QUICK_AMOUNTS = [2000, 5000, 10000]; // $20, $50, $100

// ── Payment Panel ─────────────────────────────────────────────────

export function PaymentPanel({ order, config, shiftId, onPaymentComplete, onCancel }: PaymentPanelProps) {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const locationHeaders = { 'X-Location-Id': order.locationId };

  const [selectedType, setSelectedType] = useState<TenderType | null>(null);
  const [amount, setAmount] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [cardToken, setCardToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tenderSummary, setTenderSummary] = useState<TenderSummary | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<RecordTenderResult | null>(null);

  const isPlacedRef = useRef(order.status === 'placed');
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(0 as unknown as ReturnType<typeof setTimeout>);

  // Update placed status when order status changes
  useEffect(() => {
    if (order.status === 'placed') isPlacedRef.current = true;
  }, [order.status]);

  // No preemptive place call — place-and-pay handles open orders atomically.
  // Pre-emptive place calls compete for the same FOR UPDATE lock and exhaust
  // the Vercel connection pool (max 2), causing the real tender to stall.

  // Fetch existing tenders when a type is selected (for split payments)
  useEffect(() => {
    if (!selectedType || !order.id) return;
    if (!isPlacedRef.current) {
      setTenderSummary(null);
      return;
    }
    apiFetch<{ data: TenderSummary }>(
      `/api/v1/orders/${order.id}/tenders?orderTotal=${order.total}`,
      { headers: locationHeaders },
    )
      .then((res) => setTenderSummary(res.data))
      .catch(() => setTenderSummary(null));
  }, [selectedType, order.id]);

  const remaining = tenderSummary
    ? tenderSummary.summary.remainingBalance
    : order.total;

  const amountCents = Math.round(parseFloat(amount || '0') * 100);
  const tipCents = Math.round(parseFloat(tipAmount || '0') * 100);

  // Auto-dismiss success after 3s
  useEffect(() => {
    if (paymentSuccess?.isFullyPaid) {
      successTimerRef.current = setTimeout(() => {
        onPaymentComplete(paymentSuccess);
      }, 3000);
      return () => clearTimeout(successTimerRef.current);
    }
  }, [paymentSuccess, onPaymentComplete]);

  const handleSubmit = useCallback(async (overrideCents?: number) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Offline — payments disabled until connection restored');
      return;
    }
    const submitCents = overrideCents ?? amountCents;
    if (submitCents <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    if (selectedType === 'check' && !checkNumber.trim()) {
      toast.error('Check number is required');
      return;
    }
    if (selectedType === 'card' && !cardToken.trim()) {
      toast.error('Card token is required');
      return;
    }
    if (!order.id) {
      toast.error('Order is still being created — please wait');
      return;
    }
    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        clientRequestId: crypto.randomUUID(),
        placeClientRequestId: crypto.randomUUID(),
        orderId: order.id,
        tenderType: selectedType,
        amountGiven: submitCents,
        tipAmount: tipCents,
        terminalId: config.terminalId,
        employeeId: user?.id ?? '',
        businessDate: todayBusinessDate(),
        shiftId: shiftId ?? undefined,
        posMode: config.posMode,
      };
      if (selectedType === 'check') {
        body.metadata = { checkNumber: checkNumber.trim() };
      }
      if (selectedType === 'card') {
        body.token = cardToken.trim();
      }

      const res = await apiFetch<{ data: RecordTenderResult }>(
        `/api/v1/orders/${order.id}/place-and-pay`,
        { method: 'POST', headers: locationHeaders, body: JSON.stringify(body) },
      );
      const result = res.data;
      isPlacedRef.current = true;

      if (result.isFullyPaid) {
        setPaymentSuccess(result);
        toast.success(
          selectedType === 'cash' && result.changeGiven > 0
            ? `Payment complete! Change: ${formatMoney(result.changeGiven)}`
            : 'Payment complete!',
        );
      } else {
        toast.info(`Partial payment. Remaining: ${formatMoney(result.remainingBalance)}`);
        setAmount('');
        setTipAmount('');
        setCheckNumber('');
        // Refresh tenders
        try {
          const ts = await apiFetch<{ data: TenderSummary }>(
            `/api/v1/orders/${order.id}/tenders?orderTotal=${order.total}`,
            { headers: locationHeaders },
          );
          setTenderSummary(ts.data);
        } catch { /* best-effort */ }
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 402) {
        toast.error('Card declined — please try a different card');
      } else if (err instanceof ApiError && err.statusCode === 409) {
        toast.error('Payment conflict — please try again');
      } else if (err instanceof ApiError && err.statusCode === 502) {
        toast.error('Card processing error — please try again');
      } else {
        toast.error(err instanceof Error ? err.message : 'Payment failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [amountCents, tipCents, selectedType, checkNumber, cardToken, order, config, shiftId, user, toast, locationHeaders]);

  // ── Success State ─────────────────────────────────────────────

  if (paymentSuccess?.isFullyPaid) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center p-6"
        onClick={() => onPaymentComplete(paymentSuccess)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPaymentComplete(paymentSuccess); }}
      >
        <div className="payment-success-icon mx-auto flex h-20 w-20 items-center justify-center">
          <svg viewBox="0 0 56 56" className="h-18 w-18" fill="none">
            <circle cx="28" cy="28" r="26" stroke="#22c55e" strokeWidth="2" className="payment-success-circle" />
            <path d="M16 28l8 8 16-16" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="payment-success-check" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-gray-900">Payment Complete</h2>
        {selectedType === 'cash' && paymentSuccess.changeGiven > 0 && (
          <p className="mt-2 text-3xl font-bold text-green-600">
            Change: {formatMoney(paymentSuccess.changeGiven)}
          </p>
        )}
        <p className="mt-3 text-sm text-gray-400">Tap anywhere to continue</p>
      </div>
    );
  }

  // ── Tender Type Selection ─────────────────────────────────────

  if (!selectedType) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:scale-[0.97]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Payment</h2>
            <p className="text-sm text-gray-500">Total: {formatMoney(order.total)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs font-medium uppercase text-gray-500">Select Payment Method</p>
          {TENDER_TYPES.map(({ type, label, icon: Icon, color }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setSelectedType(type);
                if (type === 'check' || type === 'card') setAmount((remaining / 100).toFixed(2));
              }}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition-all active:scale-[0.98] ${color}`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-base font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Tender Entry ──────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setSelectedType(null);
            setAmount('');
            setTipAmount('');
            setCheckNumber('');
            setCardToken('');
          }}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:scale-[0.97]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900 capitalize">
            {selectedType} Payment
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Remaining balance */}
        <div className="rounded-xl bg-gray-50 p-4 text-center">
          <p className="text-xs font-medium uppercase text-gray-500">
            {tenderSummary && tenderSummary.summary.totalTendered > 0 ? 'Remaining' : 'Total Due'}
          </p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{formatMoney(remaining)}</p>
          {tenderSummary && tenderSummary.summary.totalTendered > 0 && (
            <p className="mt-1 text-xs text-green-600">
              Paid: {formatMoney(tenderSummary.summary.totalTendered)}
            </p>
          )}
        </div>

        {/* Amount display */}
        <div className="rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xs font-medium text-gray-500 mb-1">
            {selectedType === 'cash' ? 'Amount Given' : 'Amount'}
          </p>
          <p className="text-2xl font-bold text-gray-900">
            ${amount || '0.00'}
          </p>
          {/* Change preview */}
          {selectedType === 'cash' && amountCents > remaining && (
            <p className="mt-1 text-sm font-semibold text-green-600">
              Change: {formatMoney(amountCents - remaining)}
            </p>
          )}
        </div>

        {/* Check number input */}
        {selectedType === 'check' && (
          <div>
            <label htmlFor="pp-check-num" className="block text-xs font-medium text-gray-500 mb-1">
              Check Number
            </label>
            <input
              id="pp-check-num"
              type="text"
              value={checkNumber}
              onChange={(e) => setCheckNumber(e.target.value)}
              placeholder="Enter check number"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        )}

        {/* Card token input (V1: manual token from CardSecure iframe or device) */}
        {selectedType === 'card' && (
          <div>
            <label htmlFor="pp-card-token" className="block text-xs font-medium text-gray-500 mb-1">
              Card Token
            </label>
            <input
              id="pp-card-token"
              type="text"
              value={cardToken}
              onChange={(e) => setCardToken(e.target.value)}
              placeholder="Scan card or enter token"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-400">
              Token from card reader or CardSecure hosted field
            </p>
          </div>
        )}

        {/* Numpad */}
        <Numpad value={amount} onChange={setAmount} disabled={isSubmitting} />

        {/* Quick amounts (cash only) */}
        {selectedType === 'cash' && (
          <div className="grid grid-cols-3 gap-2">
            {QUICK_AMOUNTS.map((cents) => (
              <button
                key={cents}
                type="button"
                disabled={isSubmitting}
                onClick={() => setAmount((prev) => {
                  const current = Math.round(parseFloat(prev || '0') * 100);
                  return ((current + cents) / 100).toFixed(2);
                })}
                className="rounded-lg border border-gray-200 px-2 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:scale-[0.97] disabled:opacity-40"
              >
                +{formatMoney(cents)}
              </button>
            ))}
          </div>
        )}

        {/* Exact amount button */}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleSubmit(remaining)}
          className="w-full rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 active:scale-[0.97] disabled:opacity-50"
        >
          {isSubmitting ? 'Processing...' : `Pay Exact — ${formatMoney(remaining)}`}
        </button>

        {/* Tip section */}
        {config.tipEnabled && (selectedType === 'cash' || selectedType === 'card') && (
          <div>
            <label htmlFor="pp-tip" className="block text-xs font-medium text-gray-500 mb-1">
              Tip
            </label>
            {/* Percentage quick-select buttons from tip settings */}
            {(config.tipSettings?.percentageOptions ?? [15, 18, 20, 25]).length > 0 && (
              <div className="mb-2 flex gap-1.5">
                {(config.tipSettings?.percentageOptions ?? [15, 18, 20, 25]).map((pct) => {
                  const tipBase = config.tipSettings?.calculateBeforeTax !== false
                    ? order.subtotal - (order.discountTotal ?? 0)
                    : order.total;
                  const tipVal = ((tipBase * pct) / 10000).toFixed(2);
                  const isSelected = tipAmount === tipVal;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setTipAmount(isSelected ? '' : tipVal)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors active:scale-[0.97] ${
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setTipAmount('')}
                  className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:bg-gray-50 active:scale-[0.97]"
                >
                  None
                </button>
              </div>
            )}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                id="pp-tip"
                type="number"
                step="0.01"
                min="0"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-8 pr-4 text-right text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
                placeholder="0.00"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer: Cancel / Pay */}
      <div className="flex gap-3 border-t border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 active:scale-[0.97]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={isSubmitting || amountCents <= 0 || (selectedType === 'check' && !checkNumber.trim()) || (selectedType === 'card' && !cardToken.trim())}
          className="flex-[2] rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {isSubmitting ? 'Processing...' : `Pay ${amountCents > 0 ? formatMoney(Math.min(amountCents, remaining)) : ''}`}
        </button>
      </div>
    </div>
  );
}
