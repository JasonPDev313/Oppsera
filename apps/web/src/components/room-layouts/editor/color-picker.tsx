'use client';

import { useState, useCallback } from 'react';

const SWATCHES = [
  '#8B4513', '#D2B48C', '#FFFFFF',
  '#808080', '#4A4A4A', '#C4A77D',
  '#2E75B6', '#548235', '#BF8F00',
  '#e2e8f0', '#64748b', '#334155',
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  onCommit: () => void;
  label?: string;
}

export function ColorPicker({ value, onChange, onCommit, label }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);

  const handleHexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setHexInput(v);
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        onChange(v);
      }
    },
    [onChange],
  );

  const handleHexBlur = useCallback(() => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
      onChange(hexInput);
      onCommit();
    } else {
      setHexInput(value);
    }
  }, [hexInput, value, onChange, onCommit]);

  const handleSwatchClick = useCallback(
    (color: string) => {
      setHexInput(color);
      onChange(color);
      onCommit();
    },
    [onChange, onCommit],
  );

  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs font-medium text-gray-500">{label}</label>}
      <div className="flex items-center gap-2">
        <div
          className="h-6 w-6 shrink-0 rounded border border-gray-300"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          className="w-full rounded border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-900"
          placeholder="#000000"
        />
      </div>
      <div className="grid grid-cols-6 gap-1">
        {SWATCHES.map((color) => (
          <button
            key={color}
            className="h-5 w-5 rounded border border-gray-300 hover:ring-2 hover:ring-indigo-400"
            style={{ backgroundColor: color }}
            onClick={() => handleSwatchClick(color)}
            title={color}
          />
        ))}
      </div>
    </div>
  );
}
