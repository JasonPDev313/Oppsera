'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, X, Check, Delete } from 'lucide-react';

const MAX_PIN = 8;
const MIN_PIN = 4;

export interface ManagerPinModalProps {
  open: boolean;
  onClose: () => void;
  onVerify: (pin: string) => Promise<boolean>;
  error?: string | null;
  title?: string;
  /** Optional description of the action being authorized */
  actionLabel?: string;
}

/**
 * Shared Manager PIN modal — Tailwind-based, no F&B tokens.
 * Used by both Retail and F&B POS modes.
 *
 * Benchmarked against Square, Toast, Clover, Lightspeed:
 * - 4–8 digit variable-length with confirm button (Toast/Lightspeed pattern)
 * - 48px min touch targets (WCAG 2.5.5 + AusPayNet guidelines)
 * - Shake animation on error (universal POS standard)
 * - Success flash before dismiss
 * - Keyboard + numpad support
 * - aria-labels for screen readers
 */
export function ManagerPinModal({
  open,
  onClose,
  onVerify,
  error,
  title = 'Manager Override',
  actionLabel,
}: ManagerPinModalProps) {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPin('');
      setSuccess(false);
      setTimeout(() => containerRef.current?.focus(), 100);
    }
  }, [open]);

  // Shake on error
  useEffect(() => {
    if (error) {
      setShake(true);
      setPin('');
      const t = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleDigit = useCallback((digit: string) => {
    setPin((prev) => (prev.length < MAX_PIN ? prev + digit : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length < MIN_PIN) return;
    setIsVerifying(true);
    try {
      const ok = await onVerify(pin);
      if (ok) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setPin('');
        }, 600);
      } else {
        setPin('');
      }
    } finally {
      setIsVerifying(false);
    }
  }, [pin, onVerify]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Enter') {
      handleSubmit();
    } else if (/^[0-9]$/.test(e.key)) {
      handleDigit(e.key);
    }
  }, [onClose, handleBackspace, handleSubmit, handleDigit]);

  if (!open) return null;

  const canSubmit = pin.length >= MIN_PIN && !isVerifying && !success;

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className={`relative z-10 w-80 rounded-2xl bg-surface p-6 shadow-2xl outline-none transition-transform ${
          shake ? 'animate-[shake_0.35s_ease-in-out]' : ''
        }`}
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {success ? (
              <Check className="h-5 w-5 text-emerald-500" />
            ) : (
              <Lock className="h-5 w-5 text-amber-500" />
            )}
            <h3 className="text-sm font-bold">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 transition-colors hover:bg-accent/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {actionLabel && (
          <p className="mb-2 text-center text-xs text-muted-foreground/80">{actionLabel}</p>
        )}

        <p className="mb-3 text-center text-xs text-muted-foreground">
          Enter your 4–8 digit PIN
        </p>

        {/* PIN dots — show filled for entered digits, empty for remaining capacity */}
        <div className="mb-3 flex items-center justify-center gap-2" aria-live="polite" aria-atomic="true">
          <span className="sr-only">{pin.length} of {MAX_PIN} digits entered</span>
          {Array.from({ length: MAX_PIN }, (_, i) => (
            <div
              key={i}
              className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
                success
                  ? 'border-emerald-500 bg-emerald-500'
                  : error && i < pin.length
                    ? 'scale-110 border-red-500 bg-red-500'
                    : i < pin.length
                      ? 'border-indigo-500 bg-indigo-500'
                      : 'border-border/40 bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Digit counter */}
        <p className={`mb-2 text-center text-[10px] font-medium ${
          pin.length >= MIN_PIN ? 'text-emerald-500' : 'text-muted-foreground/50'
        }`}>
          {pin.length} / {MAX_PIN}
        </p>

        {error && (
          <p className="mb-2 text-center text-xs font-medium text-red-500" role="alert">{error}</p>
        )}

        {/* Keypad — 48px min touch targets per WCAG 2.5.5 */}
        <div className="mb-3 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'].map((key) => (
            <button
              key={key}
              type="button"
              aria-label={
                key === 'del' ? 'Delete last digit'
                  : key === 'clear' ? 'Clear all digits'
                    : `Digit ${key}`
              }
              onClick={() => {
                if (key === 'del') handleBackspace();
                else if (key === 'clear') handleClear();
                else handleDigit(key);
                containerRef.current?.focus();
              }}
              disabled={isVerifying || success}
              className={`flex h-12 min-h-12 items-center justify-center rounded-lg text-lg font-bold transition-all active:scale-95 disabled:opacity-20 ${
                key === 'clear'
                  ? 'bg-muted/40 text-xs font-medium text-muted-foreground hover:bg-accent/50'
                  : 'bg-muted/80 hover:bg-accent/80'
              }`}
            >
              {key === 'del' ? <Delete className="h-5 w-5" /> : key === 'clear' ? 'CLR' : key}
            </button>
          ))}
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full rounded-lg py-3 text-sm font-bold text-white transition-all ${
            success
              ? 'bg-emerald-500'
              : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40'
          }`}
        >
          {success ? 'Verified' : isVerifying ? 'Verifying...' : 'Confirm'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
