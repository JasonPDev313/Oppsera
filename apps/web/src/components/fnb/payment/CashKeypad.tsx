'use client';

import { useState, useCallback } from 'react';
import { Delete, ArrowLeft } from 'lucide-react';

interface CashKeypadProps {
  totalCents: number;
  onSubmit: (amountCents: number) => void;
  onBack?: () => void;
  disabled?: boolean;
}

const QUICK_AMOUNTS = [
  { label: 'Exact', cents: 0, primary: true },
  { label: '$5', cents: 500, primary: false },
  { label: '$10', cents: 1000, primary: false },
  { label: '$20', cents: 2000, primary: false },
  { label: '$50', cents: 5000, primary: false },
  { label: '$100', cents: 10000, primary: false },
];

export function CashKeypad({ totalCents, onSubmit, onBack, disabled }: CashKeypadProps) {
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
    <div className="flex flex-col gap-3 fnb-fade-scale-in">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center rounded-lg h-8 w-8 transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--fnb-tender-cash)' }}
        >
          Cash Payment
        </span>
      </div>

      {/* Display */}
      <div
        className="rounded-xl p-4 text-center"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
      >
        <div
          className="text-[10px] font-bold uppercase mb-1"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Amount Tendered
        </div>
        <div
          className="text-3xl font-mono font-bold"
          style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}
        >
          {input ? `$${input}` : '$0.00'}
        </div>
      </div>

      {/* Large change-due display */}
      {inputCents > 0 && inputCents >= totalCents && (
        <div
          className="rounded-xl p-4 text-center fnb-success-pop"
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

      {/* Quick amounts — 3×2 grid */}
      <div className="grid grid-cols-3 gap-2">
        {QUICK_AMOUNTS.map(({ label, cents, primary }) => (
          <button
            key={label}
            type="button"
            onClick={() => handleQuickAmount(cents)}
            disabled={disabled}
            className="rounded-xl py-2.5 font-bold transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40"
            style={{
              backgroundColor: primary
                ? 'var(--fnb-tender-cash)'
                : 'var(--fnb-bg-elevated)',
              color: primary ? '#fff' : 'var(--fnb-text-secondary)',
              border: primary
                ? '1.5px solid var(--fnb-tender-cash)'
                : '1.5px solid transparent',
              fontSize: '0.8125rem',
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
            className="flex items-center justify-center rounded-xl font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.97] disabled:opacity-40"
            style={{
              height: 60,
              backgroundColor: key === 'del'
                ? 'color-mix(in srgb, var(--fnb-danger) 12%, transparent)'
                : 'var(--fnb-bg-elevated)',
              color: key === 'del' ? 'var(--fnb-danger)' : 'var(--fnb-text-primary)',
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
        className="rounded-xl py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: 'var(--fnb-status-available)' }}
      >
        Pay {input ? formatMoney(inputCents) : 'Cash'}
      </button>
    </div>
  );
}
