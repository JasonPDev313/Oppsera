'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Trash2, X } from 'lucide-react';
import type { FnbTabLine } from '@/types/fnb';

type ModalTab = 'comp' | 'void';

interface CompVoidModalProps {
  open: boolean;
  onClose: () => void;
  lines: FnbTabLine[];
  onComp: (lineIds: string[], reason: string) => void;
  onVoid: (lineIds: string[], reason: string) => void;
  disabled?: boolean;
}

const COMP_REASONS = ['Manager comp', 'Quality issue', 'Wrong item', 'Allergy', 'Guest satisfaction'];
const VOID_REASONS = ['Never made', 'Duplicate order', 'System error', 'Price error', 'Customer changed mind'];

export function CompVoidModal({ open, onClose, lines, onComp, onVoid, disabled }: CompVoidModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('comp');
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const toggleLine = (lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const handleSubmit = () => {
    const ids = Array.from(selectedLineIds);
    if (ids.length === 0 || !reason) return;
    if (activeTab === 'comp') onComp(ids, reason);
    else onVoid(ids, reason);
    setSelectedLineIds(new Set());
    setReason('');
    onClose();
  };

  const reasons = activeTab === 'comp' ? COMP_REASONS : VOID_REASONS;

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--fnb-z-modal)' } as React.CSSProperties}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative rounded-2xl p-5 w-[420px] shadow-2xl max-h-[80vh] flex flex-col"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Comp / Void Items
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:opacity-80" style={{ color: 'var(--fnb-text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 mb-3 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
          {(['comp', 'void'] as ModalTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); setSelectedLineIds(new Set()); setReason(''); }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition-colors"
              style={{
                backgroundColor: activeTab === tab ? 'var(--fnb-bg-surface)' : 'transparent',
                color: activeTab === tab ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
              }}
            >
              {tab === 'comp' ? <Gift className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
              {tab === 'comp' ? 'Comp' : 'Void'}
            </button>
          ))}
        </div>

        {/* Item selection */}
        <div className="flex-1 overflow-y-auto mb-3 space-y-1">
          {lines.map((line) => (
            <button
              key={line.id}
              type="button"
              onClick={() => toggleLine(line.id)}
              className="w-full flex items-center justify-between rounded-lg px-3 py-2 border transition-colors"
              style={{
                borderColor: selectedLineIds.has(line.id) ? (activeTab === 'comp' ? 'var(--fnb-status-available)' : 'var(--fnb-status-dirty)') : 'rgba(148, 163, 184, 0.15)',
                backgroundColor: selectedLineIds.has(line.id)
                  ? `color-mix(in srgb, ${activeTab === 'comp' ? 'var(--fnb-status-available)' : 'var(--fnb-status-dirty)'} 10%, transparent)`
                  : 'var(--fnb-bg-elevated)',
              }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
                {line.catalogItemName ?? 'Item'}
              </span>
              <span className="text-xs font-mono" style={{ color: 'var(--fnb-text-muted)', fontFamily: 'var(--fnb-font-mono)' }}>
                {formatMoney(line.extendedPriceCents)}
              </span>
            </button>
          ))}
        </div>

        {/* Reason */}
        <div className="mb-3">
          <span className="text-[10px] font-bold uppercase block mb-1" style={{ color: 'var(--fnb-text-muted)' }}>
            Reason
          </span>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="rounded-md px-2.5 py-1 text-[10px] font-medium border transition-colors"
                style={{
                  borderColor: reason === r ? 'var(--fnb-accent-primary)' : 'rgba(148, 163, 184, 0.15)',
                  backgroundColor: reason === r ? 'color-mix(in srgb, var(--fnb-accent-primary) 10%, transparent)' : 'transparent',
                  color: reason === r ? 'var(--fnb-accent-primary)' : 'var(--fnb-text-muted)',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selectedLineIds.size === 0 || !reason || disabled}
          className="w-full rounded-lg py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
          style={{
            backgroundColor: activeTab === 'comp' ? 'var(--fnb-status-available)' : 'var(--fnb-status-dirty)',
          }}
        >
          {activeTab === 'comp' ? 'Comp' : 'Void'} {selectedLineIds.size} item{selectedLineIds.size !== 1 ? 's' : ''}
        </button>
      </div>
    </div>,
    document.body,
  );
}
