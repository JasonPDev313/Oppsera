'use client';

import { useState, useCallback } from 'react';
import { Delete } from 'lucide-react';

interface CashKeypadProps {
  totalCents: number;
  onSubmit: (amountCents: number) => void;
  disabled?: boolean;
}

const QUICK_AMOUNTS = [
  { label: 'Exact', cents: 0 },
  { label: '$5', cents: 500 },
  { label: '$10', cents: 1000 },
  { label: '$20', cents: 2000 },
  { label: '$50', cents: 5000 },
  { label: '$100', cents: 10000 },
];

export function CashKeypad({ totalCents, onSubmit, disabled }: CashKeypadProps) {
  const [input, setInput] = useState('');

  const inputCents = input ? Math.round(parseFloat(input) * 100) : 0;
  const changeCents = Math.max(0, inputCents - totalCents);

  const handleDigit = useCallback((digit: string) => {
    setInput((prev) => {
      if (digit === '.' && prev.includes('.')) return prev;
      if (prev.includes('.') && prev.split('.')[1]!.length >= 2) return prev;
      return prev + digit;
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setInput((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setInput('');
  }, []);

  const handleQuickAmount = useCallback(
    (cents: number) => {
      if (cents === 0) {
        onSubmit(totalCents);
      } else {
        onSubmit(cents);
      }
    },
    [totalCents, onSubmit],
  );

  const handleSubmit = useCallback(() => {
    if (inputCents >= totalCents) {
      onSubmit(inputCents);
    }
  }, [inputCents, totalCents, onSubmit]);

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Display */}
      <div
        className="rounded-lg p-3 text-center"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
      >
        <div
          className="text-[10px] font-bold uppercase mb-1"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Amount Tendered
        </div>
        <div
          className="text-2xl font-mono font-bold"
          style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}
        >
          {input ? `$${input}` : '$0.00'}
        </div>
      </div>

      {/* Large change-due display (Phase 2B) */}
      {inputCents > 0 && inputCents >= totalCents && (
        <div
          className="rounded-xl p-4 text-center"
          style={{ backgroundColor: 'var(--fnb-payment-success-bg)' }}
        >
          <div
            className="text-[10px] font-bold uppercase mb-1"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            Change Due
          </div>
          <div
            className="font-mono font-bold"
            style={{
              fontSize: 'var(--fnb-change-due-size)',
              color: 'var(--fnb-status-available)',
              fontFamily: 'var(--fnb-font-mono)',
            }}
          >
            {formatMoney(changeCents)}
          </div>
        </div>
      )}

      {/* Quick amounts — 3×2 grid (Phase 2A) */}
      <div className="grid grid-cols-3 gap-2">
        {QUICK_AMOUNTS.map(({ label, cents }) => (
          <button
            key={label}
            type="button"
            onClick={() => handleQuickAmount(cents)}
            disabled={disabled}
            className="rounded-lg py-2 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-40"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === 'del') handleBackspace();
              else handleDigit(key);
            }}
            onDoubleClick={() => {
              if (key === 'del') handleClear();
            }}
            disabled={disabled}
            className="flex items-center justify-center rounded-lg font-bold text-base sm:text-lg transition-colors hover:opacity-80 disabled:opacity-40"
            style={{
              height: 56,
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
            }}
          >
            {key === 'del' ? <Delete className="h-5 w-5" /> : key}
          </button>
        ))}
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || inputCents < totalCents}
        className="rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: 'var(--fnb-status-available)' }}
      >
        Pay {input ? formatMoney(inputCents) : 'Cash'}
      </button>
    </div>
  );
}
