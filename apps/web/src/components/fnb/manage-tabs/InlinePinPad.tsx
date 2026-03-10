'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Delete, Check } from 'lucide-react';

const MAX_PIN = 8;
const MIN_PIN = 4;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_SECONDS = 60;

interface InlinePinPadProps {
  onVerify: (pin: string) => Promise<boolean>;
  onBack: () => void;
  error: string | null;
  title: string;
  /** Optional description of the action being authorized */
  actionLabel?: string;
  /** Max consecutive failures before client-side lockout (default 5) */
  maxAttempts?: number;
  /** Lockout duration in seconds (default 60) */
  lockoutSeconds?: number;
}

export function InlinePinPad({
  onVerify, onBack, error, title, actionLabel,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  lockoutSeconds = DEFAULT_LOCKOUT_SECONDS,
}: InlinePinPadProps) {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [_failureCount, setFailureCount] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => containerRef.current?.focus(), 100);
  }, []);

  // Shake + clear pin + increment failure counter on each new error
  useEffect(() => {
    if (!error) return;
    setShake(true);
    setPin('');
    setFailureCount((prev) => {
      const next = prev + 1;
      if (next >= maxAttempts) {
        setLockedUntil(Date.now() + lockoutSeconds * 1000);
      }
      return next;
    });
    const t = setTimeout(() => setShake(false), 400);
    return () => clearTimeout(t);
  }, [error, maxAttempts, lockoutSeconds]);

  // Countdown timer during lockout
  useEffect(() => {
    if (!lockedUntil) { setSecondsLeft(null); return; }
    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setFailureCount(0);
        setSecondsLeft(null);
      } else {
        setSecondsLeft(remaining);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

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
      onBack();
    } else if (e.key === 'Backspace') {
      handleBackspace();
    } else if (e.key === 'Enter') {
      handleSubmit();
    } else if (/^[0-9]$/.test(e.key)) {
      handleDigit(e.key);
    }
  }, [onBack, handleBackspace, handleSubmit, handleDigit]);

  const isLocked = !!lockedUntil;
  const canSubmit = pin.length >= MIN_PIN && !isVerifying && !success && !isLocked;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={containerRef}
      tabIndex={-1}
      role="group"
      aria-label={title}
      className={`flex flex-col gap-3 outline-none ${shake ? 'animate-[shake_0.35s_ease-in-out]' : ''}`}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        {success ? (
          <Check className="h-6 w-6" style={{ color: 'var(--fnb-action-send)' }} />
        ) : (
          <Lock className="h-6 w-6" style={{ color: 'var(--fnb-status-check-presented)' }} />
        )}
        <h2 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          {title}
        </h2>
      </div>

      {actionLabel && (
        <p className="text-xs text-center" style={{ color: 'var(--fnb-text-muted)', opacity: 0.8 }}>
          {actionLabel}
        </p>
      )}

      <p className="text-xs text-center" style={{ color: 'var(--fnb-text-muted)' }}>
        Enter your 4–8 digit PIN
      </p>

      {/* PIN dots */}
      <div className="flex justify-center gap-2 py-1" aria-live="polite" aria-atomic="true">
        <span className="sr-only">{pin.length} of {MAX_PIN} digits entered</span>
        {Array.from({ length: MAX_PIN }, (_, i) => (
          <div
            key={i}
            className="h-4 w-4 rounded-full border-2 transition-all duration-150"
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
              transform: error && i < pin.length ? 'scale(1.15)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      {/* Digit counter */}
      <p className="text-center text-[10px] font-medium" style={{
        color: pin.length >= MIN_PIN ? 'var(--fnb-action-send)' : 'var(--fnb-text-muted)',
        opacity: pin.length >= MIN_PIN ? 1 : 0.5,
      }}>
        {pin.length} / {MAX_PIN}
      </p>

      {isLocked && secondsLeft != null && (
        <p className="text-sm text-center font-semibold" role="alert" style={{ color: 'var(--fnb-status-dirty)' }}>
          Too many attempts — locked for {secondsLeft}s
        </p>
      )}

      {!isLocked && error && (
        <p className="text-sm text-center font-medium" role="alert" style={{ color: 'var(--fnb-status-dirty)' }}>
          {error}
        </p>
      )}

      {/* Keypad — 48px+ touch targets */}
      <div className="grid grid-cols-3 gap-2">
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
            className="flex items-center justify-center rounded-xl text-xl font-bold transition-all hover:opacity-80 active:scale-95 disabled:opacity-20"
            style={{
              height: 64,
              minHeight: 48,
              backgroundColor: key === 'clear' ? 'transparent' : 'var(--fnb-bg-elevated)',
              color: key === 'clear' ? 'var(--fnb-text-muted)' : 'var(--fnb-text-primary)',
              fontSize: key === 'clear' ? '11px' : undefined,
              fontWeight: key === 'clear' ? 500 : undefined,
            }}
          >
            {key === 'del' ? <Delete className="h-6 w-6" /> : key === 'clear' ? 'CLR' : key}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-4 py-3 rounded-lg text-sm font-medium"
          style={{ background: 'transparent', color: 'var(--fnb-text-secondary)', border: '1px solid var(--fnb-border-subtle)' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 px-4 py-3 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            backgroundColor: success ? 'var(--fnb-action-send)' : 'var(--fnb-status-seated)',
          }}
        >
          {success ? 'Verified' : isVerifying ? 'Verifying...' : isLocked ? `Locked (${secondsLeft}s)` : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
