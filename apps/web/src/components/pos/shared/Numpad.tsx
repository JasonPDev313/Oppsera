'use client';

import { memo, useCallback } from 'react';
import { Delete } from 'lucide-react';

interface NumpadProps {
  value: string;
  onChange: (value: string) => void;
  showDecimal?: boolean;
  disabled?: boolean;
}

const KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['C', '0', '00'],
] as const;

function NumpadComponent({ value, onChange, showDecimal = true, disabled = false }: NumpadProps) {
  const handleKey = useCallback(
    (key: string) => {
      if (disabled) return;
      if (key === 'C') {
        onChange('');
        return;
      }
      if (key === 'backspace') {
        onChange(value.slice(0, -1));
        return;
      }
      if (key === '.') {
        if (value.includes('.')) return;
        onChange(value + '.');
        return;
      }
      // Don't allow more than 2 decimal places
      if (value.includes('.')) {
        const decimalPart = value.split('.')[1] ?? '';
        if (key === '00' && decimalPart.length >= 1) return;
        if (decimalPart.length >= 2) return;
      }
      onChange(value + key);
    },
    [value, onChange, disabled],
  );

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {KEYS.map((row) =>
        row.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleKey(key)}
            disabled={disabled}
            className={`flex h-14 items-center justify-center rounded-lg text-lg font-bold transition-all active:scale-[0.97] ${
              key === 'C'
                ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            } disabled:opacity-40`}
          >
            {key}
          </button>
        )),
      )}
      {/* Bottom row: decimal / backspace */}
      {showDecimal && (
        <button
          type="button"
          onClick={() => handleKey('.')}
          disabled={disabled || value.includes('.')}
          className="flex h-14 items-center justify-center rounded-lg bg-gray-100 text-lg font-bold text-gray-900 transition-all hover:bg-gray-200 active:scale-[0.97] disabled:opacity-40"
        >
          .
        </button>
      )}
      {!showDecimal && <div />}
      <button
        type="button"
        onClick={() => handleKey('backspace')}
        disabled={disabled || !value}
        className="col-span-2 flex h-14 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-all hover:bg-gray-200 active:scale-[0.97] disabled:opacity-40"
      >
        <Delete className="h-5 w-5" />
      </button>
    </div>
  );
}

export const Numpad = memo(NumpadComponent);
