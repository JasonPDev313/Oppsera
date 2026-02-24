'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, Check, ChevronRight, ChevronLeft, SkipForward } from 'lucide-react';

interface ModifierOption {
  id: string;
  name: string;
  priceCents: number;
  isDefault: boolean;
}

interface ModifierGroup {
  id: string;
  name: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

interface FnbModifierDrawerProps {
  open: boolean;
  onClose: () => void;
  itemName: string;
  itemPriceCents: number;
  modifierGroups: ModifierGroup[];
  onConfirm: (
    selectedModifiers: { groupId: string; optionId: string; name: string; priceCents: number }[],
    qty: number,
    notes: string,
  ) => void;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Progress Dots ───────────────────────────────────────────────

function ProgressDots({
  total,
  current,
  completedSet,
}: {
  total: number;
  current: number;
  completedSet: Set<number>;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 justify-center py-2">
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === current;
        const isDone = completedSet.has(i);
        return (
          <div
            key={i}
            className="rounded-full transition-all"
            style={{
              width: isActive ? 20 : 8,
              height: 8,
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
}: {
  group: ModifierGroup;
  selectedOptionIds: Set<string>;
  onToggle: (optionId: string) => void;
}) {
  const isSingleSelect = group.maxSelections === 1;

  return (
    <div>
      {/* Group header */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-sm font-bold"
          style={{ color: 'var(--fnb-text-primary)' }}
        >
          {group.name}
        </span>
        {group.isRequired && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--fnb-action-void)' }}
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
          const isIncluded = opt.isDefault && opt.priceCents === 0;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              className="flex items-center gap-3 rounded-xl text-left transition-all active:scale-[0.98]"
              style={{
                padding: '14px 16px', // 48px+ touch target
                backgroundColor: isSelected
                  ? 'var(--fnb-status-seated)'
                  : 'var(--fnb-bg-elevated)',
                color: isSelected ? '#fff' : 'var(--fnb-text-secondary)',
              }}
            >
              {/* Selection indicator */}
              <div
                className="shrink-0 flex items-center justify-center transition-colors"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: isSingleSelect ? '50%' : 6,
                  border: isSelected
                    ? 'none'
                    : '2px solid rgba(148, 163, 184, 0.3)',
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'transparent',
                }}
              >
                {isSelected && <Check className="h-3.5 w-3.5" style={{ color: '#fff' }} />}
              </div>

              {/* Option name */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block">{opt.name}</span>
                {isIncluded && !isSelected && (
                  <span className="text-[10px] font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
                    Included
                  </span>
                )}
              </div>

              {/* Price badge */}
              {opt.priceCents > 0 && (
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
                  +{formatMoney(opt.priceCents)}
                </span>
              )}
              {opt.priceCents === 0 && isSelected && (
                <span
                  className="shrink-0 text-[10px] font-medium"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  Included
                </span>
              )}
            </button>
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
  const totalSteps = requiredGroups.length + (optionalGroups.length > 0 ? 1 : 0) + 1; // +1 for qty/notes
  const [activeStep, setActiveStep] = useState(0);

  // Selected modifiers state
  const [selected, setSelected] = useState<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>();
    for (const group of modifierGroups) {
      const defaults = group.options.filter((o) => o.isDefault).map((o) => o.id);
      if (defaults.length > 0) m.set(group.id, new Set(defaults));
    }
    return m;
  });
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  if (!open) return null;

  const toggleOption = (groupId: string, optionId: string, maxSel: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const groupSet = new Set(next.get(groupId) ?? []);
      if (groupSet.has(optionId)) {
        groupSet.delete(optionId);
      } else {
        if (maxSel === 1) groupSet.clear();
        groupSet.add(optionId);
      }
      next.set(groupId, groupSet);
      return next;
    });
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

  // Compute running total
  let modTotal = 0;
  for (const [groupId, optionIds] of selected) {
    const group = modifierGroups.find((g) => g.id === groupId);
    if (!group) continue;
    for (const optId of optionIds) {
      const opt = group.options.find((o) => o.id === optId);
      if (opt) modTotal += opt.priceCents;
    }
  }
  const lineTotal = (itemPriceCents + modTotal) * qty;

  const handleConfirm = () => {
    const mods: { groupId: string; optionId: string; name: string; priceCents: number }[] = [];
    for (const [groupId, optionIds] of selected) {
      const group = modifierGroups.find((g) => g.id === groupId);
      if (!group) continue;
      for (const optId of optionIds) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) mods.push({ groupId, optionId: opt.id, name: opt.name, priceCents: opt.priceCents });
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
  const useSimpleMode = requiredGroups.length === 0 || (requiredGroups.length === 1 && optionalGroups.length === 0);

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ zIndex: 'var(--fnb-z-modal)', backgroundColor: 'var(--fnb-bg-overlay)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
                style={{ color: 'var(--fnb-text-secondary)', fontFamily: 'var(--fnb-font-mono)' }}
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
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress dots (only for multi-step) */}
        {!useSimpleMode && (
          <ProgressDots total={totalSteps} current={activeStep} completedSet={completedSteps} />
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {/* ── Simple mode: show all groups, notes, qty at once ── */}
          {useSimpleMode && (
            <>
              {modifierGroups.map((group) => (
                <div key={group.id} className="mb-5">
                  <GroupView
                    group={group}
                    selectedOptionIds={selected.get(group.id) ?? new Set()}
                    onToggle={(optId) => toggleOption(group.id, optId, group.maxSelections)}
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
                  style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)', minWidth: 40, textAlign: 'center' }}
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
                  const optNames = group.options
                    .filter((o) => groupSel.has(o.id))
                    .map((o) => o.name);
                  return (
                    <div key={group.id} className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
                        {group.name}:
                      </span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
                        {optNames.join(', ')}
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
                  style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)', minWidth: 40, textAlign: 'center' }}
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
                  style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
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
