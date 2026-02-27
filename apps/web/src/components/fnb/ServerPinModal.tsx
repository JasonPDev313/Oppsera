'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ServerPinModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (pin: string) => boolean;
  title?: string;
  description?: string;
}

const PIN_LENGTH = 4;

export function ServerPinModal({
  open,
  onClose,
  onSubmit,
  title = 'Enter PIN',
  description,
}: ServerPinModalProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setDigits([]);
      setError(false);
    }
  }, [open]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (el) el.focus();
  }, [open]);

  const handleDigit = useCallback((d: string) => {
    setError(false);
    setDigits((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = [...prev, d];
      if (next.length === PIN_LENGTH) {
        // Auto-submit
        setTimeout(() => {
          const pin = next.join('');
          const success = onSubmit(pin);
          if (!success) {
            setError(true);
            setDigits([]);
          }
        }, 100);
      }
      return next;
    });
  }, [onSubmit]);

  const handleBackspace = useCallback(() => {
    setError(false);
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (/^[0-9]$/.test(e.key)) {
      handleDigit(e.key);
    }
  }, [onClose, handleBackspace, handleDigit]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="rounded-2xl p-6 w-[320px] shadow-2xl outline-none"
        style={{
          backgroundColor: 'var(--fnb-bg-surface)',
          border: 'var(--fnb-border-subtle)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-lg font-bold"
            style={{ color: 'var(--fnb-text-primary)' }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 transition-colors"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {description && (
          <p className="text-xs mb-4" style={{ color: 'var(--fnb-text-muted)' }}>
            {description}
          </p>
        )}

        {/* PIN dots */}
        <div className="flex items-center justify-center gap-3 mb-4">
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <div
              key={i}
              className="h-4 w-4 rounded-full transition-all"
              style={{
                backgroundColor: i < digits.length
                  ? error ? 'var(--fnb-status-unavailable)' : 'var(--fnb-action-send)'
                  : 'var(--fnb-bg-elevated)',
                border: `2px solid ${
                  error ? 'var(--fnb-status-unavailable)'
                    : i < digits.length ? 'var(--fnb-action-send)' : 'var(--fnb-text-muted)'
                }`,
                transform: error ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {error && (
          <p className="text-center text-xs font-semibold mb-3" style={{ color: 'var(--fnb-status-unavailable)' }}>
            Incorrect PIN
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key) => {
            if (key === '') return <div key="empty" />;
            return (
              <button
                key={key}
                type="button"
                onClick={() => key === '⌫' ? handleBackspace() : handleDigit(key)}
                className="flex items-center justify-center rounded-xl text-xl font-semibold transition-colors"
                style={{
                  height: 'var(--fnb-touch-primary, 56px)',
                  backgroundColor: 'var(--fnb-bg-elevated)',
                  color: 'var(--fnb-text-primary)',
                  border: 'var(--fnb-border-subtle)',
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
