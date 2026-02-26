'use client';

import { useState, useEffect } from 'react';

interface CurrencyInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  error?: string;
  className?: string;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = '0.00',
  error,
  className = '',
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(value != null ? value.toFixed(2) : '');

  useEffect(() => {
    if (value != null && !document.activeElement?.matches('[data-currency-input]')) {
      setDisplay(value.toFixed(2));
    }
  }, [value]);

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    setDisplay(cleaned);
  };

  const handleBlur = () => {
    if (display === '') {
      onChange(null);
      return;
    }
    const num = parseFloat(display);
    if (isNaN(num)) {
      setDisplay(value != null ? value.toFixed(2) : '');
      return;
    }
    setDisplay(num.toFixed(2));
    onChange(num);
  };

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <input
        data-currency-input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-surface py-2 pl-7 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:outline-none ${
          error
            ? 'border-red-500/30 focus:border-red-500 focus:ring-red-500'
            : 'border-border focus:border-indigo-500 focus:ring-indigo-500'
        }`}
      />
    </div>
  );
}
