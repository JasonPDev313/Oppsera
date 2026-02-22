'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, X } from 'lucide-react';

export interface ManagerPinModalProps {
  open: boolean;
  onClose: () => void;
  onVerify: (pin: string) => Promise<boolean>;
  error?: string | null;
  title?: string;
}

/**
 * Shared Manager PIN modal — Tailwind-based, no F&B tokens.
 * Used by both Retail and F&B POS modes.
 */
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={`relative z-10 w-80 rounded-2xl bg-surface p-6 shadow-2xl ${shake ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            <h3 className="text-sm font-bold">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-gray-200/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* PIN dots */}
        <div className="mb-4 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 border-gray-300/50 ${
                i < pin.length ? 'bg-indigo-600' : 'bg-transparent'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="mb-3 text-center text-xs text-red-500">{error}</p>
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
          className="pointer-events-none absolute opacity-0"
        />

        {/* Keypad */}
        <div className="mb-3 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => (
            <button
              key={key || 'empty'}
              type="button"
              onClick={() => {
                if (key === 'del') handleBackspace();
                else if (key) handleDigit(key);
              }}
              disabled={!key || isVerifying}
              className={`flex h-12 items-center justify-center rounded-lg text-lg font-bold transition-colors disabled:opacity-20 ${
                key ? 'bg-gray-100/80 hover:bg-gray-200/80' : ''
              }`}
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
          className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          {isVerifying ? 'Verifying...' : 'Confirm'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
