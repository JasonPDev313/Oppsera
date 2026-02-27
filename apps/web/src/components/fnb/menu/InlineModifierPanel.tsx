'use client';

import { useState, useCallback, useMemo } from 'react';
import { X, Check, ChevronRight } from 'lucide-react';
import { InstructionButtons } from '@/components/pos/InstructionButtons';
import type { ModifierInstruction } from '@/components/pos/InstructionButtons';
import { shouldSuppressInstructions } from '@/lib/modifier-intelligence';

// ── Types ─────────────────────────────────────────────────────────

interface ModifierOption {
  id: string;
  name: string;
  priceCents: number;
  isDefault: boolean;
  extraPriceDeltaCents?: number | null;
  kitchenLabel?: string | null;
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
  instructionMode?: string;
  defaultBehavior?: string;
}

export interface InlineModifierSelection {
  groupId: string;
  optionId: string;
  name: string;
  priceCents: number;
  instruction?: ModifierInstruction;
  kitchenLabel?: string | null;
}

interface InlineModifierPanelProps {
  itemName: string;
  itemPriceCents: number;
  groups: ModifierGroup[];
  onConfirm: (selections: InlineModifierSelection[], qty: number, notes: string) => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

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

// ── Component ─────────────────────────────────────────────────────

export function InlineModifierPanel({
  itemName,
  itemPriceCents,
  groups,
  onConfirm,
  onCancel,
}: InlineModifierPanelProps) {
  // Selection state: optionId → true
  const [selectedIds, setSelectedIds] = useState<Record<string, Set<string>>>(() => {
    // Auto-select defaults
    const initial: Record<string, Set<string>> = {};
    for (const g of groups) {
      const defaults = new Set<string>();
      if (g.defaultBehavior === 'auto_select_defaults') {
        for (const o of g.options) {
          if (o.isDefault || o.isDefaultOption) defaults.add(o.id);
        }
      }
      initial[g.id] = defaults;
    }
    return initial;
  });

  // Per-option instruction state: optionId → instruction
  const [instructions, setInstructions] = useState<Record<string, ModifierInstruction>>({});

  // Active group tab (for multi-group inline panel)
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  const toggleOption = useCallback((groupId: string, optionId: string, maxSelections: number) => {
    setSelectedIds((prev) => {
      const groupSet = new Set(prev[groupId] ?? []);
      if (groupSet.has(optionId)) {
        groupSet.delete(optionId);
      } else {
        // For single-select, clear others first
        if (maxSelections === 1) {
          groupSet.clear();
        }
        // Enforce max (skip if already at limit for multi-select)
        if (maxSelections > 1 && groupSet.size >= maxSelections) {
          return prev;
        }
        groupSet.add(optionId);
      }
      return { ...prev, [groupId]: groupSet };
    });
  }, []);

  const setInstruction = useCallback((optionId: string, instruction: ModifierInstruction) => {
    setInstructions((prev) => ({ ...prev, [optionId]: instruction }));
  }, []);

  // Build selections for confirm
  const buildSelections = useCallback((): InlineModifierSelection[] => {
    const result: InlineModifierSelection[] = [];
    for (const g of groups) {
      const groupSelected = selectedIds[g.id] ?? new Set();
      for (const o of g.options) {
        if (groupSelected.has(o.id)) {
          const inst = instructions[o.id] ?? null;
          const priceCents = resolveModPrice(o.priceCents, inst, o.extraPriceDeltaCents);
          result.push({
            groupId: g.id,
            optionId: o.id,
            name: o.name,
            priceCents,
            instruction: inst,
            kitchenLabel: o.kitchenLabel,
          });
        }
      }
    }
    return result;
  }, [groups, selectedIds, instructions]);

  // Computed total with modifiers
  const totalCents = useMemo(() => {
    let total = itemPriceCents;
    for (const g of groups) {
      const groupSelected = selectedIds[g.id] ?? new Set();
      for (const o of g.options) {
        if (groupSelected.has(o.id)) {
          const inst = instructions[o.id] ?? null;
          total += resolveModPrice(o.priceCents, inst, o.extraPriceDeltaCents);
        }
      }
    }
    return total;
  }, [itemPriceCents, groups, selectedIds, instructions]);

  // Check if all required groups are satisfied
  const allRequiredMet = useMemo(() => {
    return groups.every((g) => {
      if (!g.isRequired) return true;
      const count = (selectedIds[g.id] ?? new Set()).size;
      return count >= g.minSelections;
    });
  }, [groups, selectedIds]);

  const handleConfirm = useCallback(() => {
    onConfirm(buildSelections(), 1, '');
  }, [onConfirm, buildSelections]);

  const activeGroup = groups[activeGroupIndex];
  if (!activeGroup) return null;

  // Smart detection: suppress instructions for exclusive-choice groups
  // (temperature/doneness, sizes, bread types, cooking methods, egg styles)
  const groupInstructionsSuppressed = shouldSuppressInstructions(activeGroup.name, activeGroup.options);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
          >
            <X className="h-4 w-4" style={{ color: 'var(--fnb-text-muted)' }} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--fnb-text-primary)' }}>
              {itemName}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
              {formatMoney(itemPriceCents)}
            </p>
          </div>
        </div>
        <div className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          {formatMoney(totalCents)}
        </div>
      </div>

      {/* Group tabs (when multiple groups) */}
      {groups.length > 1 && (
        <div
          className="flex items-center gap-1 px-3 py-1.5 shrink-0 overflow-x-auto"
          style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}
        >
          {groups.map((g, i) => {
            const count = (selectedIds[g.id] ?? new Set()).size;
            const isActive = i === activeGroupIndex;
            const isSatisfied = !g.isRequired || count >= g.minSelections;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroupIndex(i)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold shrink-0 transition-all"
                style={{
                  backgroundColor: isActive ? 'var(--fnb-bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
                }}
              >
                {g.name}
                {g.isRequired && !isSatisfied && (
                  <span className="text-[9px]" style={{ color: 'var(--fnb-action-void)' }}>*</span>
                )}
                {count > 0 && (
                  <span
                    className="rounded-full text-[9px] font-bold px-1.5"
                    style={{
                      backgroundColor: isSatisfied ? 'var(--fnb-status-available)' : 'var(--fnb-warning)',
                      color: '#fff',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Group label + requirements */}
      <div className="px-3 pt-2 pb-1 shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--fnb-text-muted)' }}>
            {activeGroup.name}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
            {activeGroup.isRequired ? `Required` : 'Optional'}
            {activeGroup.maxSelections > 1 && ` · max ${activeGroup.maxSelections}`}
          </p>
        </div>
      </div>

      {/* Options grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <div className="grid grid-cols-2 gap-1.5">
          {activeGroup.options.map((option) => {
            const isSelected = (selectedIds[activeGroup.id] ?? new Set()).has(option.id);
            const currentInstruction = instructions[option.id] ?? null;
            const hasInstructions = !groupInstructionsSuppressed && (option.allowNone || option.allowExtra || option.allowOnSide);
            const effectivePrice = resolveModPrice(option.priceCents, currentInstruction, option.extraPriceDeltaCents);

            return (
              <div key={option.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleOption(activeGroup.id, option.id, activeGroup.maxSelections)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-all active:scale-[0.97]"
                  style={{
                    backgroundColor: isSelected ? 'var(--fnb-info)' : 'var(--fnb-bg-elevated)',
                    color: isSelected ? '#fff' : 'var(--fnb-text-primary)',
                  }}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  <span className="text-xs font-medium truncate flex-1">{option.name}</span>
                  {effectivePrice > 0 && (
                    <span className="text-[10px] shrink-0 opacity-70">
                      +{formatMoney(effectivePrice)}
                    </span>
                  )}
                  {currentInstruction === 'none' && (
                    <span className="text-[10px] shrink-0 opacity-70">$0</span>
                  )}
                </button>
                {/* Instruction buttons appear below selected options that support them */}
                {isSelected && hasInstructions && (activeGroup.instructionMode === 'per_option' || activeGroup.instructionMode === 'all') && (
                  <InstructionButtons
                    allowNone={option.allowNone ?? false}
                    allowExtra={option.allowExtra ?? false}
                    allowOnSide={option.allowOnSide ?? false}
                    value={currentInstruction}
                    onChange={(v) => setInstruction(option.id, v)}
                    extraPriceDeltaCents={option.extraPriceDeltaCents}
                    basePriceCents={option.priceCents}
                    variant="fnb"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer: Next group or Add to Order */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderTop: '1px solid rgba(148, 163, 184, 0.15)' }}
      >
        {activeGroupIndex < groups.length - 1 ? (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2.5 text-xs font-semibold transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-muted)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setActiveGroupIndex((i) => i + 1)}
              className="flex-1 flex items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-xs font-bold transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'var(--fnb-info)',
                color: '#fff',
              }}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2.5 text-xs font-semibold transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-muted)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!allRequiredMet}
              className="flex-1 rounded-lg px-4 py-2.5 text-xs font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{
                backgroundColor: 'var(--fnb-status-available)',
                color: '#fff',
              }}
            >
              Add · {formatMoney(totalCents)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
