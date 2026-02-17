'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CatalogItemForPOS, AddLineItemInput } from '@/types/pos';
import type { RetailMetadata } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Component ─────────────────────────────────────────────────────

interface OptionPickerDialogProps {
  open: boolean;
  onClose: () => void;
  item: CatalogItemForPOS | null;
  onAdd: (input: AddLineItemInput) => void;
}

export function OptionPickerDialog({ open, onClose, item, onAdd }: OptionPickerDialogProps) {
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // ── Parse metadata ────────────────────────────────────────────

  const metadata = useMemo<RetailMetadata>(() => {
    if (!item) return {};
    return (item.metadata ?? {}) as RetailMetadata;
  }, [item]);

  const optionSets = useMemo(() => metadata.optionSets ?? [], [metadata]);

  // ── State ─────────────────────────────────────────────────────

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  // Reset when item changes
  useEffect(() => {
    if (open && item) {
      setSelectedOptions({});
    }
  }, [open, item]);

  // ── Validation ────────────────────────────────────────────────

  const allRequiredSelected = useMemo(() => {
    return optionSets
      .filter((s) => s.required)
      .every((s) => selectedOptions[s.name] !== undefined);
  }, [optionSets, selectedOptions]);

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
      firstFocusRef.current?.focus();
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  // ── Handlers ──────────────────────────────────────────────────

  function handleSelectOption(setName: string, option: string) {
    setSelectedOptions((prev) => ({ ...prev, [setName]: option }));
  }

  function handleAdd() {
    if (!item) return;

    const input: AddLineItemInput = {
      catalogItemId: item.id,
      qty: 1,
      ...(Object.keys(selectedOptions).length > 0 && { selectedOptions }),
    };

    onAdd(input);
  }

  // ── Render ────────────────────────────────────────────────────

  if (!open || !item || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 pt-6 pb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
          </div>
          <span className="text-lg font-semibold text-gray-900">{formatPrice(item.price)}</span>
          <button
            ref={firstFocusRef}
            type="button"
            onClick={onClose}
            className="ml-3 rounded-md p-1 text-gray-400 hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-6">
          {optionSets.map((optSet) => (
            <div key={optSet.name}>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                {optSet.name}
                {optSet.required && (
                  <span className="ml-1 text-xs font-normal text-red-500">(required)</span>
                )}
              </h4>
              <div className="flex flex-wrap gap-2">
                {optSet.options.map((option) => {
                  const isSelected = selectedOptions[optSet.name] === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleSelectOption(optSet.name, option)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-gray-300 bg-surface text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Stock info */}
          {item.isTrackInventory && item.onHand !== null && (
            <p className="text-sm text-gray-500">
              Stock: <span className="font-medium text-gray-700">{item.onHand}</span> at this
              location
            </p>
          )}
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
            disabled={!allRequiredSelected}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
              allRequiredSelected
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'cursor-not-allowed bg-indigo-300'
            }`}
          >
            Add to Order
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
