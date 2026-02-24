'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Search, X, CreditCard } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface GiftCardTenderDialogProps {
  open: boolean;
  onClose: () => void;
  onRedeem: (cardNumber: string, amountCents: number) => void;
  remainingBalanceCents: number;
}

interface GiftCardBalance {
  balanceCents: number;
  cardNumber: string;
}

export function GiftCardTenderDialog({
  open,
  onClose,
  onRedeem,
  remainingBalanceCents,
}: GiftCardTenderDialogProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [cardNumber, setCardNumber] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [balance, setBalance] = useState<GiftCardBalance | null>(null);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setCardNumber('');
      setBalance(null);
      setRedeemAmount('');
      setIsLookingUp(false);
      setIsSubmitting(false);
      // Focus input after portal renders
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Listen for barcode scan events
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const scanned = (e as CustomEvent<string>).detail;
      if (scanned) {
        setCardNumber(scanned);
        setBalance(null);
        setRedeemAmount('');
      }
    };
    window.addEventListener('barcode-scan', handler);
    return () => window.removeEventListener('barcode-scan', handler);
  }, [open]);

  const lookupBalance = useCallback(async () => {
    const trimmed = cardNumber.trim();
    if (!trimmed) {
      toast.error('Enter a gift card number');
      return;
    }
    setIsLookingUp(true);
    setBalance(null);
    setRedeemAmount('');
    try {
      const res = await apiFetch<{ data: GiftCardBalance }>(
        `/api/v1/payments/gift-card-balance?cardNumber=${encodeURIComponent(trimmed)}`,
      );
      if (res.data.balanceCents <= 0) {
        toast.error('This gift card has a zero balance');
        setIsLookingUp(false);
        return;
      }
      setBalance(res.data);
      // Pre-fill the redeem amount: min of card balance and remaining order balance
      const maxRedeem = Math.min(res.data.balanceCents, remainingBalanceCents);
      setRedeemAmount((maxRedeem / 100).toFixed(2));
    } catch {
      toast.error('Could not look up gift card balance');
    } finally {
      setIsLookingUp(false);
    }
  }, [cardNumber, remainingBalanceCents, toast]);

  const handleSubmit = useCallback(() => {
    if (!balance || isSubmitting) return;

    const parsedCents = Math.round(parseFloat(redeemAmount) * 100);
    if (isNaN(parsedCents) || parsedCents <= 0) {
      toast.error('Enter a valid redemption amount');
      return;
    }

    const maxAllowed = Math.min(balance.balanceCents, remainingBalanceCents);
    if (parsedCents > maxAllowed) {
      toast.error(
        `Amount cannot exceed ${formatMoney(maxAllowed)}`,
      );
      return;
    }

    setIsSubmitting(true);
    onRedeem(balance.cardNumber, parsedCents);
  }, [balance, redeemAmount, remainingBalanceCents, isSubmitting, onRedeem, toast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  const maxRedeem = balance
    ? Math.min(balance.balanceCents, remainingBalanceCents)
    : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold">Gift Card Payment</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-gray-200/50 active:scale-[0.97]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Remaining balance on order */}
        <div className="mb-4 rounded-lg bg-gray-100/60 px-4 py-3 text-sm">
          <span className="text-gray-500">Amount Due:</span>{' '}
          <span className="font-semibold">{formatMoney(remainingBalanceCents)}</span>
        </div>

        {/* Card number input + lookup */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-600">
            Card Number
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={cardNumber}
                onChange={(e) => {
                  setCardNumber(e.target.value);
                  if (balance) {
                    setBalance(null);
                    setRedeemAmount('');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !balance) {
                    e.preventDefault();
                    lookupBalance();
                  }
                }}
                placeholder="Scan or enter card number"
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm outline-none transition-colors focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
            <button
              type="button"
              onClick={lookupBalance}
              disabled={isLookingUp || !cardNumber.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 active:scale-[0.97]"
            >
              <Search className="h-4 w-4" />
              {isLookingUp ? 'Looking up...' : 'Look Up'}
            </button>
          </div>
        </div>

        {/* Balance result */}
        {balance && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-700">Card Balance</span>
              <span className="text-lg font-bold text-green-700">
                {formatMoney(balance.balanceCents)}
              </span>
            </div>
            {balance.balanceCents < remainingBalanceCents && (
              <p className="mt-1 text-xs text-green-600">
                Full balance will be applied. Remaining{' '}
                {formatMoney(remainingBalanceCents - balance.balanceCents)} due
                after.
              </p>
            )}
          </div>
        )}

        {/* Redemption amount */}
        {balance && (
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-600">
              Redemption Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={(maxRedeem / 100).toFixed(2)}
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-7 pr-3 text-sm outline-none transition-colors focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Max: {formatMoney(maxRedeem)}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-100/60 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!balance || isSubmitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 active:scale-[0.97]"
          >
            <Gift className="h-4 w-4" />
            {isSubmitting ? 'Applying...' : 'Apply Gift Card'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
