'use client';

import { useState, useMemo } from 'react';

interface CashCountFormProps {
  onSubmit: (totalCents: number, denominations: Record<string, number>) => void;
  disabled?: boolean;
}

const DENOMINATIONS = [
  { key: 'pennies', label: 'Pennies (1¢)', valueCents: 1 },
  { key: 'nickels', label: 'Nickels (5¢)', valueCents: 5 },
  { key: 'dimes', label: 'Dimes (10¢)', valueCents: 10 },
  { key: 'quarters', label: 'Quarters (25¢)', valueCents: 25 },
  { key: 'ones', label: '$1 Bills', valueCents: 100 },
  { key: 'fives', label: '$5 Bills', valueCents: 500 },
  { key: 'tens', label: '$10 Bills', valueCents: 1000 },
  { key: 'twenties', label: '$20 Bills', valueCents: 2000 },
  { key: 'fifties', label: '$50 Bills', valueCents: 5000 },
  { key: 'hundreds', label: '$100 Bills', valueCents: 10000 },
];

export function CashCountForm({ onSubmit, disabled }: CashCountFormProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const totalCents = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => {
      return sum + (counts[d.key] ?? 0) * d.valueCents;
    }, 0);
  }, [counts]);

  const handleChange = (key: string, value: string) => {
    const num = parseInt(value, 10);
    setCounts((prev) => ({ ...prev, [key]: isNaN(num) ? 0 : num }));
  };

  const handleSubmit = () => {
    onSubmit(totalCents, counts);
  };

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}>
      <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--fnb-text-primary)' }}>Cash Count</h3>

      <div className="space-y-2 mb-4">
        {DENOMINATIONS.map((d) => (
          <div key={d.key} className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--fnb-text-secondary)' }}>{d.label}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={counts[d.key] ?? ''}
                onChange={(e) => handleChange(d.key, e.target.value)}
                className="w-16 rounded px-2 py-1 text-xs font-mono text-right outline-none"
                style={{
                  backgroundColor: 'var(--fnb-bg-elevated)',
                  color: 'var(--fnb-text-primary)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              />
              <span
                className="w-16 text-xs font-mono text-right"
                style={{ color: 'var(--fnb-text-muted)', fontFamily: 'var(--fnb-font-mono)' }}
              >
                {formatMoney((counts[d.key] ?? 0) * d.valueCents)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <span className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>Total</span>
        <span
          className="text-lg font-bold font-mono"
          style={{ color: 'var(--fnb-accent-primary)', fontFamily: 'var(--fnb-font-mono)' }}
        >
          {formatMoney(totalCents)}
        </span>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || totalCents === 0}
        className="w-full mt-3 rounded-lg py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: 'var(--fnb-status-seated)' }}
      >
        Submit Count
      </button>
    </div>
  );
}
