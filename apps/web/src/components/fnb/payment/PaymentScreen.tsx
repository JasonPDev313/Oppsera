'use client';

import { useState, useCallback } from 'react';
import type { TokenizeResult, TokenizerClientConfig } from '@oppsera/shared';
import type { FnbTabDetail, CheckSummary } from '@/types/fnb';
import { PaymentMethodCapture } from '@/components/payments/payment-method-capture';
import { TenderGrid, type TenderType } from './TenderGrid';
import { CashKeypad } from './CashKeypad';
import { TipPrompt } from './TipPrompt';
import { ReceiptOptions, type ReceiptAction } from './ReceiptOptions';
import { PreAuthCapture } from './PreAuthCapture';
import { PaymentAdjustments } from './PaymentAdjustments';
import { GiftCardPanel } from './GiftCardPanel';
import { HouseAccountPanel } from './HouseAccountPanel';
import { CheckCircle, AlertTriangle, RotateCcw, ArrowRight, Undo2, XCircle, RefreshCw, Keyboard } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

export interface TenderResult {
  isFullyPaid: boolean;
  remainingCents: number;
}

type PaymentStep =
  | 'tender_select'
  | 'card_entry'
  | 'cash_keypad'
  | 'tip_prompt'
  | 'gift_card_panel'
  | 'house_account_panel'
  | 'confirm'
  | 'partial_summary'
  | 'receipt'
  | 'error'
  | 'done';

interface RecordedTender {
  type: TenderType;
  amountCents: number;
  tipCents: number;
}

interface PreAuth {
  id: string;
  tabId: string;
  status: string;
  authAmountCents: number;
  cardLast4: string;
  cardBrand: string | null;
  authorizedAt: string;
  expiresAt?: string | null;
}

interface PaymentScreenProps {
  tab: FnbTabDetail;
  check: CheckSummary;
  preauths: PreAuth[];
  onTender: (type: TenderType, amountCents: number, tipCents: number) => Promise<TenderResult>;
  onVoidLastTender: () => Promise<TenderResult>;
  onCapturePreAuth: (preauthId: string, captureAmountCents: number, tipCents: number) => Promise<void>;
  onVoidPreAuth: (preauthId: string) => Promise<void>;
  onReceipt: (action: ReceiptAction, email?: string) => void;
  onClose: () => void;
  onCancelPayment: () => void;
  onCheckRefresh?: () => void;
  disabled?: boolean;
  /** Skip the confirm step and execute payment immediately */
  skipConfirm?: boolean;
  /** Called to initiate a split by seat */
  onSplitBySeat?: () => void;
  /** Called to initiate an even split */
  onSplitEven?: () => void;
  /** Tokenizer configuration for manual card entry */
  tokenizerConfig?: TokenizerClientConfig | null;
  /** Whether tokenizer config is loading */
  tokenizerLoading?: boolean;
  /** Tokenizer config error */
  tokenizerError?: string | null;
}

// ── Component ────────────────────────────────────────────────────

export function PaymentScreen({
  tab,
  check,
  preauths,
  onTender,
  onVoidLastTender,
  onCapturePreAuth,
  onVoidPreAuth,
  onReceipt,
  onClose,
  onCancelPayment,
  onCheckRefresh,
  disabled,
  skipConfirm,
  onSplitBySeat,
  onSplitEven,
  tokenizerConfig,
  tokenizerLoading,
  tokenizerError,
}: PaymentScreenProps) {
  const [step, setStep] = useState<PaymentStep>('tender_select');
  const [selectedTender, setSelectedTender] = useState<TenderType | null>(null);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [pendingTip, setPendingTip] = useState(0);
  const [tenders, setTenders] = useState<RecordedTender[]>([]);
  const [lastTenderAmount, setLastTenderAmount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorRetryable, setErrorRetryable] = useState(true);
  const [errorSuggestedAction, setErrorSuggestedAction] = useState<string | null>(null);
  const [manualCardEntry, setManualCardEntry] = useState(false);
  const [cardToken, setCardToken] = useState<string | null>(null);

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // ── Card tokenize handlers ──────────────────────────────────────
  const handleCardTokenize = useCallback((result: TokenizeResult) => {
    setCardToken(result.token);
    setErrorMessage('');
    // Proceed to tip prompt once card is captured
    setStep('tip_prompt');
  }, []);

  const handleCardTokenError = useCallback((msg: string) => {
    setCardToken(null);
    setErrorMessage(msg);
  }, []);

  // ── Step: tender_select → cash_keypad, card_entry, tip_prompt, or specialty panel
  const handleTenderSelect = useCallback((type: TenderType) => {
    setSelectedTender(type);
    setErrorMessage('');
    setCardToken(null);
    setManualCardEntry(false);
    if (type === 'cash') {
      setStep('cash_keypad');
    } else if (type === 'card') {
      setStep('card_entry');
    } else if (type === 'gift_card') {
      setStep('gift_card_panel');
    } else if (type === 'house_account') {
      setStep('house_account_panel');
    } else {
      setStep('tip_prompt');
    }
  }, []);

  // ── Fast Cash: one-tap cash payment (bypasses keypad) ─────────────
  const handleFastCash = useCallback(async (amountCents: number) => {
    setSelectedTender('cash');
    setPendingAmount(amountCents);
    setPendingTip(0);
    if (skipConfirm) {
      // Execute immediately
      setIsProcessing(true);
      setErrorMessage('');
      try {
        const result = await onTender('cash', amountCents, 0);
        const tender: RecordedTender = { type: 'cash', amountCents, tipCents: 0 };
        setTenders((prev) => [...prev, tender]);
        setLastTenderAmount(amountCents);
        setStep(result.isFullyPaid ? 'receipt' : 'partial_summary');
      } catch (err: unknown) {
        const e = err as Record<string, unknown> | Error;
        const userMsg = 'userMessage' in e ? String(e.userMessage) : null;
        setErrorMessage(userMsg ?? (err instanceof Error ? err.message : 'Payment failed'));
        setErrorRetryable('retryable' in e ? e.retryable !== false : true);
        setErrorSuggestedAction('suggestedAction' in e ? (e.suggestedAction as string | null) : null);
        setStep('error');
      } finally {
        setIsProcessing(false);
      }
    } else {
      setStep('confirm');
    }
  }, [skipConfirm, onTender]);

  // ── Step: cash_keypad → confirm ───────────────────────────────
  const handleCashSubmit = useCallback((amountCents: number) => {
    setPendingAmount(amountCents);
    setPendingTip(0);
    setStep('confirm');
  }, []);

  // ── Step: gift_card_panel / house_account_panel → confirm ───
  const handleSpecialtyTender = useCallback((amountCents: number) => {
    setPendingAmount(amountCents);
    setPendingTip(0);
    setStep('confirm');
  }, []);

  // ── Step: tip_prompt → confirm ────────────────────────────────
  const handleTipSelect = useCallback(
    (tip: number) => {
      setPendingTip(tip);
      setPendingAmount(check.remainingCents);
      setStep('confirm');
    },
    [check.remainingCents],
  );

  // ── Step: confirm → execute tender → receipt or partial_summary
  const handleConfirmPayment = useCallback(async () => {
    if (!selectedTender) return;
    setIsProcessing(true);
    setErrorMessage('');
    try {
      const result = await onTender(selectedTender, pendingAmount, pendingTip);
      const tender: RecordedTender = {
        type: selectedTender,
        amountCents: pendingAmount,
        tipCents: pendingTip,
      };
      setTenders((prev) => [...prev, tender]);
      setLastTenderAmount(pendingAmount);

      if (result.isFullyPaid) {
        setStep('receipt');
      } else {
        setStep('partial_summary');
      }
    } catch (err: unknown) {
      const e = err as Record<string, unknown> | Error;
      const userMsg = 'userMessage' in e ? String(e.userMessage) : null;
      setErrorMessage(userMsg ?? (err instanceof Error ? err.message : 'Payment failed. Please try again.'));
      setErrorRetryable('retryable' in e ? e.retryable !== false : true);
      setErrorSuggestedAction('suggestedAction' in e ? (e.suggestedAction as string | null) : null);
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedTender, pendingAmount, pendingTip, onTender]);

  // ── Step: confirm → cancel back to tender_select ──────────────
  const handleCancelConfirm = useCallback(() => {
    setPendingAmount(0);
    setPendingTip(0);
    setStep('tender_select');
  }, []);

  // ── Step: partial_summary → add another or void last ──────────
  const handleAddAnother = useCallback(() => {
    setSelectedTender(null);
    setPendingAmount(0);
    setPendingTip(0);
    setStep('tender_select');
  }, []);

  const handleVoidLast = useCallback(async () => {
    if (tenders.length === 0) return;
    setIsProcessing(true);
    try {
      await onVoidLastTender();
      setTenders((prev) => prev.slice(0, -1));
      setStep('tender_select');
    } catch (err: unknown) {
      const e = err as Record<string, unknown> | Error;
      const userMsg = 'userMessage' in e ? String(e.userMessage) : null;
      setErrorMessage(userMsg ?? (err instanceof Error ? err.message : 'Failed to void tender'));
      setErrorRetryable(true);
      setErrorSuggestedAction(null);
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  }, [tenders.length, onVoidLastTender]);

  // ── Step: error → retry or cancel ─────────────────────────────
  const handleRetry = useCallback(() => {
    setErrorMessage('');
    setErrorRetryable(true);
    setErrorSuggestedAction(null);
    setStep('tender_select');
  }, []);

  const handleRetryDifferentCard = useCallback(() => {
    setErrorMessage('');
    setErrorRetryable(true);
    setErrorSuggestedAction(null);
    setSelectedTender('card');
    setStep('tip_prompt');
  }, []);

  // ── Pre-auth capture ──────────────────────────────────────────
  const handleCapturePreAuth = useCallback(
    async (preauthId: string, captureAmountCents: number, tip: number) => {
      setIsProcessing(true);
      try {
        await onCapturePreAuth(preauthId, captureAmountCents, tip);
        setStep('receipt');
      } catch (err: unknown) {
        const e = err as Record<string, unknown> | Error;
        const userMsg = 'userMessage' in e ? String(e.userMessage) : null;
        setErrorMessage(userMsg ?? (err instanceof Error ? err.message : 'Pre-auth capture failed'));
        setErrorRetryable('retryable' in e ? e.retryable !== false : true);
        setErrorSuggestedAction('suggestedAction' in e ? (e.suggestedAction as string | null) : null);
        setStep('error');
      } finally {
        setIsProcessing(false);
      }
    },
    [onCapturePreAuth],
  );

  const handleVoidPreAuth = useCallback(
    async (preauthId: string) => {
      setIsProcessing(true);
      try {
        await onVoidPreAuth(preauthId);
      } finally {
        setIsProcessing(false);
      }
    },
    [onVoidPreAuth],
  );

  // ── Receipt → close ───────────────────────────────────────────
  const handleReceipt = useCallback(
    (action: ReceiptAction) => {
      onReceipt(action);
      onClose();
    },
    [onReceipt, onClose],
  );

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col sm:flex-row h-full"
      style={{ backgroundColor: 'var(--fnb-bg-primary)' }}
    >
      {/* ── Check Summary Sidebar ──────────────────────────────── */}
      <div
        className="shrink-0 border-b sm:border-b-0 sm:border-r sm:w-[320px] flex flex-col overflow-y-auto max-h-[30vh] sm:max-h-none"
        style={{
          borderColor: 'rgba(148, 163, 184, 0.15)',
          backgroundColor: 'var(--fnb-bg-surface)',
        }}
      >
        <div
          className="p-4 border-b"
          style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
        >
          <h3
            className="text-sm font-bold"
            style={{ color: 'var(--fnb-text-primary)' }}
          >
            Tab #{tab.tabNumber} — {tab.displayLabel ?? `Table ${tab.tableNumber}`}
          </h3>
          <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
            Server: {tab.serverName ?? 'Unknown'} · Party: {tab.partySize ?? 1}
          </span>
        </div>

        {/* Line items */}
        <div className="flex-1 p-3 overflow-y-auto">
          {tab.lines.map((line) => (
            <div
              key={line.id}
              className="flex items-start justify-between py-1.5"
              style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}
            >
              <div className="flex-1">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--fnb-text-primary)' }}
                >
                  {line.qty > 1 && (
                    <span style={{ color: 'var(--fnb-text-muted)' }}>{line.qty}× </span>
                  )}
                  {line.catalogItemName ?? 'Item'}
                </span>
                {line.modifiers.length > 0 && (
                  <div
                    className="text-[10px] italic"
                    style={{ color: 'var(--fnb-text-muted)' }}
                  >
                    {line.modifiers.map((mod) => typeof mod === 'string' ? mod : String((mod as Record<string, unknown>)?.name ?? '')).join(', ')}
                  </div>
                )}
              </div>
              <span
                className="text-xs font-mono ml-2 shrink-0"
                style={{
                  color: 'var(--fnb-text-secondary)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(line.extendedPriceCents)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div
          className="p-3 border-t"
          style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
        >
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--fnb-text-muted)' }}>Subtotal</span>
            <span
              className="font-mono"
              style={{
                color: 'var(--fnb-text-secondary)',
                fontFamily: 'var(--fnb-font-mono)',
              }}
            >
              {formatMoney(check.subtotalCents)}
            </span>
          </div>
          {check.discountTotalCents > 0 && (
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--fnb-status-available)' }}>Discount</span>
              <span
                className="font-mono"
                style={{
                  color: 'var(--fnb-status-available)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                -{formatMoney(check.discountTotalCents)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--fnb-text-muted)' }}>Tax</span>
            <span
              className="font-mono"
              style={{
                color: 'var(--fnb-text-secondary)',
                fontFamily: 'var(--fnb-font-mono)',
              }}
            >
              {formatMoney(check.taxTotalCents)}
            </span>
          </div>

          {/* Recorded tenders list */}
          {tenders.length > 0 && (
            <>
              <div
                className="h-px my-2"
                style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)' }}
              />
              <div
                className="text-[10px] font-bold uppercase mb-1"
                style={{ color: 'var(--fnb-text-muted)' }}
              >
                Payments
              </div>
              {tenders.map((t, i) => (
                <div key={i} className="flex justify-between text-xs mb-0.5">
                  <span style={{ color: 'var(--fnb-status-available)' }}>
                    {t.type.replace('_', ' ')}
                    {t.tipCents > 0 && ` (+${formatMoney(t.tipCents)} tip)`}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      color: 'var(--fnb-status-available)',
                      fontFamily: 'var(--fnb-font-mono)',
                    }}
                  >
                    {formatMoney(t.amountCents)}
                  </span>
                </div>
              ))}
            </>
          )}

          <div
            className="flex justify-between text-sm font-bold pt-1 border-t mt-1"
            style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
          >
            <span style={{ color: 'var(--fnb-text-primary)' }}>
              {check.paidCents > 0 ? 'Remaining' : 'Total'}
            </span>
            <span
              className="font-mono"
              style={{
                color: 'var(--fnb-accent-primary, var(--fnb-info))',
                fontFamily: 'var(--fnb-font-mono)',
              }}
            >
              {formatMoney(check.remainingCents)}
            </span>
          </div>
          {check.paidCents > 0 && (
            <div className="flex justify-between text-[10px] mt-0.5">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Paid</span>
              <span
                className="font-mono"
                style={{
                  color: 'var(--fnb-status-available)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(check.paidCents)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Payment Actions (widened for better touch targets) ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        {/* ── STEP: tender_select ──────────────────────────────── */}
        {step === 'tender_select' && (
          <div className="flex flex-col gap-4 w-full max-w-md">
            {/* Prominent total display */}
            <div
              className="rounded-2xl p-5 text-center"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
            >
              <div
                className="text-[10px] font-bold uppercase mb-1"
                style={{ color: 'var(--fnb-text-muted)' }}
              >
                {check.paidCents > 0 ? 'Remaining Balance' : 'Total Due'}
              </div>
              <div
                className="font-mono font-black"
                style={{
                  fontSize: '2.5rem',
                  lineHeight: 1,
                  color: 'var(--fnb-accent-primary, var(--fnb-info))',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(check.remainingCents)}
              </div>
            </div>

            <TenderGrid
              onSelect={handleTenderSelect}
              onFastCash={handleFastCash}
              totalCents={check.remainingCents}
              disabled={disabled || isProcessing}
            />

            {/* Split shortcuts */}
            {(onSplitBySeat || onSplitEven) && (
              <div className="flex gap-2">
                {onSplitBySeat && (
                  <button
                    type="button"
                    onClick={onSplitBySeat}
                    disabled={disabled || isProcessing}
                    className="flex-1 rounded-lg py-2.5 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--fnb-bg-elevated)',
                      color: 'var(--fnb-text-secondary)',
                    }}
                  >
                    Split by Seat
                  </button>
                )}
                {onSplitEven && (
                  <button
                    type="button"
                    onClick={onSplitEven}
                    disabled={disabled || isProcessing}
                    className="flex-1 rounded-lg py-2.5 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--fnb-bg-elevated)',
                      color: 'var(--fnb-text-secondary)',
                    }}
                  >
                    Split Even
                  </button>
                )}
              </div>
            )}

            {/* Comp / Discount adjustments */}
            <PaymentAdjustments
              tabId={tab.id}
              onAdjusted={() => onCheckRefresh?.()}
              disabled={disabled || isProcessing}
            />

            {/* Void last tender button (visible when partial payments exist) */}
            {tenders.length > 0 && (
              <button
                type="button"
                onClick={handleVoidLast}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--fnb-payment-error-bg)',
                  color: 'var(--fnb-danger)',
                }}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo Last Payment ({formatMoney(tenders[tenders.length - 1]!.amountCents)})
              </button>
            )}

            {preauths.length > 0 && (
              <>
                <div
                  className="h-px w-full"
                  style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)' }}
                />
                <PreAuthCapture
                  preauths={preauths}
                  totalCents={check.remainingCents}
                  onCapture={handleCapturePreAuth}
                  onVoid={handleVoidPreAuth}
                  disabled={disabled || isProcessing}
                />
              </>
            )}
          </div>
        )}

        {/* ── STEP: card_entry ─────────────────────────────────── */}
        {step === 'card_entry' && (
          <div className="w-full max-w-md flex flex-col gap-4">
            <h3
              className="text-sm font-bold text-center"
              style={{ color: 'var(--fnb-text-primary)' }}
            >
              Card Payment
            </h3>

            {/* Dual-mode toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setManualCardEntry(false)}
                className="flex-1 rounded-lg py-2 text-xs font-bold transition-colors"
                style={{
                  backgroundColor: !manualCardEntry ? 'var(--fnb-accent-primary, var(--fnb-info))' : 'var(--fnb-bg-elevated)',
                  color: !manualCardEntry ? '#fff' : 'var(--fnb-text-secondary)',
                }}
              >
                Card Reader
              </button>
              <button
                type="button"
                onClick={() => setManualCardEntry(true)}
                className="flex items-center justify-center gap-1.5 flex-1 rounded-lg py-2 text-xs font-bold transition-colors"
                style={{
                  backgroundColor: manualCardEntry ? 'var(--fnb-accent-primary, var(--fnb-info))' : 'var(--fnb-bg-elevated)',
                  color: manualCardEntry ? '#fff' : 'var(--fnb-text-secondary)',
                }}
              >
                <Keyboard className="h-3.5 w-3.5" />
                Manual Entry
              </button>
            </div>

            {manualCardEntry ? (
              <PaymentMethodCapture
                config={tokenizerConfig ?? null}
                isConfigLoading={tokenizerLoading ?? false}
                configError={tokenizerError ?? null}
                onTokenize={handleCardTokenize}
                onError={handleCardTokenError}
                showWallets={false}
              />
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  readOnly
                  value={cardToken ?? ''}
                  placeholder="Waiting for card swipe/tap..."
                  onChange={(e) => {
                    if (e.target.value.trim()) {
                      setCardToken(e.target.value.trim());
                    }
                  }}
                  className="w-full rounded-lg border px-3 py-3 text-sm text-center"
                  style={{
                    borderColor: 'rgba(148, 163, 184, 0.3)',
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-primary)',
                  }}
                />
                <p className="text-center text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                  Swipe, tap, or insert card on the reader
                </p>
              </div>
            )}

            {errorMessage && (
              <p
                className="rounded-lg px-3 py-2 text-xs text-center"
                style={{ backgroundColor: 'var(--fnb-payment-error-bg)', color: 'var(--fnb-danger)' }}
              >
                {errorMessage}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCardToken(null);
                  setManualCardEntry(false);
                  setStep('tender_select');
                }}
                className="flex-1 rounded-lg py-3 text-sm font-bold transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'var(--fnb-bg-elevated)',
                  color: 'var(--fnb-text-secondary)',
                }}
              >
                Back
              </button>
              {!manualCardEntry && (
                <button
                  type="button"
                  onClick={() => {
                    if (cardToken) {
                      setStep('tip_prompt');
                    } else {
                      setErrorMessage('Please swipe or tap a card first');
                    }
                  }}
                  disabled={!cardToken || isProcessing}
                  className="flex-2 rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--fnb-action-pay)' }}
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP: cash_keypad ────────────────────────────────── */}
        {step === 'cash_keypad' && (
          <div className="w-full max-w-md">
            <CashKeypad
              totalCents={check.remainingCents}
              onSubmit={handleCashSubmit}
              disabled={disabled || isProcessing}
            />
          </div>
        )}

        {/* ── STEP: tip_prompt ─────────────────────────────────── */}
        {step === 'tip_prompt' && (
          <div className="w-full max-w-md">
            <TipPrompt
              subtotalCents={check.subtotalCents}
              onSelect={handleTipSelect}
              disabled={disabled || isProcessing}
            />
          </div>
        )}

        {/* ── STEP: gift_card_panel ─────────────────────────────── */}
        {step === 'gift_card_panel' && (
          <div className="w-full max-w-md">
            <GiftCardPanel
              remainingCents={check.remainingCents}
              onTender={handleSpecialtyTender}
              disabled={disabled || isProcessing}
            />
          </div>
        )}

        {/* ── STEP: house_account_panel ─────────────────────────── */}
        {step === 'house_account_panel' && (
          <div className="w-full max-w-md">
            <HouseAccountPanel
              remainingCents={check.remainingCents}
              onTender={handleSpecialtyTender}
              disabled={disabled || isProcessing}
            />
          </div>
        )}

        {/* ── STEP: confirm ────────────────────────────────────── */}
        {step === 'confirm' && selectedTender && (
          <div className="w-full max-w-md flex flex-col gap-4">
            <h3
              className="text-sm font-bold text-center"
              style={{ color: 'var(--fnb-text-primary)' }}
            >
              Confirm Payment
            </h3>
            <div
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
            >
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--fnb-text-muted)' }}>Method</span>
                <span
                  className="font-bold capitalize"
                  style={{ color: 'var(--fnb-text-primary)' }}
                >
                  {selectedTender.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--fnb-text-muted)' }}>Amount</span>
                <span
                  className="font-mono font-bold"
                  style={{
                    color: 'var(--fnb-text-primary)',
                    fontFamily: 'var(--fnb-font-mono)',
                  }}
                >
                  {formatMoney(pendingAmount)}
                </span>
              </div>
              {pendingTip > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--fnb-text-muted)' }}>Tip</span>
                  <span
                    className="font-mono"
                    style={{
                      color: 'var(--fnb-text-secondary)',
                      fontFamily: 'var(--fnb-font-mono)',
                    }}
                  >
                    {formatMoney(pendingTip)}
                  </span>
                </div>
              )}
              {selectedTender === 'cash' && pendingAmount > check.remainingCents && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--fnb-status-available)' }}>Change Due</span>
                  <span
                    className="font-mono font-bold"
                    style={{
                      color: 'var(--fnb-status-available)',
                      fontFamily: 'var(--fnb-font-mono)',
                    }}
                  >
                    {formatMoney(pendingAmount - check.remainingCents)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancelConfirm}
                disabled={isProcessing}
                className="flex-1 rounded-lg py-3 text-sm font-bold transition-colors hover:opacity-80 disabled:opacity-40"
                style={{
                  backgroundColor: 'var(--fnb-bg-elevated)',
                  color: 'var(--fnb-text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={disabled || isProcessing}
                className="flex-2 rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--fnb-action-pay)' }}
              >
                {isProcessing ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: partial_summary ────────────────────────────── */}
        {step === 'partial_summary' && (
          <div className="w-full max-w-md flex flex-col gap-4">
            <div className="text-center">
              <div
                className="inline-flex items-center justify-center h-14 w-14 rounded-full mb-3"
                style={{ backgroundColor: 'var(--fnb-payment-partial-bg)' }}
              >
                <CheckCircle
                  className="h-7 w-7"
                  style={{ color: 'var(--fnb-warning)' }}
                />
              </div>
              <h3
                className="text-sm font-bold"
                style={{ color: 'var(--fnb-text-primary)' }}
              >
                Partial Payment Recorded
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                {formatMoney(lastTenderAmount)} applied
              </p>
            </div>

            {/* Remaining balance — large, prominent */}
            <div
              className="rounded-xl p-4 text-center"
              style={{ backgroundColor: 'var(--fnb-payment-partial-bg)' }}
            >
              <div
                className="text-[10px] font-bold uppercase mb-1"
                style={{ color: 'var(--fnb-text-muted)' }}
              >
                Remaining Balance
              </div>
              <div
                className="font-mono font-bold"
                style={{
                  fontSize: 'var(--fnb-change-due-size)',
                  color: 'var(--fnb-warning)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(check.remainingCents)}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddAnother}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: 'var(--fnb-info)' }}
            >
              <ArrowRight className="h-4 w-4" />
              Add Another Payment
            </button>

            <button
              type="button"
              onClick={handleVoidLast}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
              style={{
                backgroundColor: 'var(--fnb-payment-error-bg)',
                color: 'var(--fnb-danger)',
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo Last Payment
            </button>
          </div>
        )}

        {/* ── STEP: receipt ─────────────────────────────────────── */}
        {step === 'receipt' && (
          <div className="w-full max-w-md flex flex-col gap-4">
            <div className="text-center">
              <div
                className="inline-flex items-center justify-center h-16 w-16 rounded-full mb-3"
                style={{ backgroundColor: 'var(--fnb-payment-success-bg)' }}
              >
                <CheckCircle
                  className="h-8 w-8"
                  style={{ color: 'var(--fnb-status-available)' }}
                />
              </div>
              <h3
                className="text-sm font-bold"
                style={{ color: 'var(--fnb-text-primary)' }}
              >
                Payment Complete
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                {formatMoney(check.totalCents)} paid
                {tenders.length > 1 && ` (${tenders.length} payments)`}
              </p>
            </div>
            <ReceiptOptions onSelect={handleReceipt} disabled={disabled} />

            {/* Start New Tab — quick reopen (Phase 6B) */}
            <button
              type="button"
              onClick={() => onClose()}
              className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-secondary)',
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Start New Tab
            </button>
          </div>
        )}

        {/* ── STEP: error ──────────────────────────────────────── */}
        {step === 'error' && (
          <div className="w-full max-w-md flex flex-col gap-4">
            <div className="text-center">
              <div
                className="inline-flex items-center justify-center h-14 w-14 rounded-full mb-3"
                style={{ backgroundColor: 'var(--fnb-payment-error-bg)' }}
              >
                <AlertTriangle
                  className="h-7 w-7"
                  style={{ color: 'var(--fnb-danger)' }}
                />
              </div>
              <h3
                className="text-sm font-bold"
                style={{ color: 'var(--fnb-text-primary)' }}
              >
                Payment Failed
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                {errorMessage || 'An error occurred while processing payment'}
              </p>
            </div>

            {errorRetryable && (
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: 'var(--fnb-info)' }}
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
            )}

            {(selectedTender === 'card' || errorSuggestedAction === 'try_different_card') && (
              <button
                type="button"
                onClick={handleRetryDifferentCard}
                className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'var(--fnb-bg-elevated)',
                  color: 'var(--fnb-text-secondary)',
                }}
              >
                Try Different Card
              </button>
            )}

            <button
              type="button"
              onClick={onCancelPayment}
              className="flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80"
              style={{
                backgroundColor: 'var(--fnb-payment-error-bg)',
                color: 'var(--fnb-danger)',
              }}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
