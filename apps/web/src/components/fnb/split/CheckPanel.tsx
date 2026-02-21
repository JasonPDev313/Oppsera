'use client';

import type { FnbSplitCheck, FnbTabLine } from '@/types/fnb';

interface CheckPanelProps {
  check: FnbSplitCheck;
  lines: FnbTabLine[];
  isActive: boolean;
  onSelect: () => void;
  onRemoveItem?: (lineId: string) => void;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CheckPanel({ check, lines, isActive, onSelect, onRemoveItem }: CheckPanelProps) {
  const checkLines = lines.filter((l) => check.lineIds.includes(l.id));

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden transition-colors"
      style={{
        backgroundColor: 'var(--fnb-bg-surface)',
        border: isActive
          ? '2px solid var(--fnb-status-seated)'
          : '1px solid rgba(148, 163, 184, 0.15)',
        minWidth: '200px',
        flex: '1 1 0',
      }}
      onClick={onSelect}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{
          borderColor: 'rgba(148, 163, 184, 0.1)',
          backgroundColor: check.isPaid ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
        }}
      >
        <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          {check.label}
        </span>
        {check.isPaid && (
          <span className="text-[10px] font-bold" style={{ color: 'var(--fnb-status-available)' }}>
            PAID
          </span>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {checkLines.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--fnb-text-muted)' }}>
            Drag items here
          </p>
        ) : (
          checkLines.map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-between py-1.5 border-b last:border-b-0"
              style={{ borderColor: 'rgba(148, 163, 184, 0.08)' }}
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs" style={{ color: 'var(--fnb-text-primary)' }}>
                  {line.qty > 1 ? `${line.qty}x ` : ''}{line.catalogItemName ?? 'Item'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs fnb-mono" style={{ color: 'var(--fnb-text-secondary)' }}>
                  {formatMoney(line.extendedPriceCents)}
                </span>
                {onRemoveItem && !check.isPaid && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveItem(line.id); }}
                    className="text-[10px] rounded px-1 transition-colors hover:opacity-80"
                    style={{ color: 'var(--fnb-status-dirty)' }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      <div
        className="px-3 py-2 border-t"
        style={{ borderColor: 'rgba(148, 163, 184, 0.1)', backgroundColor: 'var(--fnb-bg-elevated)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
            Subtotal
          </span>
          <span className="text-xs fnb-mono" style={{ color: 'var(--fnb-text-secondary)' }}>
            {formatMoney(check.subtotalCents)}
          </span>
        </div>
        {check.taxCents > 0 && (
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
              Tax
            </span>
            <span className="text-xs fnb-mono" style={{ color: 'var(--fnb-text-secondary)' }}>
              {formatMoney(check.taxCents)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between mt-1 pt-1 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <span className="text-xs font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Total
          </span>
          <span className="text-sm font-bold fnb-mono" style={{ color: 'var(--fnb-text-primary)' }}>
            {formatMoney(check.totalCents)}
          </span>
        </div>
      </div>
    </div>
  );
}
