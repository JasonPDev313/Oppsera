'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, X, Check, Delete } from 'lucide-react';

const MAX_PIN = 8;
const MIN_PIN = 4;

interface ManagerPinModalProps {
  open: boolean;
  onClose: () => void;
  onVerify: (pin: string) => Promise<boolean>;
  error?: string | null;
  title?: string;
  /** Optional description of the action being authorized */
  actionLabel?: string;
}

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

  useEffect(() => {
    if (open) {
      setPin('');
      setSuccess(false);
      setTimeout(() => containerRef.current?.focus(), 100);
    }
  }, [open]);

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
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--fnb-z-modal)', backgroundColor: 'rgba(0,0,0,0.65)' } as React.CSSProperties}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        className={`relative rounded-2xl p-6 w-80 shadow-2xl outline-none transition-transform ${
          shake ? 'animate-[shake_0.35s_ease-in-out]' : ''
        }`}
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {success ? (
              <Check className="h-5 w-5" style={{ color: 'var(--fnb-action-send)' }} />
            ) : (
              <Lock className="h-5 w-5" style={{ color: 'var(--fnb-status-check-presented)' }} />
            )}
            <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:opacity-80"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {actionLabel && (
          <p className="text-xs text-center mb-2" style={{ color: 'var(--fnb-text-muted)', opacity: 0.8 }}>
            {actionLabel}
          </p>
        )}

        <p className="text-xs text-center mb-3" style={{ color: 'var(--fnb-text-muted)' }}>
          Enter your 4–8 digit PIN
        </p>

        {/* PIN dots */}
        <div className="flex justify-center gap-2 mb-3" aria-live="polite" aria-atomic="true">
          <span className="sr-only">{pin.length} of {MAX_PIN} digits entered</span>
          {Array.from({ length: MAX_PIN }, (_, i) => (
            <div
              key={i}
              className="h-3.5 w-3.5 rounded-full border-2 transition-all duration-150"
              style={{
                borderColor: success
                  ? 'var(--fnb-action-send)'
                  : error && i < pin.length
                    ? 'var(--fnb-status-unavailable)'
                    : i < pin.length
                      ? 'var(--fnb-accent-primary)'
                      : 'rgba(148, 163, 184, 0.3)',
                backgroundColor: success
                  ? 'var(--fnb-action-send)'
                  : error && i < pin.length
                    ? 'var(--fnb-status-unavailable)'
                    : i < pin.length
                      ? 'var(--fnb-accent-primary)'
                      : 'transparent',
                transform: error && i < pin.length ? 'scale(1.1)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {/* Digit counter */}
        <p className="text-center text-[10px] font-medium mb-2" style={{
          color: pin.length >= MIN_PIN ? 'var(--fnb-action-send)' : 'var(--fnb-text-muted)',
          opacity: pin.length >= MIN_PIN ? 1 : 0.5,
        }}>
          {pin.length} / {MAX_PIN}
        </p>

        {error && (
          <p className="text-xs text-center font-medium mb-2" role="alert" style={{ color: 'var(--fnb-status-dirty)' }}>
            {error}
          </p>
        )}

        {/* Keypad — 48px min touch targets per WCAG 2.5.5 */}
        <div className="grid grid-cols-3 gap-2 mb-3">
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
              className="flex items-center justify-center rounded-lg text-lg font-bold transition-all active:scale-95 hover:opacity-80 disabled:opacity-20"
              style={{
                height: 48,
                minHeight: 48,
                backgroundColor: key === 'clear' ? 'transparent' : 'var(--fnb-bg-elevated)',
                color: key === 'clear' ? 'var(--fnb-text-muted)' : 'var(--fnb-text-primary)',
                fontSize: key === 'clear' ? '11px' : undefined,
                fontWeight: key === 'clear' ? 500 : undefined,
              }}
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
          className="w-full rounded-lg py-3 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            backgroundColor: success ? 'var(--fnb-action-send)' : 'var(--fnb-status-seated)',
          }}
        >
          {success ? 'Verified' : isVerifying ? 'Verifying...' : 'Confirm'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
