'use client';

import { useState, useCallback } from 'react';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowNegative?: boolean;
  error?: boolean;
  disabled?: boolean;
  className?: string;
}

export function MoneyInput({
  value,
  onChange,
  placeholder = '0.00',
  allowNegative = false,
  error = false,
  disabled = false,
  className = '',
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow empty string, digits, single decimal point, optional leading minus
      const pattern = allowNegative ? /^-?\d*\.?\d{0,2}$/ : /^\d*\.?\d{0,2}$/;
      if (raw === '' || pattern.test(raw)) {
        onChange(raw);
      }
    },
    [onChange, allowNegative],
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
    // Format to 2 decimal places on blur if there's a value
    if (value && value !== '' && value !== '-') {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        onChange(num.toFixed(2));
      }
    }
  }, [value, onChange]);

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-lg border py-2 pl-7 pr-3 text-right text-sm tabular-nums focus:ring-2 focus:outline-none ${
          error
            ? 'border-red-500/30 focus:border-red-500 focus:ring-red-500'
            : focused
              ? 'border-indigo-500 ring-2 ring-indigo-500'
              : 'border-input focus:border-indigo-500 focus:ring-indigo-500'
        } ${disabled ? 'cursor-not-allowed bg-muted text-muted-foreground' : ''}`}
      />
    </div>
  );
}
