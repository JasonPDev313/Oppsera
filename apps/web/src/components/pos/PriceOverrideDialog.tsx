'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/currency-input';

// ── Constants ─────────────────────────────────────────────────────

const REASONS = [
  { value: 'price_match', label: 'Price match' },
  { value: 'manager_discount', label: 'Manager discount' },
  { value: 'comp', label: 'Comp (free)' },
  { value: 'custom', label: 'Custom' },
] as const;

type ReasonValue = (typeof REASONS)[number]['value'];

// ── Helpers ───────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Component ─────────────────────────────────────────────────────

interface PriceOverrideDialogProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  currentPrice: number; // cents
  onApply: (newPrice: number, reason: string, approvedBy: string) => void;
}

export function PriceOverrideDialog({
  open,
  onClose,
  itemName,
  currentPrice,
  onApply,
}: PriceOverrideDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // ── State ─────────────────────────────────────────────────────

  const [newPriceDollars, setNewPriceDollars] = useState<number | null>(null);
  const [reason, setReason] = useState<ReasonValue | null>(null);
  const [pin, setPin] = useState('');

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setNewPriceDollars(currentPrice / 100);
      setReason(null);
      setPin('');
    }
  }, [open, currentPrice]);

  // When "comp" is selected, set price to 0
  useEffect(() => {
    if (reason === 'comp') {
      setNewPriceDollars(0);
    }
  }, [reason]);

  // ── Keyboard & focus ──────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      // Focus the first input (CurrencyInput) after portal renders
      const timer = setTimeout(() => {
        const input = contentRef.current?.querySelector<HTMLInputElement>('[data-currency-input]');
        input?.focus();
      }, 50);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
      };
    }
  }, [open, handleKeyDown]);

  // ── Validation ────────────────────────────────────────────────

  const canApply = useMemo(() => {
    return newPriceDollars !== null && reason !== null && pin.length >= 4;
  }, [newPriceDollars, reason, pin]);

  // ── Handlers ──────────────────────────────────────────────────

  function handlePinChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    setPin(digits);
  }

  function handleApply() {
    if (newPriceDollars === null || !reason || pin.length < 4) return;
    const newPriceCents = Math.round(newPriceDollars * 100);
    onApply(newPriceCents, reason, pin);
  }

  // ── Render ────────────────────────────────────────────────────

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="price-override-dialog-title">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
          <h3 id="price-override-dialog-title" className="text-lg font-semibold text-foreground">Price Override</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="px-6 py-4 space-y-5">
          {/* Item info */}
          <div>
            <p className="text-sm text-muted-foreground">Item</p>
            <p className="text-sm font-medium text-foreground">{itemName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Current Price</p>
            <p className="text-sm font-medium text-foreground">{formatPrice(currentPrice)}</p>
          </div>

          {/* New price */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">New Price</label>
            <CurrencyInput
              value={newPriceDollars}
              onChange={(v) => setNewPriceDollars(v)}
            />
          </div>

          {/* Reason */}
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Reason</label>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    reason === r.value
                      ? 'border-indigo-500/30 bg-indigo-500/10'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <input
                    type="radio"
                    name="override-reason"
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-foreground">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Manager PIN */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Manager PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="Enter 4-digit PIN"
              inputMode="numeric"
              maxLength={8}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              canApply
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'cursor-not-allowed bg-indigo-600/50'
            }`}
          >
            Apply Override
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
