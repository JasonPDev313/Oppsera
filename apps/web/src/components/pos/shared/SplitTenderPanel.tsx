'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Banknote,
  CreditCard,
  FileText,
  X,
  Plus,
  Check,
} from 'lucide-react';
import { Numpad } from './Numpad';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import type { Order, POSConfig, TenderSummary, RecordTenderResult, Tender } from '@/types/pos';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type TenderType = 'cash' | 'card' | 'check';

const TENDER_OPTIONS: { type: TenderType; label: string; icon: typeof Banknote; color: string }[] = [
  { type: 'cash', label: 'Cash', icon: Banknote, color: 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100' },
  { type: 'card', label: 'Card', icon: CreditCard, color: 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100' },
  { type: 'check', label: 'Check', icon: FileText, color: 'text-purple-600 bg-purple-50 border-purple-200 hover:bg-purple-100' },
];

type PanelStep = 'summary' | 'pick-type' | 'enter-amount';

interface SplitTenderPanelProps {
  open: boolean;
  order: Order;
  config: POSConfig;
  shiftId?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function SplitTenderPanel({
  open,
  order,
  config,
  shiftId,
  onComplete,
  onCancel,
}: SplitTenderPanelProps) {
  const { user } = useAuthContext();
  const { toast } = useToast();
  const locationHeaders = { 'X-Location-Id': order.locationId };

  const [step, setStep] = useState<PanelStep>('summary');
  const [selectedType, setSelectedType] = useState<TenderType | null>(null);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [totalTendered, setTotalTendered] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const isPlacedRef = useRef(order.status === 'placed');

  useEffect(() => {
    if (order.status === 'placed') isPlacedRef.current = true;
  }, [order.status]);

  // Fetch existing tenders when panel opens or after a new tender is recorded
  const fetchTenders = useCallback(async () => {
    if (!order.id) return;
    if (!isPlacedRef.current) {
      setTenders([]);
      setTotalTendered(0);
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: TenderSummary }>(
        `/api/v1/orders/${order.id}/tenders?orderTotal=${order.total}`,
        { headers: locationHeaders },
      );
      const activeTenders = res.data.tenders.filter(
        (t) => t.effectiveStatus !== 'reversed',
      );
      setTenders(activeTenders.map((t) => ({
        id: t.id,
        tenantId: t.tenantId,
        locationId: t.locationId,
        orderId: t.orderId,
        tenderType: t.tenderType,
        tenderSequence: t.tenderSequence,
        amount: t.amount,
        tipAmount: t.tipAmount,
        changeGiven: t.changeGiven,
        amountGiven: t.amountGiven,
        currency: t.currency,
        status: t.status,
        businessDate: t.businessDate,
        shiftId: t.shiftId,
        posMode: t.posMode,
        source: t.source,
        employeeId: t.employeeId,
        terminalId: t.terminalId,
        allocationSnapshot: t.allocationSnapshot,
        metadata: t.metadata,
        createdAt: t.createdAt,
        createdBy: t.createdBy,
      })));
      setTotalTendered(res.data.summary.totalTendered);
    } catch {
      // best-effort
    } finally {
      setIsLoading(false);
    }
  }, [order.id, order.total]);

  // Fetch on open
  useEffect(() => {
    if (!open) {
      setStep('summary');
      setSelectedType(null);
      setAmount('');
      setTenders([]);
      setTotalTendered(0);
      return;
    }
    fetchTenders();
  }, [open, fetchTenders]);

  const remaining = order.total - totalTendered;
  const isFullyPaid = remaining <= 0;
  const amountCents = Math.round(parseFloat(amount || '0') * 100);

  const handlePickType = (type: TenderType) => {
    setSelectedType(type);
    setAmount((remaining / 100).toFixed(2));
    setStep('enter-amount');
  };

  const handleBackToSummary = () => {
    setStep('summary');
    setSelectedType(null);
    setAmount('');
  };

  const handleSubmitTender = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Offline — payments disabled until connection restored');
      return;
    }
    if (amountCents <= 0) {
      toast.error('Amount must be greater than zero');
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
        amountGiven: amountCents,
        tipAmount: 0,
        terminalId: config.terminalId,
        employeeId: user?.id ?? '',
        businessDate: todayBusinessDate(),
        shiftId: shiftId ?? undefined,
        posMode: config.posMode,
      };

      const res = await apiFetch<{ data: RecordTenderResult }>(
        `/api/v1/orders/${order.id}/place-and-pay`,
        { method: 'POST', headers: locationHeaders, body: JSON.stringify(body) },
      );
      const result = res.data;
      isPlacedRef.current = true;

      if (result.isFullyPaid) {
        toast.success(
          selectedType === 'cash' && result.changeGiven > 0
            ? `Payment complete! Change: ${formatMoney(result.changeGiven)}`
            : 'All payments recorded!',
        );
      } else {
        toast.info(`Payment added. Remaining: ${formatMoney(result.remainingBalance)}`);
      }

      // Refresh tenders and go back to summary
      await fetchTenders();
      setStep('summary');
      setSelectedType(null);
      setAmount('');
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        toast.error('Payment conflict — please try again');
      } else {
        toast.error(err instanceof Error ? err.message : 'Payment failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [amountCents, selectedType, order, config, shiftId, user, toast, fetchTenders]);

  if (!open || typeof document === 'undefined') return null;

  const TENDER_TYPE_LABELS: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    check: 'Check',
    voucher: 'Voucher',
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />

      {/* Panel */}
      <div className="relative flex w-full max-w-lg flex-col rounded-2xl bg-surface shadow-xl" style={{ maxHeight: '90vh' }}>
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Split Payment</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:scale-[0.97]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Order Total Bar ────────────────────────────────── */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Order Total</span>
            <span className="font-semibold text-gray-900">{formatMoney(order.total)}</span>
          </div>
        </div>

        {/* ── Scrollable Content ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* == Step: SUMMARY == */}
          {step === 'summary' && (
            <>
              {/* Recorded tenders list */}
              {tenders.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Payments Recorded
                  </p>
                  {tenders.map((t, idx) => {
                    const Icon = t.tenderType === 'cash' ? Banknote
                      : t.tenderType === 'card' ? CreditCard
                      : FileText;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3"
                      >
                        <Icon className="h-4 w-4 text-gray-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {TENDER_TYPE_LABELS[t.tenderType] ?? t.tenderType} #{idx + 1}
                          </p>
                          {t.tenderType === 'cash' && t.changeGiven > 0 && (
                            <p className="text-xs text-gray-500">
                              Given: {formatMoney(t.amountGiven)} / Change: {formatMoney(t.changeGiven)}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-gray-900 shrink-0">
                          {formatMoney(t.amount)}
                        </span>
                      </div>
                    );
                  })}

                  {/* Running total */}
                  <div className="flex items-center justify-between border-t border-gray-200 pt-2 px-1">
                    <span className="text-sm text-gray-600">Total Paid</span>
                    <span className="text-sm font-semibold text-green-600">
                      {formatMoney(totalTendered)}
                    </span>
                  </div>
                </div>
              )}

              {tenders.length === 0 && !isLoading && (
                <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
                  <p className="text-sm text-gray-500">No payments recorded yet</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Add payments to split this order across multiple tenders
                  </p>
                </div>
              )}

              {isLoading && (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-500">Loading payments...</p>
                </div>
              )}

              {/* Remaining balance */}
              <div className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Remaining Balance
                </p>
                <p className={`mt-1 text-3xl font-bold ${isFullyPaid ? 'text-green-600' : 'text-gray-900'}`}>
                  {isFullyPaid ? '$0.00' : formatMoney(remaining)}
                </p>
              </div>

              {/* Add Payment button */}
              {!isFullyPaid && (
                <button
                  type="button"
                  onClick={() => setStep('pick-type')}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 active:scale-[0.97]"
                >
                  <Plus className="h-4 w-4" />
                  Add Payment
                </button>
              )}
            </>
          )}

          {/* == Step: PICK TYPE == */}
          {step === 'pick-type' && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Select Payment Method
              </p>
              {TENDER_OPTIONS.map(({ type, label, icon: Icon, color }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handlePickType(type)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition-all active:scale-[0.97] ${color}`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-base font-semibold">{label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={handleBackToSummary}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 active:scale-[0.97]"
              >
                Back
              </button>
            </div>
          )}

          {/* == Step: ENTER AMOUNT == */}
          {step === 'enter-amount' && selectedType && (
            <div className="space-y-4">
              {/* Sub-tender header */}
              <div className="flex items-center gap-2">
                {selectedType === 'cash' && <Banknote className="h-5 w-5 text-green-600" />}
                {selectedType === 'card' && <CreditCard className="h-5 w-5 text-blue-600" />}
                {selectedType === 'check' && <FileText className="h-5 w-5 text-purple-600" />}
                <span className="text-sm font-semibold text-gray-900 capitalize">
                  {selectedType} Payment
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  Remaining: {formatMoney(remaining)}
                </span>
              </div>

              {/* Amount display */}
              <div className="rounded-xl border border-gray-200 p-3 text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">Amount</p>
                <p className="text-2xl font-bold text-gray-900">${amount || '0.00'}</p>
                {selectedType === 'cash' && amountCents > remaining && remaining > 0 && (
                  <p className="mt-1 text-sm font-semibold text-green-600">
                    Change: {formatMoney(amountCents - remaining)}
                  </p>
                )}
              </div>

              {/* Numpad */}
              <Numpad value={amount} onChange={setAmount} disabled={isSubmitting} />

              {/* Exact amount shortcut */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setAmount((remaining / 100).toFixed(2))}
                className="w-full rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 active:scale-[0.97] disabled:opacity-50"
              >
                Exact Amount  {formatMoney(remaining)}
              </button>

              {/* Submit / Back buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBackToSummary}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmitTender}
                  disabled={isSubmitting || amountCents <= 0}
                  className="flex-[2] rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {isSubmitting
                    ? 'Processing...'
                    : `Record ${formatMoney(Math.min(amountCents, remaining))}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onComplete}
            disabled={!isFullyPaid}
            className="flex-[2] flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-green-300"
          >
            <Check className="h-4 w-4" />
            Complete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
