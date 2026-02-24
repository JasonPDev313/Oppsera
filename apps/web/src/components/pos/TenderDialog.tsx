'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, DollarSign, FileText, X, Keyboard } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import { PaymentMethodCapture } from '@/components/payments/payment-method-capture';
import { useTokenizerConfig } from '@/hooks/use-tokenizer-config';
import { useTerminalDevice } from '@/hooks/use-terminal-device';
import { CardPresentIndicator } from '@/components/pos/CardPresentIndicator';
import { useSurchargeSettings } from '@/hooks/use-payment-processors';
import type { TokenizeResult } from '@oppsera/shared';
import type { POSConfig, Order, TenderSummary, RecordTenderResult } from '@/types/pos';

type CardPresentStatus = 'idle' | 'waiting' | 'processing' | 'approved' | 'declined' | 'timeout' | 'cancelled';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TENDER_LABELS: Record<string, string> = {
  cash: 'Cash Payment',
  card: 'Card Payment',
  check: 'Check Payment',
  voucher: 'Voucher Payment',
};

interface TenderDialogProps {
  open: boolean;
  onClose: () => void;
  order: Order;
  config: POSConfig;
  tenderType: 'cash' | 'card' | 'check' | 'voucher';
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
  const [cardToken, setCardToken] = useState('');
  const [manualEntry, setManualEntry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<RecordTenderResult | null>(null);

  // Card-present state
  const [cardPresentStatus, setCardPresentStatus] = useState<CardPresentStatus>('idle');
  const [cardPresentResult, setCardPresentResult] = useState<{
    cardBrand?: string | null;
    cardLast4?: string | null;
    errorMessage?: string | null;
  }>({});

  // Check if terminal has a physical payment device assigned
  const { device, hasDevice, isConnected } = useTerminalDevice(
    open && tenderType === 'card' ? config.terminalId : null,
  );
  const isCardPresent = tenderType === 'card' && hasDevice;

  // Surcharge settings — fetch when card tender opens
  const { settings: surchargeSettings } = useSurchargeSettings(
    open && tenderType === 'card' ? undefined : '__disabled__',
  );
  // Find the first enabled surcharge config (tenant-wide or location-specific)
  const activeSurcharge = tenderType === 'card'
    ? surchargeSettings.find((s) => s.isEnabled)
    : null;
  const surchargeRate = activeSurcharge ? parseFloat(activeSurcharge.surchargeRate) : 0;
  const surchargeMaxRate = activeSurcharge ? parseFloat(activeSurcharge.maxSurchargeRate) : 0;
  const effectiveSurchargeRate = surchargeRate > 0 ? Math.min(surchargeRate, surchargeMaxRate) : 0;

  // Only fetch tokenizer config when dialog opens for card tenders (card-NOT-present only)
  const { config: tokenizerConfig, isLoading: tokenizerLoading, error: tokenizerError } = useTokenizerConfig({
    locationId: order.locationId,
    enabled: open && tenderType === 'card' && !isCardPresent,
  });

  const handleCardTokenize = useCallback((result: TokenizeResult) => {
    setCardToken(result.token);
  }, []);

  const handleCardTokenError = useCallback((_msg: string) => {
    setCardToken('');
  }, []);

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
      setCardToken('');
      setManualEntry(false);
      setLastResult(null);
      setCardPresentStatus('idle');
      setCardPresentResult({});
      return;
    }
    fetchTenders();
  }, [open, order.id]);

  const fetchTenders = async () => {
    if (!order.id) return;
    // Don't fetch tenders for unplaced orders — there can't be any yet
    const autoFillExact = tenderType === 'check' || tenderType === 'card';
    if (!isPlacedRef.current) {
      setTenderSummary(null);
      if (autoFillExact) {
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
      if (autoFillExact) {
        setAmountGiven((res.data.summary.remainingBalance / 100).toFixed(2));
      }
    } catch {
      setTenderSummary(null);
      if (autoFillExact) {
        setAmountGiven((order.total / 100).toFixed(2));
      }
    }
  };

  const remaining = tenderSummary
    ? tenderSummary.summary.remainingBalance
    : order.total;

  const amountCents = Math.round(parseFloat(amountGiven || '0') * 100);
  const tipCents = Math.round(parseFloat(tipAmount || '0') * 100);

  // Surcharge calculation (credit card only, applied to the charge amount)
  const chargeAmountForSurcharge = amountCents > 0 ? Math.min(amountCents, remaining) : remaining;
  const surchargeAmountCents = effectiveSurchargeRate > 0
    ? Math.round(chargeAmountForSurcharge * effectiveSurchargeRate)
    : 0;
  const surchargeDisclosure = activeSurcharge?.customerDisclosureText
    ? activeSurcharge.customerDisclosureText
        .replace('{rate}', (effectiveSurchargeRate * 100).toFixed(2))
        .replace('{amount}', (surchargeAmountCents / 100).toFixed(2))
    : null;

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
    if (tenderType === 'card' && !cardToken.trim()) {
      toast.error('Card token is required — scan or swipe a card');
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
      if (tenderType === 'card') {
        body.token = cardToken.trim();
        if (surchargeAmountCents > 0) {
          body.surchargeAmountCents = surchargeAmountCents;
        }
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
        setCardToken('');
        await fetchTenders();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // Prefer structured userMessage from gateway interpreter (cardholder-safe)
        const displayMessage = err.userMessage ?? err.message;
        toast.error(displayMessage);
      } else {
        const e = err instanceof Error ? err : new Error('Payment failed');
        toast.error(e.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Card-present flow ─────────────────────────────────────
  const handleCardPresentSubmit = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Offline — payments disabled until connection restored');
      return;
    }
    const submitAmountCents = amountCents > 0 ? amountCents : remaining;
    if (submitAmountCents <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    if (!order.id) {
      toast.error('Order is still being created — please wait');
      return;
    }

    setIsSubmitting(true);
    setCardPresentStatus('waiting');
    setCardPresentResult({});

    try {
      // Step 1: Send auth-card to the physical terminal
      setCardPresentStatus('waiting');
      const authRes = await apiFetch<{ data: { id: string; status: string; cardLast4?: string; cardBrand?: string; errorMessage?: string; userMessage?: string; suggestedAction?: string; retryable?: boolean } }>(
        '/api/v1/payments/terminal/auth-card',
        {
          method: 'POST',
          headers: { 'X-Location-Id': order.locationId },
          body: JSON.stringify({
            clientRequestId: crypto.randomUUID(),
            terminalId: config.terminalId,
            amountCents: submitAmountCents,
            tipCents: tipCents,
            capture: 'Y',
            orderId: order.id,
            ...(surchargeAmountCents > 0 ? { surchargeAmountCents } : {}),
          }),
        },
      );

      const authResult = authRes.data;

      if (authResult.status === 'captured' || authResult.status === 'authorized') {
        setCardPresentStatus('approved');
        setCardPresentResult({ cardBrand: authResult.cardBrand, cardLast4: authResult.cardLast4 });

        // Step 2: Record the tender via place-and-pay with the gateway payment intent
        const body: Record<string, unknown> = {
          clientRequestId: crypto.randomUUID(),
          placeClientRequestId: crypto.randomUUID(),
          orderId: order.id,
          tenderType: 'card',
          amountGiven: submitAmountCents,
          tipAmount: tipCents,
          terminalId: config.terminalId,
          employeeId: user?.id ?? '',
          businessDate: todayBusinessDate(),
          shiftId: shiftId ?? undefined,
          posMode: config.posMode,
          paymentIntentId: authResult.id,
          entryMode: 'terminal',
          ...(surchargeAmountCents > 0 ? { surchargeAmountCents } : {}),
        };

        const tenderRes = await apiFetch<{ data: RecordTenderResult }>(
          `/api/v1/orders/${order.id}/place-and-pay`,
          {
            method: 'POST',
            headers: { 'X-Location-Id': order.locationId },
            body: JSON.stringify(body),
          },
        );

        const result = tenderRes.data;
        setLastResult(result);
        isPlacedRef.current = true;

        if (result.isFullyPaid) {
          toast.success('Card payment complete!');
          onPaymentComplete(result);
        } else {
          toast.info(`Partial payment recorded. Remaining: ${formatMoney(result.remainingBalance)}`);
          onPartialPayment?.(result.remainingBalance, 0);
          setAmountGiven('');
          setTipAmount('');
          setCardPresentStatus('idle');
          setCardPresentResult({});
          await fetchTenders();
        }
      } else if (authResult.status === 'declined') {
        setCardPresentStatus('declined');
        setCardPresentResult({ errorMessage: authResult.userMessage ?? authResult.errorMessage ?? 'Card declined' });
      } else {
        setCardPresentStatus('declined');
        setCardPresentResult({ errorMessage: authResult.userMessage ?? authResult.errorMessage ?? 'Payment failed' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terminal payment failed';
      if (message.includes('timed out') || message.includes('Timeout')) {
        setCardPresentStatus('timeout');
      } else {
        setCardPresentStatus('declined');
      }
      setCardPresentResult({ errorMessage: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCardPresent = async () => {
    try {
      await apiFetch('/api/v1/payments/terminal/cancel', {
        method: 'POST',
        headers: { 'X-Location-Id': order.locationId },
        body: JSON.stringify({ terminalId: config.terminalId }),
      });
    } catch {
      // Best effort
    }
    setCardPresentStatus('cancelled');
    setIsSubmitting(false);
  };

  const handleRetryCardPresent = () => {
    setCardPresentStatus('idle');
    setCardPresentResult({});
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

  const HeaderIcon = tenderType === 'card' ? CreditCard : tenderType === 'check' ? FileText : DollarSign;
  const headerColor = tenderType === 'card' ? 'text-indigo-600' : tenderType === 'check' ? 'text-blue-600' : 'text-green-600';

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

          {/* Surcharge notice (card payments only) */}
          {tenderType === 'card' && surchargeAmountCents > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-amber-800">Credit Card Surcharge ({(effectiveSurchargeRate * 100).toFixed(2)}%)</span>
                <span className="font-semibold text-amber-900">{formatMoney(surchargeAmountCents)}</span>
              </div>
              {surchargeDisclosure && (
                <p className="text-xs text-amber-700">{surchargeDisclosure}</p>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-amber-200 pt-1">
                <span className="text-amber-900">Total with Surcharge</span>
                <span className="text-amber-900">{formatMoney(chargeAmountForSurcharge + surchargeAmountCents)}</span>
              </div>
            </div>
          )}

          {/* Card-specific fields */}
          {tenderType === 'card' ? (
            isCardPresent ? (
              /* ── Card-present mode: physical terminal device ── */
              <>
                <CardPresentIndicator
                  status={cardPresentStatus}
                  isConnected={isConnected}
                  deviceModel={device?.deviceModel ?? null}
                  hsn={device?.hsn ?? null}
                  cardBrand={cardPresentResult.cardBrand}
                  cardLast4={cardPresentResult.cardLast4}
                  errorMessage={cardPresentResult.errorMessage}
                  onCancel={cardPresentStatus === 'waiting' ? handleCancelCardPresent : undefined}
                  onRetry={cardPresentStatus === 'declined' || cardPresentStatus === 'timeout' ? handleRetryCardPresent : undefined}
                />

                {/* Amount (editable before sending to terminal) */}
                {(cardPresentStatus === 'idle' || cardPresentStatus === 'cancelled') && (
                  <div>
                    <label htmlFor="amountGiven" className="block text-sm font-medium text-gray-700 mb-1">
                      Charge Amount
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
                        className="w-full rounded-lg border border-gray-300 py-3 pl-8 pr-4 text-right text-xl font-bold text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}

                {/* Tip (card-present tips — optional, before sending) */}
                {config.tipEnabled && (cardPresentStatus === 'idle' || cardPresentStatus === 'cancelled') && (
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
                        className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-4 text-right text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Card-not-present mode: token-based entry ── */
              <>
                {/* Dual-mode card entry: Reader (default) / Manual Entry (toggle) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      {manualEntry ? 'Manual Card Entry' : 'Card Reader'}
                    </label>
                    <button
                      type="button"
                      onClick={() => { setManualEntry((v) => !v); setCardToken(''); }}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                    >
                      <Keyboard className="h-3.5 w-3.5" />
                      {manualEntry ? 'Use Card Reader' : 'Manual Entry'}
                    </button>
                  </div>

                  {manualEntry ? (
                    /* Manual entry: hosted iframe tokenizer */
                    <div>
                      <PaymentMethodCapture
                        config={tokenizerConfig}
                        isConfigLoading={tokenizerLoading}
                        configError={tokenizerError}
                        onTokenize={handleCardTokenize}
                        onError={handleCardTokenError}
                        showWallets={false}
                      />
                      {cardToken && (
                        <p className="mt-1 text-xs text-green-600">Card tokenized successfully.</p>
                      )}
                    </div>
                  ) : (
                    /* Reader mode: keyboard wedge input */
                    <div>
                      <input
                        id="cardToken"
                        type="text"
                        value={cardToken}
                        onChange={(e) => setCardToken(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 py-3 px-4 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="Waiting for card swipe/tap..."
                        autoFocus
                      />
                      <p className="mt-1 text-xs text-gray-400">Swipe, tap, or insert card on the reader</p>
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label htmlFor="amountGiven" className="block text-sm font-medium text-gray-700 mb-1">
                    Charge Amount
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
                      className="w-full rounded-lg border border-gray-300 py-3 pl-8 pr-4 text-right text-xl font-bold text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {/* Tip section (card tips) */}
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
                        className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-4 text-right text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
              </>
            )
          ) : tenderType === 'check' ? (
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
            onClick={() => isCardPresent ? handleCardPresentSubmit() : handleSubmit()}
            disabled={
              isSubmitting
              || (cardPresentStatus === 'waiting' || cardPresentStatus === 'processing')
              || (!isCardPresent && amountCents <= 0)
              || (tenderType === 'check' && !checkNumber.trim())
              || (tenderType === 'card' && !isCardPresent && !cardToken.trim())
            }
            className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              tenderType === 'card'
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : tenderType === 'check'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isSubmitting
              ? 'Processing...'
              : isCardPresent
                ? (cardPresentStatus === 'idle' || cardPresentStatus === 'cancelled')
                  ? `Charge ${amountCents > 0 ? formatMoney(Math.min(amountCents, remaining)) : formatMoney(remaining)}`
                  : 'Processing...'
                : `Pay ${amountCents > 0 ? formatMoney(Math.min(amountCents, remaining)) : ''}`
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
