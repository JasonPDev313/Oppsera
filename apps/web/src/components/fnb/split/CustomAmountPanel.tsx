'use client';

import { useState } from 'react';

interface CustomAmountPanelProps {
  totalCents: number;
  onApply: (amounts: { label: string; amountCents: number }[]) => void;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CustomAmountPanel({ totalCents, onApply }: CustomAmountPanelProps) {
  const [entries, setEntries] = useState<{ label: string; amountCents: number }[]>([
    { label: 'Check 1', amountCents: 0 },
    { label: 'Check 2', amountCents: 0 },
  ]);

  const allocatedCents = entries.reduce((sum, e) => sum + e.amountCents, 0);
  const remainingCents = totalCents - allocatedCents;

  const addEntry = () => {
    setEntries([...entries, { label: `Check ${entries.length + 1}`, amountCents: 0 }]);
  };

  const updateAmount = (index: number, dollars: string) => {
    const cents = Math.round(parseFloat(dollars || '0') * 100);
    setEntries(entries.map((e, i) => i === index ? { ...e, amountCents: cents } : e));
  };

  return (
    <div className="px-4 py-3">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={entry.label}
            onChange={(e) => setEntries(entries.map((en, j) => j === i ? { ...en, label: e.target.value } : en))}
            className="rounded-lg px-3 py-2 text-xs w-24"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
              border: '1px solid rgba(148, 163, 184, 0.15)',
            }}
          />
          <span className="text-sm" style={{ color: 'var(--fnb-text-secondary)' }}>$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={(entry.amountCents / 100).toFixed(2)}
            onChange={(e) => updateAmount(i, e.target.value)}
            className="rounded-lg px-3 py-2 text-xs fnb-mono flex-1"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
              border: '1px solid rgba(148, 163, 184, 0.15)',
            }}
          />
          {entries.length > 2 && (
            <button
              type="button"
              onClick={() => setEntries(entries.filter((_, j) => j !== i))}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--fnb-status-dirty)' }}
            >
              ×
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <button
          type="button"
          onClick={addEntry}
          className="text-xs font-semibold"
          style={{ color: 'var(--fnb-status-seated)' }}
        >
          + Add Check
        </button>
        <div className="text-right">
          <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
            Remaining: <span className="fnb-mono font-bold" style={{ color: remainingCents > 0 ? 'var(--fnb-status-dirty)' : 'var(--fnb-status-available)' }}>
              {formatMoney(remainingCents)}
            </span>
          </p>
          <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>
            Total: {formatMoney(totalCents)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onApply(entries.filter((e) => e.amountCents > 0))}
        disabled={remainingCents !== 0}
        className="w-full mt-3 rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: 'var(--fnb-status-seated)' }}
      >
        Apply Custom Split
      </button>
    </div>
  );
}
