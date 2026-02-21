'use client';

import type { FnbSplitStrategy } from '@/types/fnb';

interface SplitModeSelectorProps {
  activeMode: FnbSplitStrategy;
  onSelect: (mode: FnbSplitStrategy) => void;
}

const MODES: { key: FnbSplitStrategy; label: string }[] = [
  { key: 'by_seat', label: 'By Seat' },
  { key: 'by_item', label: 'By Item' },
  { key: 'equal_split', label: 'Equal Split' },
  { key: 'custom_amount', label: 'Custom Amount' },
];

export function SplitModeSelector({ activeMode, onSelect }: SplitModeSelectorProps) {
  return (
    <div
      className="flex flex-wrap sm:flex-nowrap gap-1.5 px-2 sm:px-4 py-2 border-b shrink-0"
      style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
    >
      {MODES.map((mode) => {
        const isActive = activeMode === mode.key;
        return (
          <button
            key={mode.key}
            type="button"
            onClick={() => onSelect(mode.key)}
            className="rounded-lg px-4 py-2 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: isActive ? 'var(--fnb-status-seated)' : 'var(--fnb-bg-elevated)',
              color: isActive ? '#fff' : 'var(--fnb-text-secondary)',
            }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
