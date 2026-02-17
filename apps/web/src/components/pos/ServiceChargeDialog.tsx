'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────

const CHARGE_TYPES = [
  { value: 'auto_gratuity', label: 'Auto Gratuity' },
  { value: 'service_charge', label: 'Service Charge' },
  { value: 'venue_fee', label: 'Venue Fee' },
  { value: 'booking_fee', label: 'Booking Fee' },
  { value: 'delivery_fee', label: 'Delivery Fee' },
  { value: 'other', label: 'Other' },
] as const;

type ChargeType = (typeof CHARGE_TYPES)[number]['value'];

const DEFAULT_NAMES: Record<ChargeType, string> = {
  auto_gratuity: '18% Gratuity',
  service_charge: 'Service Charge',
  venue_fee: 'Venue Fee',
  booking_fee: 'Booking Fee',
  delivery_fee: 'Delivery Fee',
  other: 'Other Charge',
};

// ── Helpers ───────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Component ─────────────────────────────────────────────────────

interface ServiceChargeDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (input: {
    chargeType: string;
    name: string;
    calculationType: 'percentage' | 'fixed';
    value: number;
    isTaxable: boolean;
  }) => void;
  subtotal: number; // cents
}

export function ServiceChargeDialog({ open, onClose, onAdd, subtotal }: ServiceChargeDialogProps) {
  const firstFocusRef = useRef<HTMLSelectElement>(null);

  // ── State ─────────────────────────────────────────────────────

  const [chargeType, setChargeType] = useState<ChargeType>('auto_gratuity');
  const [name, setName] = useState('18% Gratuity');
  const [calculationType, setCalculationType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('18');
  const [isTaxable, setIsTaxable] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setChargeType('auto_gratuity');
      setName('18% Gratuity');
      setCalculationType('percentage');
      setValue('18');
      setIsTaxable(false);
    }
  }, [open]);

  // Auto-fill name when charge type changes
  function handleChargeTypeChange(type: ChargeType) {
    setChargeType(type);
    setName(DEFAULT_NAMES[type]);
  }

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
      const timer = setTimeout(() => firstFocusRef.current?.focus(), 50);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
      };
    }
  }, [open, handleKeyDown]);

  // ── Preview ───────────────────────────────────────────────────

  const numericValue = parseFloat(value) || 0;

  const previewCents = useMemo(() => {
    if (calculationType === 'percentage') {
      return Math.round(subtotal * numericValue / 100);
    }
    return Math.round(numericValue * 100);
  }, [calculationType, numericValue, subtotal]);

  // ── Validation ────────────────────────────────────────────────

  const canAdd = useMemo(() => {
    return name.trim().length > 0 && numericValue > 0;
  }, [name, numericValue]);

  // ── Handler ───────────────────────────────────────────────────

  function handleAdd() {
    if (!canAdd) return;

    // For percentage: convert to basis points (18% → 1800)
    // For fixed: convert dollars to cents ($5 → 500)
    const submitValue = Math.round(numericValue * 100);

    onAdd({
      chargeType,
      name: name.trim(),
      calculationType,
      value: submitValue,
      isTaxable,
    });
  }

  // ── Render ────────────────────────────────────────────────────

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 pt-6 pb-4">
          <h3 className="text-lg font-semibold text-gray-900">Add Service Charge</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5">
          {/* Type select */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <select
              ref={firstFocusRef}
              value={chargeType}
              onChange={(e) => handleChargeTypeChange(e.target.value as ChargeType)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {CHARGE_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Charge name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Calculation type toggle */}
          <div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCalculationType('percentage')}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                  calculationType === 'percentage'
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Percentage
              </button>
              <button
                type="button"
                onClick={() => setCalculationType('fixed')}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                  calculationType === 'fixed'
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Fixed Amount
              </button>
            </div>
          </div>

          {/* Value input */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Value</label>
            <div className="relative">
              {calculationType === 'fixed' && (
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  $
                </span>
              )}
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                min="0"
                step={calculationType === 'percentage' ? '0.5' : '0.01'}
                placeholder="0"
                className={`w-full rounded-lg border border-gray-300 py-2 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                  calculationType === 'fixed' ? 'pl-7' : 'pl-3'
                }`}
              />
              {calculationType === 'percentage' && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  %
                </span>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-sm text-gray-500">Preview: </span>
            <span className="text-sm font-semibold text-gray-900">{formatPrice(previewCents)}</span>
          </div>

          {/* Taxable checkbox */}
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isTaxable}
              onChange={(e) => setIsTaxable(e.target.checked)}
              className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-900">Taxable</span>
          </label>
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
            onClick={handleAdd}
            disabled={!canAdd}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              canAdd
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'cursor-not-allowed bg-indigo-300'
            }`}
          >
            Add Charge
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
