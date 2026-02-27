'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, Check, ChevronRight, ChevronLeft, SkipForward } from 'lucide-react';
import { InstructionButtons } from '@/components/pos/InstructionButtons';
import type { ModifierInstruction } from '@/components/pos/InstructionButtons';
import { shouldSuppressInstructions } from '@/lib/modifier-intelligence';

interface ModifierOption {
  id: string;
  name: string;
  priceCents: number;
  isDefault: boolean;
  /** Extra price delta in cents (when "Extra" instruction selected) */
  extraPriceDeltaCents?: number | null;
  /** Kitchen label override */
  kitchenLabel?: string | null;
  /** Per-option instruction flags */
  allowNone?: boolean;
  allowExtra?: boolean;
  allowOnSide?: boolean;
  isDefaultOption?: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
  /** Instruction mode for the group: 'none' | 'all' | 'per_option' */
  instructionMode?: string;
  /** Default behavior: 'none' | 'auto_select_defaults' */
  defaultBehavior?: string;
}

interface SelectedModifierOutput {
  groupId: string;
  optionId: string;
  name: string;
  priceCents: number;
  instruction?: ModifierInstruction;
  kitchenLabel?: string | null;
}

interface FnbModifierDrawerProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  itemPriceCents: number;
  modifierGroups: ModifierGroup[];
  onConfirm: (selectedModifiers: SelectedModifierOutput[], qty: number, notes: string) => void;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Resolve modifier price based on instruction */
function resolveModPrice(
  basePriceCents: number,
  instruction: ModifierInstruction,
  extraPriceDeltaCents: number | null | undefined,
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

// ── Swipe Hook ──────────────────────────────────────────────────

function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  enabled,
}: {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  enabled: boolean;
}) {
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchStart.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.t;
      touchStart.current = null;

      // Must be a horizontal swipe: |dx| > 60px, more horizontal than vertical, within 400ms
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) || dt > 400) return;

      if (dx < 0) onSwipeLeft(); // swipe left → next
      else onSwipeRight(); // swipe right → back
    },
    [enabled, onSwipeLeft, onSwipeRight],
  );

  return { onTouchStart, onTouchEnd };
}

// ── Progress Dots ───────────────────────────────────────────────

function ProgressDots({
  total,
  current,
  completedSet,
  onDotTap,
}: {
  total: number;
  current: number;
  completedSet: Set<number>;
  onDotTap?: (step: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 justify-center py-2">
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === current;
        const isDone = completedSet.has(i);
        const canTap = onDotTap && (isDone || i <= current);
        return (
          <button
            key={i}
            type="button"
            onClick={() => canTap && onDotTap(i)}
            className="rounded-full transition-all"
            style={{
              width: isActive ? 20 : 8,
              height: 8,
              padding: 0,
              border: 'none',
              cursor: canTap ? 'pointer' : 'default',
              backgroundColor: isDone
                ? 'var(--fnb-status-available)'
                : isActive
                  ? 'var(--fnb-info)'
                  : 'var(--fnb-bg-elevated)',
            }}
          />
        );
      })}
    </div>
  );
}

// ── Single Group View ───────────────────────────────────────────

function GroupView({
  group,
  selectedOptionIds,
  onToggle,
  modInstructions,
  onInstructionChange,
}: {
  group: ModifierGroup;
  selectedOptionIds: Set<string>;
  onToggle: (optionId: string) => void;
  modInstructions: Record<string, ModifierInstruction>;
  onInstructionChange: (optionId: string, instruction: ModifierInstruction) => void;
}) {
  const isSingleSelect = group.maxSelections === 1;
  // Smart detection: suppress instructions for exclusive-choice groups
  // (temperature/doneness, sizes, bread types, cooking methods, egg styles)
  // where None/Extra/On Side don't make logical sense.
  const suppress = shouldSuppressInstructions(group.name, group.options);
  const effectiveMode = suppress
    ? 'none'
    : group.instructionMode === 'per_option'
      ? 'per_option'
      : 'all';
  const hasInstructions = !suppress;

  return (
    <div>
      {/* Group header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          {group.name}
        </span>
        {group.isRequired && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--fnb-action-void)',
            }}
          >
            Required
          </span>
        )}
        <span className="text-[10px] ml-auto" style={{ color: 'var(--fnb-text-muted)' }}>
          {isSingleSelect
            ? 'Choose 1'
            : group.minSelections > 0
              ? `Choose ${group.minSelections}–${group.maxSelections}`
              : `Up to ${group.maxSelections}`}
        </span>
      </div>

      {/* Options list */}
      <div className="flex flex-col gap-1.5">
        {group.options.map((opt) => {
          const isSelected = selectedOptionIds.has(opt.id);
          const instr = modInstructions[opt.id] ?? null;
          const effectivePrice = resolveModPrice(opt.priceCents, instr, opt.extraPriceDeltaCents);
          const isIncluded = opt.isDefault && opt.priceCents === 0;

          const showInstructions =
            isSelected &&
            hasInstructions &&
            (effectiveMode === 'all' ||
              opt.allowNone ||
              opt.allowExtra ||
              opt.allowOnSide);

          return (
            <div key={opt.id}>
              {/* Entire row is clickable — no dead zones */}
              <button
                type="button"
                onClick={() => onToggle(opt.id)}
                className="w-full rounded-xl text-left active:scale-[0.98]"
                style={{
                  backgroundColor: isSelected
                    ? 'var(--fnb-status-seated)'
                    : 'var(--fnb-bg-elevated)',
                  color: isSelected ? '#fff' : 'var(--fnb-text-secondary)',
                }}
              >
                <div className="flex items-center gap-3" style={{ padding: '12px 16px' }}>
                  {/* Selection indicator */}
                  <div
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: isSingleSelect ? '50%' : 6,
                      border: isSelected ? 'none' : '2px solid rgba(148, 163, 184, 0.3)',
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'transparent',
                    }}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" style={{ color: '#fff' }} />}
                  </div>

                  {/* Option name */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate">{opt.name}</span>
                    {isIncluded && !isSelected && (
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: 'var(--fnb-text-muted)' }}
                      >
                        Included
                      </span>
                    )}
                    {instr === 'none' && isSelected && (
                      <span className="text-[10px] font-bold" style={{ color: '#fca5a5' }}>
                        NONE
                      </span>
                    )}
                  </div>

                  {/* Price badge */}
                  {effectivePrice > 0 && (
                    <span
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
                      style={{
                        fontFamily: 'var(--fnb-font-mono)',
                        backgroundColor: isSelected
                          ? 'rgba(255,255,255,0.2)'
                          : 'rgba(99, 102, 241, 0.1)',
                        color: isSelected ? '#fff' : 'var(--fnb-info)',
                      }}
                    >
                      +{formatMoney(effectivePrice)}
                    </span>
                  )}
                  {effectivePrice === 0 && isSelected && instr !== 'none' && (
                    <span
                      className="shrink-0 text-[10px] font-medium"
                      style={{ color: 'rgba(255,255,255,0.7)' }}
                    >
                      Included
                    </span>
                  )}
                </div>
              </button>
              {/* Instruction pills rendered outside the toggle button to avoid click conflicts */}
              {showInstructions && (
                <div style={{ padding: '0 16px 8px' }}>
                  <InstructionButtons
                    allowNone={effectiveMode === 'all' || !!opt.allowNone}
                    allowExtra={effectiveMode === 'all' || !!opt.allowExtra}
                    allowOnSide={effectiveMode === 'all' || !!opt.allowOnSide}
                    value={instr}
                    onChange={(val) => onInstructionChange(opt.id, val)}
                    extraPriceDeltaCents={opt.extraPriceDeltaCents}
                    basePriceCents={opt.priceCents}
                    variant="fnb"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Modifier Drawer ────────────────────────────────────────

export function FnbModifierDrawer({
  open,
  onClose,
  itemName,
  itemPriceCents,
  modifierGroups,
  onConfirm,
}: FnbModifierDrawerProps) {
  // Separate required and optional groups
  const requiredGroups = useMemo(
    () => modifierGroups.filter((g) => g.isRequired),
    [modifierGroups],
  );
  const optionalGroups = useMemo(
    () => modifierGroups.filter((g) => !g.isRequired),
    [modifierGroups],
  );

  // Auto-progression: step through required groups one at a time
  // After all required groups, show optional groups + notes + qty all at once
  const totalSteps = requiredGroups.length + (optionalGroups.length > 0 ? 1 : 0) + 1;
  const [activeStep, setActiveStep] = useState(0);

  // Selected modifiers state — auto-select defaults
  const [selected, setSelected] = useState<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>();
    for (const group of modifierGroups) {
      // For auto_select_defaults, use isDefaultOption; otherwise use isDefault
      const useAutoDefaults = group.defaultBehavior === 'auto_select_defaults';
      const defaults = group.options
        .filter((o) => (useAutoDefaults ? o.isDefaultOption : o.isDefault))
        .map((o) => o.id);
      if (defaults.length > 0) m.set(group.id, new Set(defaults));
    }
    return m;
  });
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [modInstructions, setModInstructions] = useState<Record<string, ModifierInstruction>>({});

  if (!open) return null;

  const toggleOption = (groupId: string, optionId: string, maxSel: number) => {
    let shouldAutoAdvance = false;
    let deselectedOptionId: string | null = null;

    setSelected((prev) => {
      const next = new Map(prev);
      const groupSet = new Set(next.get(groupId) ?? []);
      if (groupSet.has(optionId)) {
        groupSet.delete(optionId);
        deselectedOptionId = optionId;
      } else {
        if (maxSel === 1) groupSet.clear();
        groupSet.add(optionId);

        // Auto-advance: if this is a single-select required group in stepper mode
        // and we just selected the required number, advance to next step.
        // Only auto-advance when instructions are suppressed (e.g., temperature groups)
        // so the user doesn't need to manually tap Next.
        if (!useSimpleMode && isOnRequiredStep && currentRequiredGroup) {
          const g = currentRequiredGroup;
          if (g.id === groupId && maxSel === 1 && g.minSelections <= 1) {
            const groupHasInstructions = !shouldSuppressInstructions(g.name, g.options);
            if (!groupHasInstructions) {
              shouldAutoAdvance = true;
            }
          }
        }
      }
      next.set(groupId, groupSet);
      return next;
    });

    // Clear instruction when deselected — outside the setSelected updater
    if (deselectedOptionId) {
      setModInstructions((p) => {
        const n = { ...p };
        delete n[deselectedOptionId!];
        return n;
      });
    }

    // Auto-advance on next frame so the selection renders first
    if (shouldAutoAdvance) {
      requestAnimationFrame(() => {
        setActiveStep((s) => Math.min(s + 1, totalSteps - 1));
      });
    }
  };

  const handleInstructionChange = (optionId: string, instruction: ModifierInstruction) => {
    setModInstructions((prev) => ({ ...prev, [optionId]: instruction }));
  };

  // Current required group (if we're stepping through them)
  const isOnRequiredStep = activeStep < requiredGroups.length;
  const isOnOptionalStep =
    !isOnRequiredStep && activeStep < requiredGroups.length + (optionalGroups.length > 0 ? 1 : 0);
  const isOnFinalStep = activeStep === totalSteps - 1;

  const currentRequiredGroup = isOnRequiredStep ? requiredGroups[activeStep] : null;

  // Check if current required group is satisfied
  const currentStepSatisfied = currentRequiredGroup
    ? (selected.get(currentRequiredGroup.id)?.size ?? 0) >= currentRequiredGroup.minSelections
    : true;

  // Check all required groups are met (for final confirm)
  const allRequiredMet = requiredGroups.every((g) => {
    const count = selected.get(g.id)?.size ?? 0;
    return count >= g.minSelections;
  });

  // Track completed steps
  const completedSteps = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < requiredGroups.length; i++) {
      const g = requiredGroups[i]!;
      if ((selected.get(g.id)?.size ?? 0) >= g.minSelections) s.add(i);
    }
    return s;
  }, [requiredGroups, selected]);

  // Compute running total (instruction-aware)
  let modTotal = 0;
  for (const [groupId, optionIds] of selected) {
    const group = modifierGroups.find((g) => g.id === groupId);
    if (!group) continue;
    for (const optId of optionIds) {
      const opt = group.options.find((o) => o.id === optId);
      if (opt) {
        const instr = modInstructions[optId] ?? null;
        modTotal += resolveModPrice(opt.priceCents, instr, opt.extraPriceDeltaCents);
      }
    }
  }
  const lineTotal = (itemPriceCents + modTotal) * qty;

  const handleConfirm = () => {
    const mods: SelectedModifierOutput[] = [];
    for (const [groupId, optionIds] of selected) {
      const group = modifierGroups.find((g) => g.id === groupId);
      if (!group) continue;
      for (const optId of optionIds) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) {
          const instr = modInstructions[optId] ?? null;
          mods.push({
            groupId,
            optionId: opt.id,
            name: opt.name,
            priceCents: resolveModPrice(opt.priceCents, instr, opt.extraPriceDeltaCents),
            instruction: instr,
            kitchenLabel: opt.kitchenLabel,
          });
        }
      }
    }
    onConfirm(mods, qty, notes);
    onClose();
  };

  const handleNext = () => {
    if (activeStep < totalSteps - 1) setActiveStep(activeStep + 1);
  };

  const handleBack = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  // For single-group items or items with only optional groups, skip stepper
  const useSimpleMode =
    requiredGroups.length === 0 || (requiredGroups.length === 1 && optionalGroups.length === 0);

  // Swipe navigation for stepper mode
  const handleSwipeNext = useCallback(() => {
    // Only advance if current required step is satisfied (or we're on optional/final)
    if (isOnRequiredStep && !currentStepSatisfied) return;
    if (activeStep < totalSteps - 1) setActiveStep(activeStep + 1);
  }, [activeStep, totalSteps, isOnRequiredStep, currentStepSatisfied]);

  const handleSwipeBack = useCallback(() => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  }, [activeStep]);

  const swipe = useSwipeNavigation({
    onSwipeLeft: handleSwipeNext,
    onSwipeRight: handleSwipeBack,
    enabled: !useSimpleMode,
  });

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ zIndex: 'var(--fnb-z-modal)', backgroundColor: 'var(--fnb-bg-overlay)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-t-2xl shadow-lg flex flex-col"
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}
        >
          <div className="flex-1 min-w-0">
            <h3
              className="text-base font-bold truncate"
              style={{ color: 'var(--fnb-text-primary)' }}
            >
              {itemName}
            </h3>
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{
                  color: 'var(--fnb-text-secondary)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(itemPriceCents)}
              </span>
              {modTotal > 0 && (
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--fnb-info)', fontFamily: 'var(--fnb-font-mono)' }}
                >
                  +{formatMoney(modTotal)}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 flex items-center justify-center rounded-lg h-9 w-9 transition-opacity hover:opacity-80"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-muted)',
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress dots (only for multi-step) */}
        {!useSimpleMode && (
          <ProgressDots
            total={totalSteps}
            current={activeStep}
            completedSet={completedSteps}
            onDotTap={(step) => setActiveStep(step)}
          />
        )}

        {/* Body — scrollable, swipeable in stepper mode */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3 min-h-0"
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
        >
          {/* ── Simple mode: show all groups, notes, qty at once ── */}
          {useSimpleMode && (
            <>
              {modifierGroups.map((group) => (
                <div key={group.id} className="mb-5">
                  <GroupView
                    group={group}
                    selectedOptionIds={selected.get(group.id) ?? new Set()}
                    onToggle={(optId) => toggleOption(group.id, optId, group.maxSelections)}
                    modInstructions={modInstructions}
                    onInstructionChange={handleInstructionChange}
                  />
                </div>
              ))}

              {/* Special instructions */}
              <div className="mb-4">
                <span
                  className="text-xs font-bold uppercase mb-1.5 block"
                  style={{ color: 'var(--fnb-text-primary)' }}
                >
                  Special Instructions
                </span>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., no salt, extra sauce..."
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-primary)',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                  }}
                />
              </div>

              {/* Quantity */}
              <div className="flex items-center justify-center gap-5 mb-2">
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="flex items-center justify-center rounded-xl transition-opacity hover:opacity-80"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-primary)',
                  }}
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span
                  className="text-2xl font-bold"
                  style={{
                    color: 'var(--fnb-text-primary)',
                    fontFamily: 'var(--fnb-font-mono)',
                    minWidth: 40,
                    textAlign: 'center',
                  }}
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(qty + 1)}
                  className="flex items-center justify-center rounded-xl transition-opacity hover:opacity-80"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-primary)',
                  }}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </>
          )}

          {/* ── Stepper mode: one required group at a time ── */}
          {!useSimpleMode && isOnRequiredStep && currentRequiredGroup && (
            <GroupView
              group={currentRequiredGroup}
              selectedOptionIds={selected.get(currentRequiredGroup.id) ?? new Set()}
              onToggle={(optId) =>
                toggleOption(currentRequiredGroup.id, optId, currentRequiredGroup.maxSelections)
              }
              modInstructions={modInstructions}
              onInstructionChange={handleInstructionChange}
            />
          )}

          {/* Optional groups (all shown together) */}
          {!useSimpleMode && isOnOptionalStep && (
            <>
              {optionalGroups.map((group) => (
                <div key={group.id} className="mb-5">
                  <GroupView
                    group={group}
                    selectedOptionIds={selected.get(group.id) ?? new Set()}
                    onToggle={(optId) => toggleOption(group.id, optId, group.maxSelections)}
                    modInstructions={modInstructions}
                    onInstructionChange={handleInstructionChange}
                  />
                </div>
              ))}
            </>
          )}

          {/* Final step: notes + qty */}
          {!useSimpleMode && isOnFinalStep && (
            <>
              {/* Summary of selections */}
              <div className="mb-4">
                <span
                  className="text-xs font-bold uppercase mb-2 block"
                  style={{ color: 'var(--fnb-text-primary)' }}
                >
                  Your Selections
                </span>
                {modifierGroups.map((group) => {
                  const groupSel = selected.get(group.id);
                  if (!groupSel || groupSel.size === 0) return null;
                  const optEntries = group.options
                    .filter((o) => groupSel.has(o.id))
                    .map((o) => {
                      const instr = modInstructions[o.id];
                      if (instr === 'none') return `NO ${o.name}`;
                      if (instr === 'extra') return `EXTRA ${o.name}`;
                      if (instr === 'on_side') return `${o.name} ON SIDE`;
                      return o.name;
                    });
                  return (
                    <div key={group.id} className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-medium"
                        style={{ color: 'var(--fnb-text-muted)' }}
                      >
                        {group.name}:
                      </span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: 'var(--fnb-text-primary)' }}
                      >
                        {optEntries.join(', ')}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Special instructions */}
              <div className="mb-4">
                <span
                  className="text-xs font-bold uppercase mb-1.5 block"
                  style={{ color: 'var(--fnb-text-primary)' }}
                >
                  Special Instructions
                </span>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., no salt, extra sauce..."
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-primary)',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                  }}
                />
              </div>

              {/* Quantity */}
              <div className="flex items-center justify-center gap-5 mb-2">
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="flex items-center justify-center rounded-xl transition-opacity hover:opacity-80"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-primary)',
                  }}
                >
                  <Minus className="h-5 w-5" />
                </button>
                <span
                  className="text-2xl font-bold"
                  style={{
                    color: 'var(--fnb-text-primary)',
                    fontFamily: 'var(--fnb-font-mono)',
                    minWidth: 40,
                    textAlign: 'center',
                  }}
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(qty + 1)}
                  className="flex items-center justify-center rounded-xl transition-opacity hover:opacity-80"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-primary)',
                  }}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 flex gap-2 px-4 py-3"
          style={{ borderTop: '1px solid rgba(148, 163, 184, 0.15)' }}
        >
          {/* Simple mode or final step: Cancel + Add */}
          {(useSimpleMode || isOnFinalStep) && (
            <>
              {!useSimpleMode && activeStep > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center justify-center rounded-xl transition-opacity hover:opacity-80"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-secondary)',
                  }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={useSimpleMode ? onClose : handleBack}
                className="flex-1 rounded-xl py-3.5 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: 'var(--fnb-bg-elevated)',
                  color: 'var(--fnb-text-secondary)',
                  display: useSimpleMode ? 'block' : 'none',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!allRequiredMet}
                className="flex-1 rounded-xl py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--fnb-status-seated)' }}
              >
                Add {formatMoney(lineTotal)}
              </button>
            </>
          )}

          {/* Stepper mode: Back + Next/Skip */}
          {!useSimpleMode && !isOnFinalStep && (
            <>
              {activeStep > 0 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center justify-center rounded-xl transition-opacity hover:opacity-80"
                  style={{
                    width: 48,
                    height: 48,
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-secondary)',
                  }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-3.5 text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--fnb-bg-elevated)',
                    color: 'var(--fnb-text-secondary)',
                  }}
                >
                  Cancel
                </button>
              )}

              {/* Skip button for optional groups */}
              {isOnOptionalStep && (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center gap-1 rounded-xl px-4 py-3.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: 'transparent', color: 'var(--fnb-text-muted)' }}
                >
                  Skip
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                disabled={isOnRequiredStep && !currentStepSatisfied}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: 'var(--fnb-info)' }}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
