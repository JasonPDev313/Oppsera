'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/currency-input';

// ── Helpers ───────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Component ─────────────────────────────────────────────────────

interface DiscountDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (type: 'percentage' | 'fixed', value: number, reason?: string) => void;
  subtotal: number; // cents
}

export function DiscountDialog({ open, onClose, onApply, subtotal }: DiscountDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // ── State ─────────────────────────────────────────────────────

  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [percentageValue, setPercentageValue] = useState('10');
  const [fixedValue, setFixedValue] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setDiscountType('percentage');
      setPercentageValue('10');
      setFixedValue(null);
      setReason('');
    }
  }, [open]);

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
      // Focus the first interactive element after portal renders
      const timer = setTimeout(() => {
        const firstButton = contentRef.current?.querySelector<HTMLButtonElement>('button[type="button"]');
        firstButton?.focus();
      }, 50);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
      };
    }
  }, [open, handleKeyDown]);

  // ── Preview ───────────────────────────────────────────────────

  const numericPercentage = parseFloat(percentageValue) || 0;

  const previewCents = useMemo(() => {
    if (discountType === 'percentage') {
      return Math.round(subtotal * numericPercentage / 100);
    }
    if (fixedValue !== null) {
      return Math.round(fixedValue * 100);
    }
    return 0;
  }, [discountType, numericPercentage, fixedValue, subtotal]);

  // ── Validation ────────────────────────────────────────────────

  const canApply = useMemo(() => {
    if (discountType === 'percentage') {
      return numericPercentage > 0 && numericPercentage <= 100;
    }
    return fixedValue !== null && fixedValue > 0;
  }, [discountType, numericPercentage, fixedValue]);

  // ── Handler ───────────────────────────────────────────────────

  function handleApply() {
    if (!canApply) return;

    if (discountType === 'percentage') {
      onApply('percentage', numericPercentage, reason.trim() || undefined);
    } else {
      onApply('fixed', fixedValue!, reason.trim() || undefined);
    }
  }

  // ── Render ────────────────────────────────────────────────────

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 pt-6 pb-4">
          <h3 className="text-lg font-semibold text-gray-900">Apply Discount</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className="px-6 py-4 space-y-5">
          {/* Discount type toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDiscountType('percentage')}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                discountType === 'percentage'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Percentage
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('fixed')}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                discountType === 'fixed'
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Fixed Amount
            </button>
          </div>

          {/* Value input */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Value</label>
            {discountType === 'percentage' ? (
              <div className="relative">
                <input
                  type="number"
                  value={percentageValue}
                  onChange={(e) => setPercentageValue(e.target.value)}
                  min="0"
                  max="100"
                  step="0.5"
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  %
                </span>
              </div>
            ) : (
              <CurrencyInput
                value={fixedValue}
                onChange={(v) => setFixedValue(v)}
                placeholder="0.00"
              />
            )}
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-sm text-gray-500">Discount: </span>
            <span className="text-sm font-semibold text-red-600">-{formatPrice(previewCents)}</span>
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reason <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Price match for regular"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
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
                : 'cursor-not-allowed bg-indigo-300'
            }`}
          >
            Apply Discount
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
