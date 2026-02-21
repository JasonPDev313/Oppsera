'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus } from 'lucide-react';

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
  onConfirm: (selectedModifiers: { groupId: string; optionId: string; name: string; priceCents: number }[], qty: number, notes: string) => void;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function FnbModifierDrawer({ open, onClose, itemName, itemPriceCents, modifierGroups, onConfirm }: FnbModifierDrawerProps) {
  const [selected, setSelected] = useState<Map<string, Set<string>>>(
    () => {
      const m = new Map<string, Set<string>>();
      for (const group of modifierGroups) {
        const defaults = group.options.filter((o) => o.isDefault).map((o) => o.id);
        if (defaults.length > 0) m.set(group.id, new Set(defaults));
      }
      return m;
    },
  );
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
        if (maxSel === 1) {
          groupSet.clear();
        }
        groupSet.add(optionId);
      }
      next.set(groupId, groupSet);
      return next;
    });
  };

  // Check if all required groups are satisfied
  const allRequiredMet = modifierGroups.every((g) => {
    if (!g.isRequired) return true;
    const count = selected.get(g.id)?.size ?? 0;
    return count >= g.minSelections;
  });

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

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ zIndex: 'var(--fnb-z-modal)', backgroundColor: 'var(--fnb-bg-overlay)' }}
    >
      <div
        className="rounded-t-2xl shadow-lg max-h-[70vh] flex flex-col"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--fnb-text-primary)' }}>{itemName}</h3>
            <span className="text-xs fnb-mono" style={{ color: 'var(--fnb-text-secondary)' }}>{formatMoney(itemPriceCents)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modifier groups */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {modifierGroups.map((group) => (
            <div key={group.id} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase" style={{ color: 'var(--fnb-text-primary)' }}>
                  {group.name}
                </span>
                {group.isRequired && (
                  <span className="text-[10px] font-bold" style={{ color: 'var(--fnb-status-dirty)' }}>*</span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
                  {group.maxSelections === 1 ? 'Pick 1' : `Pick ${group.minSelections}-${group.maxSelections}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {group.options.map((opt) => {
                  const isSelected = selected.get(group.id)?.has(opt.id) ?? false;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleOption(group.id, opt.id, group.maxSelections)}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors"
                      style={{
                        backgroundColor: isSelected ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
                        color: isSelected ? '#fff' : 'var(--fnb-text-secondary)',
                      }}
                    >
                      <span className="text-xs font-medium">{opt.name}</span>
                      {opt.priceCents > 0 && (
                        <span className="text-[10px] fnb-mono">+{formatMoney(opt.priceCents)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Notes */}
          <div className="mb-4">
            <span className="text-xs font-bold uppercase mb-1 block" style={{ color: 'var(--fnb-text-primary)' }}>
              Special Instructions
            </span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., no salt, extra sauce..."
              className="w-full rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-primary)',
                border: '1px solid rgba(148, 163, 184, 0.15)',
              }}
            />
          </div>

          {/* Quantity */}
          <div className="flex items-center justify-center gap-4 mb-2">
            <button
              type="button"
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="flex items-center justify-center rounded-lg fnb-touch-min transition-colors hover:opacity-80"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-xl font-bold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>{qty}</span>
            <button
              type="button"
              onClick={() => setQty(qty + 1)}
              className="flex items-center justify-center rounded-lg fnb-touch-min transition-colors hover:opacity-80"
              style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg py-3 text-sm font-semibold transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!allRequiredMet}
            className="flex-1 rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}
          >
            Add {formatMoney(lineTotal)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
