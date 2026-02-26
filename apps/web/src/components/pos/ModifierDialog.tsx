'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModifierGroups } from '@/hooks/use-catalog';
import { InstructionButtons } from './InstructionButtons';
import type { ModifierInstruction } from './InstructionButtons';
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

// ── POS Modifier Types (from getCatalogForPOS) ───────────────────

interface POSModGroupForDialog {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  instructionMode: string;
  defaultBehavior: string;
  options: Array<{
    id: string;
    name: string;
    priceCents: number;
    extraPriceDeltaCents: number | null;
    kitchenLabel: string | null;
    allowNone: boolean;
    allowExtra: boolean;
    allowOnSide: boolean;
    isDefaultOption: boolean;
    sortOrder: number;
    isDefault: boolean;
  }>;
}

interface POSItemAssignmentForDialog {
  catalogItemId: string;
  modifierGroupId: string;
  isDefault: boolean;
  overrideRequired: boolean | null;
  overrideMinSelections: number | null;
  overrideMaxSelections: number | null;
  overrideInstructionMode: string | null;
  promptOrder: number;
}

// ── Resolved group (with overrides applied) ──────────────────────

interface ResolvedModifier {
  id: string;
  name: string;
  priceCents: number;
  extraPriceDeltaCents: number | null;
  kitchenLabel: string | null;
  allowNone: boolean;
  allowExtra: boolean;
  allowOnSide: boolean;
  isDefaultOption: boolean;
  isActive: boolean;
}

interface ResolvedGroup {
  id: string;
  name: string;
  selectionType: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  instructionMode: string;
  defaultBehavior: string;
  modifiers: ResolvedModifier[];
}

// ── Helpers ───────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function modifierPriceCents(priceAdjustment: string): number {
  return Math.round(parseFloat(priceAdjustment) * 100);
}

/** Resolve modifier price based on instruction */
function resolveModPrice(
  basePriceCents: number,
  instruction: ModifierInstruction,
  extraPriceDeltaCents: number | null,
): number {
  switch (instruction) {
    case 'none':
      return 0;
    case 'extra':
      return extraPriceDeltaCents ?? basePriceCents;
    default:
      return basePriceCents;
  }
}

// ── Component ─────────────────────────────────────────────────────

interface ModifierDialogProps {
  open: boolean;
  onClose: () => void;
  item: CatalogItemForPOS | null;
  onAdd: (input: AddLineItemInput) => void;
  /** POS catalog modifier groups (from getCatalogForPOS) */
  posModifierGroups?: POSModGroupForDialog[];
  /** Item-specific modifier assignments from junction table */
  itemAssignments?: POSItemAssignmentForDialog[];
}

export function ModifierDialog({
  open,
  onClose,
  item,
  onAdd,
  posModifierGroups,
  itemAssignments,
}: ModifierDialogProps) {
  const { data: adminGroups } = useModifierGroups();
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // ── Parse metadata (fallback path) ──────────────────────────

  const metadata = useMemo<FnbMetadata>(() => {
    if (!item) return {};
    return (item.metadata ?? {}) as FnbMetadata;
  }, [item]);

  const allowedFractions = useMemo(() => {
    const fracs = metadata.allowedFractions;
    if (!fracs || fracs.length <= 1) return null;
    return fracs;
  }, [metadata]);

  // ── Resolve modifier groups ─────────────────────────────────
  // Prefer junction table (itemAssignments + posModifierGroups),
  // fall back to metadata-based resolution via admin API.

  const relevantGroups = useMemo<ResolvedGroup[]>(() => {
    if (!item) return [];

    // Junction table path
    if (posModifierGroups && itemAssignments) {
      const myAssignments = itemAssignments
        .filter((a) => a.catalogItemId === item.id)
        .sort((a, b) => a.promptOrder - b.promptOrder);

      if (myAssignments.length > 0) {
        return myAssignments
          .map((assignment) => {
            const group = posModifierGroups.find((g) => g.id === assignment.modifierGroupId);
            if (!group) return null;

            return {
              id: group.id,
              name: group.name,
              selectionType: group.selectionType,
              isRequired: assignment.overrideRequired ?? group.isRequired,
              minSelections: assignment.overrideMinSelections ?? group.minSelections,
              maxSelections: assignment.overrideMaxSelections ?? group.maxSelections,
              instructionMode: assignment.overrideInstructionMode ?? group.instructionMode,
              defaultBehavior: group.defaultBehavior,
              modifiers: group.options.map((opt) => ({
                id: opt.id,
                name: opt.name,
                priceCents: opt.priceCents,
                extraPriceDeltaCents: opt.extraPriceDeltaCents,
                kitchenLabel: opt.kitchenLabel,
                allowNone: opt.allowNone,
                allowExtra: opt.allowExtra,
                allowOnSide: opt.allowOnSide,
                isDefaultOption: opt.isDefaultOption,
                isActive: true, // POS catalog only returns active modifiers
              })),
            };
          })
          .filter(Boolean) as ResolvedGroup[];
      }
    }

    // Metadata fallback path
    if (!adminGroups) return [];
    const defaultIds = new Set(metadata.defaultModifierGroupIds ?? []);
    const optionalIds = new Set(metadata.optionalModifierGroupIds ?? []);
    const allIds = new Set([...defaultIds, ...optionalIds]);
    if (allIds.size === 0) return [];

    return adminGroups
      .filter((g) => allIds.has(g.id))
      .sort((a, b) => {
        const aDefault = defaultIds.has(a.id) ? 0 : 1;
        const bDefault = defaultIds.has(b.id) ? 0 : 1;
        return aDefault - bDefault;
      })
      .map((g) => ({
        id: g.id,
        name: g.name,
        selectionType: g.selectionType,
        isRequired: g.isRequired,
        minSelections: g.minSelections,
        maxSelections: g.maxSelections,
        instructionMode: 'none',
        defaultBehavior: 'none',
        modifiers: (g.modifiers ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          priceCents: modifierPriceCents(m.priceAdjustment),
          extraPriceDeltaCents: null,
          kitchenLabel: null,
          allowNone: false,
          allowExtra: false,
          allowOnSide: false,
          isDefaultOption: false,
          isActive: m.isActive,
        })),
      }));
  }, [item, posModifierGroups, itemAssignments, adminGroups, metadata]);

  // ── State ─────────────────────────────────────────────────────

  const [selectedFraction, setSelectedFraction] = useState(1);
  const [singleSelections, setSingleSelections] = useState<Record<string, string>>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, Set<string>>>({});
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [modInstructions, setModInstructions] = useState<Record<string, ModifierInstruction>>({});

  // Reset state when item changes + auto-select defaults
  useEffect(() => {
    if (open && item) {
      setSelectedFraction(1);
      setSpecialInstructions('');
      setModInstructions({});

      // Auto-select defaults when defaultBehavior === 'auto_select_defaults'
      const newSingle: Record<string, string> = {};
      const newMulti: Record<string, Set<string>> = {};
      for (const group of relevantGroups) {
        if (group.defaultBehavior !== 'auto_select_defaults') continue;
        const defaults = group.modifiers.filter((m) => m.isDefaultOption && m.isActive);
        if (defaults.length === 0) continue;
        if (group.selectionType === 'single' && defaults[0]) {
          newSingle[group.id] = defaults[0].id;
        } else {
          newMulti[group.id] = new Set(defaults.map((d) => d.id));
        }
      }
      setSingleSelections(newSingle);
      setMultiSelections(newMulti);
    }
  }, [open, item, relevantGroups]);

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

  // ── Computed total (instruction-aware) ──────────────────────

  const total = useMemo(() => {
    if (!item) return 0;
    let sum = Math.round(item.price * selectedFraction);

    for (const groupId of Object.keys(singleSelections)) {
      const modId = singleSelections[groupId];
      const group = relevantGroups.find((g) => g.id === groupId);
      const mod = group?.modifiers.find((m) => m.id === modId);
      if (mod) {
        const instr = modInstructions[mod.id] ?? null;
        sum += resolveModPrice(mod.priceCents, instr, mod.extraPriceDeltaCents);
      }
    }

    for (const groupId of Object.keys(multiSelections)) {
      const selectedSet = multiSelections[groupId] ?? new Set<string>();
      const group = relevantGroups.find((g) => g.id === groupId);
      if (!group) continue;
      for (const mod of group.modifiers) {
        if (selectedSet.has(mod.id)) {
          const instr = modInstructions[mod.id] ?? null;
          sum += resolveModPrice(mod.priceCents, instr, mod.extraPriceDeltaCents);
        }
      }
    }

    return sum;
  }, [item, selectedFraction, singleSelections, multiSelections, relevantGroups, modInstructions]);

  // ── Required group validation ────────────────────────────────

  const missingRequired = useMemo(() => {
    const missing: Set<string> = new Set();
    for (const group of relevantGroups) {
      if (!group.isRequired) continue;
      if (group.selectionType === 'single') {
        if (!singleSelections[group.id]) missing.add(group.id);
      } else {
        const sel = multiSelections[group.id];
        if (!sel || sel.size < group.minSelections) missing.add(group.id);
      }
    }
    return missing;
  }, [relevantGroups, singleSelections, multiSelections]);

  const canAdd = missingRequired.size === 0;

  // ── Handlers ──────────────────────────────────────────────────

  function handleSingleSelect(groupId: string, modId: string) {
    setSingleSelections((prev) => ({ ...prev, [groupId]: modId }));
  }

  function handleMultiToggle(groupId: string, modId: string) {
    setMultiSelections((prev) => {
      const current = new Set(prev[groupId] ?? []);
      if (current.has(modId)) {
        current.delete(modId);
        // Clear instruction when deselected
        setModInstructions((p) => {
          const next = { ...p };
          delete next[modId];
          return next;
        });
      } else {
        current.add(modId);
      }
      return { ...prev, [groupId]: current };
    });
  }

  function handleInstructionChange(modId: string, instruction: ModifierInstruction) {
    setModInstructions((prev) => ({ ...prev, [modId]: instruction }));
  }

  function appendInstruction(text: string) {
    setSpecialInstructions((prev) => (prev ? `${prev}, ${text}` : text));
  }

  function handleAdd() {
    if (!item || !canAdd) return;

    const modifiers: AddLineItemInput['modifiers'] = [];

    for (const groupId of Object.keys(singleSelections)) {
      const modId = singleSelections[groupId];
      const group = relevantGroups.find((g) => g.id === groupId);
      const mod = group?.modifiers.find((m) => m.id === modId);
      if (mod) {
        const instr = modInstructions[mod.id] ?? null;
        modifiers.push({
          modifierId: mod.id,
          modifierGroupId: groupId,
          name: mod.name,
          priceAdjustment: resolveModPrice(mod.priceCents, instr, mod.extraPriceDeltaCents),
          isDefault: mod.isDefaultOption,
          instruction: instr,
          kitchenLabel: mod.kitchenLabel,
        });
      }
    }

    for (const groupId of Object.keys(multiSelections)) {
      const selectedSet = multiSelections[groupId] ?? new Set<string>();
      const group = relevantGroups.find((g) => g.id === groupId);
      if (!group) continue;
      for (const mod of group.modifiers) {
        if (selectedSet.has(mod.id)) {
          const instr = modInstructions[mod.id] ?? null;
          modifiers.push({
            modifierId: mod.id,
            modifierGroupId: groupId,
            name: mod.name,
            priceAdjustment: resolveModPrice(mod.priceCents, instr, mod.extraPriceDeltaCents),
            isDefault: mod.isDefaultOption,
            instruction: instr,
            kitchenLabel: mod.kitchenLabel,
          });
        }
      }
    }

    onAdd({
      catalogItemId: item.id,
      qty: selectedFraction,
      ...(modifiers.length > 0 && { modifiers }),
      ...(specialInstructions.trim() && { specialInstructions: specialInstructions.trim() }),
    });
  }

  // ── Render ────────────────────────────────────────────────────

  if (!open || !item || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modifier-dialog-title">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
          <div className="flex-1">
            <h3 id="modifier-dialog-title" className="text-lg font-semibold text-foreground">{item.name}</h3>
          </div>
          <span className="text-lg font-semibold text-foreground">{formatPrice(item.price)}</span>
          <button
            ref={firstFocusRef}
            type="button"
            onClick={onClose}
            className="ml-3 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-6">
          {/* Fraction picker */}
          {allowedFractions && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Portion Size</h4>
              <div className="flex gap-2">
                {allowedFractions.map((frac) => (
                  <button
                    key={frac}
                    type="button"
                    onClick={() => setSelectedFraction(frac)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                      selectedFraction === frac
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-input bg-surface text-foreground hover:bg-accent'
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
            const activeModifiers = group.modifiers.filter((m) => m.isActive);
            const isMissing = missingRequired.has(group.id);
            const hasInstructions =
              group.instructionMode === 'all' || group.instructionMode === 'per_option';

            return (
              <div key={group.id}>
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  {group.name}
                  {group.isRequired ? (
                    <span
                      className={`ml-1 text-xs font-normal ${isMissing ? 'text-red-500' : 'text-green-500'}`}
                    >
                      {isMissing ? '(required — select one)' : '(required)'}
                    </span>
                  ) : (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                  )}
                </h4>

                <div className="space-y-1">
                  {activeModifiers.map((mod) => {
                    const instr = modInstructions[mod.id] ?? null;
                    const effectivePrice = resolveModPrice(
                      mod.priceCents,
                      instr,
                      mod.extraPriceDeltaCents,
                    );
                    const isSelected = isSingle
                      ? singleSelections[group.id] === mod.id
                      : (multiSelections[group.id] ?? new Set()).has(mod.id);

                    const showInstructions =
                      isSelected &&
                      hasInstructions &&
                      (group.instructionMode === 'all' ||
                        mod.allowNone ||
                        mod.allowExtra ||
                        mod.allowOnSide);

                    return (
                      <div key={mod.id}>
                        <label
                          className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
                            isSelected
                              ? 'border-indigo-500/30 bg-indigo-500/10'
                              : 'border-border hover:bg-accent'
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
                            <span className="text-sm text-foreground">{mod.name}</span>
                          </div>
                          {effectivePrice !== 0 && (
                            <span className="text-sm text-muted-foreground">
                              {effectivePrice > 0 ? '+' : ''}
                              {formatPrice(effectivePrice)}
                            </span>
                          )}
                          {effectivePrice === 0 && instr === 'none' && (
                            <span className="text-xs font-medium text-red-500">NONE</span>
                          )}
                        </label>

                        {/* Instruction buttons (below the selected modifier) */}
                        {showInstructions && (
                          <div className="ml-10 mb-1">
                            <InstructionButtons
                              allowNone={group.instructionMode === 'all' || mod.allowNone}
                              allowExtra={group.instructionMode === 'all' || mod.allowExtra}
                              allowOnSide={group.instructionMode === 'all' || mod.allowOnSide}
                              value={instr}
                              onChange={(val) => handleInstructionChange(mod.id, val)}
                              extraPriceDeltaCents={mod.extraPriceDeltaCents}
                              basePriceCents={mod.priceCents}
                              variant="retail"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Special instructions */}
          {metadata.allowSpecialInstructions && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-foreground">Special Instructions</h4>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="e.g., no onions, extra pickles"
                rows={2}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {QUICK_INSTRUCTIONS.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => appendInstruction(text)}
                    className="rounded-full border border-input bg-surface px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div className="text-lg font-semibold text-foreground">Total: {formatPrice(total)}</div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
                canAdd
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'cursor-not-allowed bg-muted text-muted-foreground'
              }`}
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
