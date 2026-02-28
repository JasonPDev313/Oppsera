'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Heart } from 'lucide-react';

interface TipPromptProps {
  subtotalCents: number;
  onSelect: (tipCents: number) => void;
  disabled?: boolean;
}

// Phase 3A: Dynamic tip tiers by check size
const TIP_TIERS = {
  small: [15, 18, 20],   // < $25
  medium: [18, 20, 22],  // $25–$100
  large: [18, 20, 25],   // > $100
} as const;

function getTipPercentages(subtotalCents: number): readonly number[] {
  if (subtotalCents < 2500) return TIP_TIERS.small;
  if (subtotalCents <= 10000) return TIP_TIERS.medium;
  return TIP_TIERS.large;
}

// Phase 3B: Auto-advance timeout (45 seconds)
const TIP_TIMEOUT_MS = 45_000;

export function TipPrompt({ subtotalCents, onSelect, disabled }: TipPromptProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [timeoutProgress, setTimeoutProgress] = useState(1); // 1 = full, 0 = expired
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const isPausedRef = useRef(false);

  const tipPercentages = getTipPercentages(subtotalCents);

  const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // Phase 3B: Countdown timer — auto-selects "No Tip" when expired
  useEffect(() => {
    if (customMode) return; // Pause when custom tip input is focused

    startTimeRef.current = Date.now();
    isPausedRef.current = false;

    timerRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 1 - elapsed / TIP_TIMEOUT_MS);
      setTimeoutProgress(remaining);

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        onSelect(0); // Auto-advance with "No Tip"
      }
    }, 250);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [customMode, onSelect]);

  const handlePercentage = useCallback(
    (pct: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      const tipCents = Math.round((subtotalCents * pct) / 100);
      onSelect(tipCents);
    },
    [subtotalCents, onSelect],
  );

  const handleNoTip = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    onSelect(0);
  }, [onSelect]);

  const handleCustomSubmit = useCallback(() => {
    if (!customInput) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const tipCents = Math.round(parseFloat(customInput) * 100);
    if (tipCents >= 0) onSelect(tipCents);
  }, [customInput, onSelect]);

  if (customMode) {
    return (
      <div className="flex flex-col gap-3 p-3 fnb-fade-scale-in">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--fnb-text-muted)' }}
        >
          Custom Tip
        </span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            $
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className="flex-1 rounded-xl px-3 py-2.5 text-lg font-mono outline-none"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
              fontFamily: 'var(--fnb-font-mono)',
            }}
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="flex-1 rounded-xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={disabled || !customInput}
            className="flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
            style={{ backgroundColor: 'var(--fnb-status-seated)' }}
          >
            Add Tip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 fnb-fade-scale-in">
      {/* Section header */}
      <div className="flex items-center gap-1.5">
        <Heart className="h-3.5 w-3.5" style={{ color: 'var(--fnb-status-seated)' }} />
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--fnb-status-seated)' }}
        >
          Add Gratuity
        </span>
      </div>

      {/* Tip percentage buttons */}
      <div className="flex flex-wrap sm:flex-nowrap gap-2">
        {tipPercentages.map((pct, index) => {
          const tipCents = Math.round((subtotalCents * pct) / 100);
          const isMiddle = index === 1;
          return (
            <button
              key={pct}
              type="button"
              onClick={() => handlePercentage(pct)}
              disabled={disabled}
              className="flex-1 flex flex-col items-center justify-center rounded-xl border py-3.5 transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40"
              style={{
                borderColor: isMiddle
                  ? 'color-mix(in srgb, var(--fnb-status-seated) 40%, transparent)'
                  : 'rgba(148, 163, 184, 0.15)',
                backgroundColor: isMiddle
                  ? 'color-mix(in srgb, var(--fnb-status-seated) 8%, transparent)'
                  : 'var(--fnb-bg-elevated)',
              }}
            >
              <span
                className="text-xl font-bold"
                style={{ color: isMiddle ? 'var(--fnb-status-seated)' : 'var(--fnb-text-primary)' }}
              >
                {pct}%
              </span>
              <span
                className="text-xs font-mono mt-0.5"
                style={{
                  color: 'var(--fnb-text-muted)',
                  fontFamily: 'var(--fnb-font-mono)',
                }}
              >
                {formatMoney(tipCents)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom / No Tip buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          disabled={disabled}
          className="flex-1 rounded-xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          Custom
        </button>
        <button
          type="button"
          onClick={handleNoTip}
          disabled={disabled}
          className="flex-1 rounded-xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-muted)',
          }}
        >
          No Tip
        </button>
      </div>

      {/* Timeout progress bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'rgba(148, 163, 184, 0.1)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${timeoutProgress * 100}%`,
            backgroundColor:
              timeoutProgress > 0.33
                ? 'var(--fnb-text-muted)'
                : 'var(--fnb-warning)',
          }}
        />
      </div>
    </div>
  );
}
