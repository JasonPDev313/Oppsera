'use client';

import { useState, useCallback } from 'react';

interface TipPromptProps {
  subtotalCents: number;
  onSelect: (tipCents: number) => void;
  disabled?: boolean;
}

const TIP_PERCENTAGES = [18, 20, 22];

export function TipPrompt({ subtotalCents, onSelect, disabled }: TipPromptProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handlePercentage = useCallback(
    (pct: number) => {
      const tipCents = Math.round((subtotalCents * pct) / 100);
      onSelect(tipCents);
    },
    [subtotalCents, onSelect],
  );

  const handleNoTip = useCallback(() => {
    onSelect(0);
  }, [onSelect]);

  const handleCustomSubmit = useCallback(() => {
    if (!customInput) return;
    const tipCents = Math.round(parseFloat(customInput) * 100);
    if (tipCents >= 0) onSelect(tipCents);
  }, [customInput, onSelect]);

  if (customMode) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <span className="text-xs font-bold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
          Custom Tip
        </span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className="flex-1 rounded-lg px-3 py-2 text-lg font-mono outline-none"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
              fontFamily: 'var(--fnb-font-mono)',
            }}
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="flex-1 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={disabled || !customInput}
            className="flex-1 rounded-lg py-2 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}
          >
            Add Tip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <span className="text-xs font-bold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
        Add Gratuity
      </span>
      <div className="flex flex-wrap sm:flex-nowrap gap-2">
        {TIP_PERCENTAGES.map((pct) => {
          const tipCents = Math.round((subtotalCents * pct) / 100);
          return (
            <button
              key={pct}
              type="button"
              onClick={() => handlePercentage(pct)}
              disabled={disabled}
              className="flex-1 flex flex-col items-center justify-center rounded-xl border py-3 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
              style={{
                borderColor: 'rgba(148, 163, 184, 0.15)',
                backgroundColor: 'var(--fnb-bg-elevated)',
              }}
            >
              <span className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
                {pct}%
              </span>
              <span
                className="text-xs font-mono mt-0.5"
                style={{ color: 'var(--fnb-text-muted)', fontFamily: 'var(--fnb-font-mono)' }}
              >
                {formatMoney(tipCents)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          disabled={disabled}
          className="flex-1 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          Custom
        </button>
        <button
          type="button"
          onClick={handleNoTip}
          disabled={disabled}
          className="flex-1 rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-muted)' }}
        >
          No Tip
        </button>
      </div>
    </div>
  );
}
