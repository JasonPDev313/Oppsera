'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Delete } from 'lucide-react';

interface InlinePinPadProps {
  onVerify: (pin: string) => Promise<boolean>;
  onBack: () => void;
  error: string | null;
  title: string;
}

export function InlinePinPad({ onVerify, onBack, error, title }: InlinePinPadProps) {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

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
      const ok = await onVerify(pin);
      if (!ok) setPin('');
    } finally {
      setIsVerifying(false);
    }
  }, [pin, onVerify]);

  return (
    <div className={`flex flex-col gap-4 ${shake ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Lock className="h-6 w-6" style={{ color: 'var(--fnb-status-check-presented)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          {title}
        </h2>
      </div>

      {/* PIN dots */}
      <div className="flex justify-center gap-4 py-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-5 w-5 rounded-full border-2 transition-colors"
            style={{
              borderColor: 'rgba(148, 163, 184, 0.3)',
              backgroundColor: i < pin.length ? 'var(--fnb-accent-primary)' : 'transparent',
            }}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-center" style={{ color: 'var(--fnb-status-dirty)' }}>
          {error}
        </p>
      )}

      {/* Keyboard input */}
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Type PIN..."
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
        }}
        className="w-full rounded-lg px-4 py-3 text-center text-lg font-mono tracking-[0.5em] outline-none"
        style={{
          background: 'var(--fnb-bg-primary)',
          color: 'var(--fnb-text-primary)',
          border: '1px solid var(--fnb-border-subtle)',
        }}
      />

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => (
          <button
            key={key || 'empty'}
            type="button"
            onClick={() => {
              if (key === 'del') handleBackspace();
              else if (key) handleDigit(key);
              inputRef.current?.focus();
            }}
            disabled={!key || isVerifying}
            className="flex items-center justify-center rounded-xl text-xl font-bold transition-colors hover:opacity-80 active:scale-95 disabled:opacity-20"
            style={{
              height: 64,
              backgroundColor: key ? 'var(--fnb-bg-elevated)' : 'transparent',
              color: 'var(--fnb-text-primary)',
            }}
          >
            {key === 'del' ? <Delete className="h-6 w-6" /> : key}
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
          disabled={pin.length < 4 || isVerifying}
          className="flex-1 px-4 py-3 rounded-lg text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--fnb-status-seated)' }}
        >
          {isVerifying ? 'Verifying...' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
