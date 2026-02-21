'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface OverShortDisplayProps {
  expectedCents: number;
  actualCents: number;
}

export function OverShortDisplay({ expectedCents, actualCents }: OverShortDisplayProps) {
  const diff = actualCents - expectedCents;
  const formatMoney = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`;

  const isOver = diff > 0;
  const isShort = diff < 0;

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: isOver || isShort ? (isOver ? 'var(--fnb-status-available)' : 'var(--fnb-status-dirty)') : 'rgba(148, 163, 184, 0.15)',
        backgroundColor: isOver
          ? 'color-mix(in srgb, var(--fnb-status-available) 5%, var(--fnb-bg-surface))'
          : isShort
            ? 'color-mix(in srgb, var(--fnb-status-dirty) 5%, var(--fnb-bg-surface))'
            : 'var(--fnb-bg-surface)',
      }}
    >
      <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--fnb-text-primary)' }}>
        Over / Short
      </h3>
      <div className="space-y-2 font-mono text-xs" style={{ fontFamily: 'var(--fnb-font-mono)' }}>
        <div className="flex justify-between">
          <span style={{ color: 'var(--fnb-text-muted)' }}>Expected</span>
          <span style={{ color: 'var(--fnb-text-secondary)' }}>{formatMoney(expectedCents)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--fnb-text-muted)' }}>Actual Count</span>
          <span style={{ color: 'var(--fnb-text-secondary)' }}>{formatMoney(actualCents)}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
          <span className="flex items-center gap-1 font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            {isOver ? <TrendingUp className="h-3.5 w-3.5" style={{ color: 'var(--fnb-status-available)' }} /> : isShort ? <TrendingDown className="h-3.5 w-3.5" style={{ color: 'var(--fnb-status-dirty)' }} /> : <Minus className="h-3.5 w-3.5" />}
            {isOver ? 'Over' : isShort ? 'Short' : 'Even'}
          </span>
          <span
            className="text-lg font-bold"
            style={{
              color: isOver ? 'var(--fnb-status-available)' : isShort ? 'var(--fnb-status-dirty)' : 'var(--fnb-text-primary)',
            }}
          >
            {isOver ? '+' : isShort ? '-' : ''}{formatMoney(diff)}
          </span>
        </div>
      </div>
    </div>
  );
}
