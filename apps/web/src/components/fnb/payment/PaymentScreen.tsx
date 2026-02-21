'use client';

import { useState, useCallback } from 'react';
import type { FnbTabDetail, CheckSummary } from '@/types/fnb';
import { TenderGrid, type TenderType } from './TenderGrid';
import { CashKeypad } from './CashKeypad';
import { TipPrompt } from './TipPrompt';
import { ReceiptOptions, type ReceiptAction } from './ReceiptOptions';
import { PreAuthCapture } from './PreAuthCapture';

type PaymentStep = 'tender_select' | 'cash_keypad' | 'tip_prompt' | 'receipt' | 'done';

interface PreAuth {
  id: string;
  tabId: string;
  status: string;
  authAmountCents: number;
  cardLast4: string;
  cardBrand: string | null;
  authorizedAt: string;
}

interface PaymentScreenProps {
  tab: FnbTabDetail;
  check: CheckSummary;
  preauths: PreAuth[];
  onTender: (type: TenderType, amountCents: number, tipCents: number) => Promise<void>;
  onCapturePreAuth: (preauthId: string, captureAmountCents: number, tipCents: number) => Promise<void>;
  onVoidPreAuth: (preauthId: string) => Promise<void>;
  onReceipt: (action: ReceiptAction) => void;
  onClose: () => void;
  disabled?: boolean;
}

export function PaymentScreen({
  tab,
  check,
  preauths,
  onTender,
  onCapturePreAuth,
  onVoidPreAuth,
  onReceipt,
  onClose,
  disabled,
}: PaymentScreenProps) {
  const [step, setStep] = useState<PaymentStep>(
    preauths.length > 0 ? 'tender_select' : 'tender_select',
  );
  const [selectedTender, setSelectedTender] = useState<TenderType | null>(null);
  const [tipCents, setTipCents] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleTenderSelect = useCallback((type: TenderType) => {
    setSelectedTender(type);
    if (type === 'cash') {
      setStep('cash_keypad');
    } else {
      setStep('tip_prompt');
    }
  }, []);

  const handleCashSubmit = useCallback(
    async (amountCents: number) => {
      setIsProcessing(true);
      try {
        await onTender('cash', amountCents, 0);
        setStep('receipt');
      } catch {
        // error handled upstream
      } finally {
        setIsProcessing(false);
      }
    },
    [onTender],
  );

  const handleTipSelect = useCallback(
    async (tip: number) => {
      setTipCents(tip);
      if (!selectedTender) return;
      setIsProcessing(true);
      try {
        await onTender(selectedTender, check.remainingCents, tip);
        setStep('receipt');
      } catch {
        // error handled upstream
      } finally {
        setIsProcessing(false);
      }
    },
    [selectedTender, check.remainingCents, onTender],
  );

  const handleCapturePreAuth = useCallback(
    async (preauthId: string, captureAmountCents: number, tip: number) => {
      setIsProcessing(true);
      try {
        await onCapturePreAuth(preauthId, captureAmountCents, tip);
        setStep('receipt');
      } catch {
        // error handled upstream
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

  const handleReceipt = useCallback(
    (action: ReceiptAction) => {
      onReceipt(action);
      onClose();
    },
    [onReceipt, onClose],
  );

  return (
    <div className="flex flex-col sm:flex-row h-full" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Check Summary — collapsed on handheld, sidebar on tablet+ */}
      <div
        className="shrink-0 border-b sm:border-b-0 sm:border-r sm:w-[320px] flex flex-col overflow-y-auto max-h-[30vh] sm:max-h-none"
        style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        <div className="p-4 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
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
                <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
                  {line.qty > 1 && <span style={{ color: 'var(--fnb-text-muted)' }}>{line.qty}× </span>}
                  {line.catalogItemName ?? 'Item'}
                </span>
                {line.modifiers.length > 0 && (
                  <div className="text-[10px] italic" style={{ color: 'var(--fnb-text-muted)' }}>
                    {line.modifiers.join(', ')}
                  </div>
                )}
              </div>
              <span
                className="text-xs font-mono ml-2 shrink-0"
                style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}
              >
                {formatMoney(line.extendedPriceCents)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="p-3 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--fnb-text-muted)' }}>Subtotal</span>
            <span className="font-mono" style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}>
              {formatMoney(check.subtotalCents)}
            </span>
          </div>
          {check.discountTotalCents > 0 && (
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--fnb-status-available)' }}>Discount</span>
              <span className="font-mono" style={{ color: 'var(--fnb-status-available)', fontFamily: 'var(--fnb-font-mono)' }}>
                -{formatMoney(check.discountTotalCents)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-xs mb-1">
            <span style={{ color: 'var(--fnb-text-muted)' }}>Tax</span>
            <span className="font-mono" style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}>
              {formatMoney(check.taxTotalCents)}
            </span>
          </div>
          {tipCents > 0 && (
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Tip</span>
              <span className="font-mono" style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}>
                {formatMoney(tipCents)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold pt-1 border-t mt-1" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
            <span style={{ color: 'var(--fnb-text-primary)' }}>
              {check.paidCents > 0 ? 'Remaining' : 'Total'}
            </span>
            <span
              className="font-mono"
              style={{ color: 'var(--fnb-accent-primary)', fontFamily: 'var(--fnb-font-mono)' }}
            >
              {formatMoney(check.remainingCents)}
            </span>
          </div>
          {check.paidCents > 0 && (
            <div className="flex justify-between text-[10px] mt-0.5">
              <span style={{ color: 'var(--fnb-text-muted)' }}>Paid</span>
              <span className="font-mono" style={{ color: 'var(--fnb-status-available)', fontFamily: 'var(--fnb-font-mono)' }}>
                {formatMoney(check.paidCents)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right: Payment Actions */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        {step === 'tender_select' && (
          <div className="flex flex-col gap-6 w-full max-w-xs">
            <h3 className="text-sm font-bold text-center" style={{ color: 'var(--fnb-text-primary)' }}>
              Select Payment Method
            </h3>
            <TenderGrid onSelect={handleTenderSelect} disabled={disabled || isProcessing} />

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

        {step === 'cash_keypad' && (
          <div className="w-full max-w-xs">
            <CashKeypad
              totalCents={check.remainingCents}
              onSubmit={handleCashSubmit}
              disabled={disabled || isProcessing}
            />
          </div>
        )}

        {step === 'tip_prompt' && (
          <div className="w-full max-w-xs">
            <TipPrompt
              subtotalCents={check.subtotalCents}
              onSelect={handleTipSelect}
              disabled={disabled || isProcessing}
            />
          </div>
        )}

        {step === 'receipt' && (
          <div className="w-full max-w-xs flex flex-col gap-4">
            <div className="text-center">
              <div
                className="inline-flex items-center justify-center h-16 w-16 rounded-full mb-3"
                style={{ backgroundColor: 'color-mix(in srgb, var(--fnb-status-available) 15%, transparent)' }}
              >
                <span className="text-2xl" style={{ color: 'var(--fnb-status-available)' }}>✓</span>
              </div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                Payment Complete
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
                {formatMoney(check.totalCents)} paid
              </p>
            </div>
            <ReceiptOptions onSelect={handleReceipt} disabled={disabled} />
          </div>
        )}
      </div>
    </div>
  );
}
