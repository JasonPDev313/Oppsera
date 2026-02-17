'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModifierGroups } from '@/hooks/use-catalog';
import type { CatalogItemForPOS, AddLineItemInput } from '@/types/pos';
import type { FnbMetadata } from '@oppsera/shared';

// ── Constants ─────────────────────────────────────────────────────

const FRACTION_LABELS: Record<number, string> = {
  1: 'Full',
  0.75: 'Three Quarter',
  0.5: 'Half',
  0.25: 'Quarter',
};

const QUICK_INSTRUCTIONS = ['No onion', 'Extra sauce', 'Allergy alert'];

// ── Helpers ───────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function modifierPriceCents(priceAdjustment: string): number {
  return Math.round(parseFloat(priceAdjustment) * 100);
}

// ── Component ─────────────────────────────────────────────────────

interface ModifierDialogProps {
  open: boolean;
  onClose: () => void;
  item: CatalogItemForPOS | null;
  onAdd: (input: AddLineItemInput) => void;
}

export function ModifierDialog({ open, onClose, item, onAdd }: ModifierDialogProps) {
  const { data: allGroups } = useModifierGroups();
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // ── Parse metadata ────────────────────────────────────────────

  const metadata = useMemo<FnbMetadata>(() => {
    if (!item) return {};
    return (item.metadata ?? {}) as FnbMetadata;
  }, [item]);

  const allowedFractions = useMemo(() => {
    const fracs = metadata.allowedFractions;
    if (!fracs || fracs.length <= 1) return null;
    return fracs;
  }, [metadata]);

  // ── Filter modifier groups that belong to this item ───────────

  const relevantGroups = useMemo(() => {
    if (!allGroups || !item) return [];
    const defaultIds = new Set(metadata.defaultModifierGroupIds ?? []);
    const optionalIds = new Set(metadata.optionalModifierGroupIds ?? []);
    const allIds = new Set([...defaultIds, ...optionalIds]);
    if (allIds.size === 0) return [];

    return allGroups
      .filter((g) => allIds.has(g.id))
      .sort((a, b) => {
        const aDefault = defaultIds.has(a.id) ? 0 : 1;
        const bDefault = defaultIds.has(b.id) ? 0 : 1;
        return aDefault - bDefault;
      });
  }, [allGroups, item, metadata]);

  // ── State ─────────────────────────────────────────────────────

  const [selectedFraction, setSelectedFraction] = useState(1);
  const [singleSelections, setSingleSelections] = useState<Record<string, string>>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, Set<string>>>({});
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Reset state when item changes
  useEffect(() => {
    if (open && item) {
      setSelectedFraction(1);
      setSingleSelections({});
      setMultiSelections({});
      setSpecialInstructions('');
    }
  }, [open, item]);

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

  // ── Computed total ────────────────────────────────────────────

  const total = useMemo(() => {
    if (!item) return 0;
    let sum = Math.round(item.price * selectedFraction);

    // Single selections
    for (const groupId of Object.keys(singleSelections)) {
      const modId = singleSelections[groupId];
      const group = relevantGroups.find((g) => g.id === groupId);
      const mod = group?.modifiers?.find((m) => m.id === modId);
      if (mod) sum += modifierPriceCents(mod.priceAdjustment);
    }

    // Multi selections
    for (const groupId of Object.keys(multiSelections)) {
      const selectedSet = multiSelections[groupId] ?? new Set<string>();
      const group = relevantGroups.find((g) => g.id === groupId);
      if (!group?.modifiers) continue;
      for (const mod of group.modifiers) {
        if (selectedSet.has(mod.id)) {
          sum += modifierPriceCents(mod.priceAdjustment);
        }
      }
    }

    return sum;
  }, [item, selectedFraction, singleSelections, multiSelections, relevantGroups]);

  // ── Handlers ──────────────────────────────────────────────────

  function handleSingleSelect(groupId: string, modId: string) {
    setSingleSelections((prev) => ({ ...prev, [groupId]: modId }));
  }

  function handleMultiToggle(groupId: string, modId: string) {
    setMultiSelections((prev) => {
      const current = new Set(prev[groupId] ?? []);
      if (current.has(modId)) {
        current.delete(modId);
      } else {
        current.add(modId);
      }
      return { ...prev, [groupId]: current };
    });
  }

  function appendInstruction(text: string) {
    setSpecialInstructions((prev) => {
      if (!prev) return text;
      return `${prev}, ${text}`;
    });
  }

  function handleAdd() {
    if (!item) return;

    const modifiers: AddLineItemInput['modifiers'] = [];

    for (const groupId of Object.keys(singleSelections)) {
      const modId = singleSelections[groupId];
      const group = relevantGroups.find((g) => g.id === groupId);
      const mod = group?.modifiers?.find((m) => m.id === modId);
      if (mod) {
        modifiers.push({
          modifierId: mod.id,
          name: mod.name,
          priceAdjustment: modifierPriceCents(mod.priceAdjustment),
          isDefault: false,
        });
      }
    }

    for (const groupId of Object.keys(multiSelections)) {
      const selectedSet = multiSelections[groupId] ?? new Set<string>();
      const group = relevantGroups.find((g) => g.id === groupId);
      if (!group?.modifiers) continue;
      for (const mod of group.modifiers) {
        if (selectedSet.has(mod.id)) {
          modifiers.push({
            modifierId: mod.id,
            name: mod.name,
            priceAdjustment: modifierPriceCents(mod.priceAdjustment),
            isDefault: false,
          });
        }
      }
    }

    const input: AddLineItemInput = {
      catalogItemId: item.id,
      qty: selectedFraction,
      ...(modifiers.length > 0 && { modifiers }),
      ...(specialInstructions.trim() && { specialInstructions: specialInstructions.trim() }),
    };

    onAdd(input);
  }

  // ── Render ────────────────────────────────────────────────────

  if (!open || !item || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg bg-white shadow-xl">
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

        {/* Scrollable content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-6">
          {/* Fraction picker */}
          {allowedFractions && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Portion Size</h4>
              <div className="flex gap-2">
                {allowedFractions.map((frac) => (
                  <button
                    key={frac}
                    type="button"
                    onClick={() => setSelectedFraction(frac)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                      selectedFraction === frac
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {FRACTION_LABELS[frac] ?? `${frac}x`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Modifier groups */}
          {relevantGroups.map((group) => {
            const isSingle = group.selectionType === 'single';
            const activeModifiers = (group.modifiers ?? []).filter((m) => m.isActive);

            return (
              <div key={group.id}>
                <h4 className="mb-2 text-sm font-semibold text-gray-700">
                  {group.name}
                  {group.isRequired ? (
                    <span className="ml-1 text-xs font-normal text-red-500">(required)</span>
                  ) : (
                    <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
                  )}
                </h4>

                <div className="space-y-1">
                  {activeModifiers.map((mod) => {
                    const priceCents = modifierPriceCents(mod.priceAdjustment);
                    const isSelected = isSingle
                      ? singleSelections[group.id] === mod.id
                      : (multiSelections[group.id] ?? new Set()).has(mod.id);

                    return (
                      <label
                        key={mod.id}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                          isSelected
                            ? 'border-indigo-300 bg-indigo-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type={isSingle ? 'radio' : 'checkbox'}
                            name={`group-${group.id}`}
                            checked={isSelected}
                            onChange={() =>
                              isSingle
                                ? handleSingleSelect(group.id, mod.id)
                                : handleMultiToggle(group.id, mod.id)
                            }
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-900">{mod.name}</span>
                        </div>
                        {priceCents !== 0 && (
                          <span className="text-sm text-gray-500">
                            {priceCents > 0 ? '+' : ''}
                            {formatPrice(priceCents)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Special instructions */}
          {metadata.allowSpecialInstructions && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">Special Instructions</h4>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="e.g., no onions, extra pickles"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {QUICK_INSTRUCTIONS.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => appendInstruction(text)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <div className="text-lg font-semibold text-gray-900">
            Total: {formatPrice(total)}
          </div>
          <div className="flex gap-3">
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
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Add to Order
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
