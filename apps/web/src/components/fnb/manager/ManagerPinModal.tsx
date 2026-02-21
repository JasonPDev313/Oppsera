'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, X } from 'lucide-react';

interface ManagerPinModalProps {
  open: boolean;
  onClose: () => void;
  onVerify: (pin: string) => Promise<boolean>;
  error?: string | null;
  title?: string;
}

export function ManagerPinModal({ open, onClose, onVerify, error, title = 'Manager Override' }: ManagerPinModalProps) {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (error) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }, [error]);

  const handleDigit = useCallback((digit: string) => {
    setPin((prev) => (prev.length < 6 ? prev + digit : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) return;
    setIsVerifying(true);
    try {
      await onVerify(pin);
    } finally {
      setIsVerifying(false);
      setPin('');
    }
  }, [pin, onVerify]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--fnb-z-modal)' } as React.CSSProperties}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={`relative rounded-2xl p-6 w-80 shadow-2xl ${shake ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" style={{ color: 'var(--fnb-status-check-presented)' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-4 w-4 rounded-full border-2"
              style={{
                borderColor: 'rgba(148, 163, 184, 0.3)',
                backgroundColor: i < pin.length ? 'var(--fnb-accent-primary)' : 'transparent',
              }}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-center mb-3" style={{ color: 'var(--fnb-status-dirty)' }}>
            {error}
          </p>
        )}

        {/* Hidden input for keyboard */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          className="absolute opacity-0 pointer-events-none"
        />

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => (
            <button
              key={key || 'empty'}
              type="button"
              onClick={() => {
                if (key === 'del') handleBackspace();
                else if (key) handleDigit(key);
              }}
              disabled={!key || isVerifying}
              className="flex items-center justify-center rounded-lg text-lg font-bold transition-colors hover:opacity-80 disabled:opacity-20"
              style={{
                height: 48,
                backgroundColor: key ? 'var(--fnb-bg-elevated)' : 'transparent',
                color: 'var(--fnb-text-primary)',
              }}
            >
              {key === 'del' ? '⌫' : key}
            </button>
          ))}
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pin.length < 4 || isVerifying}
          className="w-full rounded-lg py-3 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-status-seated)' }}
        >
          {isVerifying ? 'Verifying...' : 'Confirm'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
