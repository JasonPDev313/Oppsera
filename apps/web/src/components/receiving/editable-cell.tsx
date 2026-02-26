'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface EditableCellProps {
  value: number;
  onChange: (value: number) => void;
  /** 'integer' for qty, 'currency' for unit cost */
  mode: 'integer' | 'currency';
  /** Unique identifier for Tab navigation: `${rowIndex}-${colIndex}` */
  cellId: string;
  /** Called when Tab pressed — should focus the next editable cell */
  onTab?: (cellId: string, shiftKey: boolean) => void;
  disabled?: boolean;
}

function formatDisplay(value: number, mode: 'integer' | 'currency'): string {
  if (mode === 'integer') return String(value);
  return value.toFixed(4);
}

function parseInput(raw: string, mode: 'integer' | 'currency'): number | null {
  if (raw === '') return null;
  if (mode === 'integer') {
    const n = parseInt(raw, 10);
    return isNaN(n) || n < 0 ? null : n;
  }
  const n = parseFloat(raw);
  return isNaN(n) || n < 0 ? null : n;
}

export function EditableCell({
  value,
  onChange,
  mode,
  cellId,
  onTab,
  disabled = false,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // When entering edit mode, populate with current value
  const startEditing = useCallback(() => {
    if (disabled) return;
    setEditValue(formatDisplay(value, mode));
    setIsEditing(true);
  }, [value, mode, disabled]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Commit the current edit value
  const commit = useCallback(() => {
    const parsed = parseInput(editValue, mode);
    if (parsed !== null && parsed !== value) {
      onChange(parsed);
    }
    setIsEditing(false);
  }, [editValue, mode, value, onChange]);

  // Revert to original value
  const revert = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        revert();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commit();
        onTab?.(cellId, e.shiftKey);
      }
    },
    [commit, revert, onTab, cellId],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (mode === 'integer') {
        // Only digits
        if (/^\d*$/.test(raw)) setEditValue(raw);
      } else {
        // Digits with optional single decimal
        if (/^\d*\.?\d*$/.test(raw)) setEditValue(raw);
      }
    },
    [mode],
  );

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        data-cell-id={cellId}
        type="text"
        inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
        value={editValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        className="w-full rounded border border-indigo-400 bg-surface px-2 py-1 text-right text-sm text-foreground focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        style={{ minWidth: 60 }}
      />
    );
  }

  // Display mode
  const displayValue =
    mode === 'currency'
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        }).format(value)
      : String(value);

  return (
    <button
      type="button"
      data-cell-id={cellId}
      onClick={startEditing}
      disabled={disabled}
      className={`w-full rounded px-2 py-1 text-right text-sm transition-colors ${
        disabled
          ? 'cursor-default text-muted-foreground'
          : 'cursor-pointer text-foreground hover:bg-indigo-500/10 focus:bg-indigo-500/10 focus:ring-2 focus:ring-indigo-500 focus:outline-none'
      }`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        // Enter or Space to start editing
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startEditing();
        }
        // Tab navigation in display mode
        if (e.key === 'Tab') {
          e.preventDefault();
          onTab?.(cellId, e.shiftKey);
        }
      }}
    >
      {displayValue}
    </button>
  );
}
