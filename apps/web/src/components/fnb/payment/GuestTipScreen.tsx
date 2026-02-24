'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Heart } from 'lucide-react';

/**
 * Guest-facing tip selection screen.
 * Designed for customer-facing displays / tablets.
 * Large touch targets, friendly language, round-up donation option.
 * Inspired by Toast & Square guest-facing UX.
 */

interface GuestTipScreenProps {
  subtotalCents: number;
  businessName?: string;
  serverName?: string;
  /** Optional round-up charity name */
  charityName?: string | null;
  onSelect: (tipCents: number, roundUpCents?: number) => void;
  /** Auto-advance timeout in ms (default 60s for guest) */
  timeoutMs?: number;
}

const GUEST_TIP_TIERS = {
  small: [18, 20, 25],   // < $25
  medium: [18, 20, 22],  // $25–$100
  large: [15, 18, 20],   // > $100
} as const;

function getGuestTipPercentages(subtotalCents: number): readonly number[] {
  if (subtotalCents < 2500) return GUEST_TIP_TIERS.small;
  if (subtotalCents <= 10000) return GUEST_TIP_TIERS.medium;
  return GUEST_TIP_TIERS.large;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function computeRoundUp(totalCents: number): number {
  const nextDollar = Math.ceil(totalCents / 100) * 100;
  const diff = nextDollar - totalCents;
  // If already exact dollar, round up a full dollar
  return diff === 0 ? 100 : diff;
}

export function GuestTipScreen({
  subtotalCents,
  businessName,
  serverName,
  charityName,
  onSelect,
  timeoutMs = 60_000,
}: GuestTipScreenProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [timeoutProgress, setTimeoutProgress] = useState(1);
  const [roundUp, setRoundUp] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  const tipPercentages = getGuestTipPercentages(subtotalCents);
  const roundUpAmount = computeRoundUp(subtotalCents);

  // Auto-advance timeout
  useEffect(() => {
    if (customMode) return;
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 1 - elapsed / timeoutMs);
      setTimeoutProgress(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        onSelect(0);
      }
    }, 250);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [customMode, onSelect, timeoutMs]);

  const handlePercentage = useCallback((pct: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const tipCents = Math.round((subtotalCents * pct) / 100);
    onSelect(tipCents, roundUp ? roundUpAmount : undefined);
  }, [subtotalCents, onSelect, roundUp, roundUpAmount]);

  const handleNoTip = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    onSelect(0, roundUp ? roundUpAmount : undefined);
  }, [onSelect, roundUp, roundUpAmount]);

  const handleCustomSubmit = useCallback(() => {
    if (!customInput) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const tipCents = Math.round(parseFloat(customInput) * 100);
    if (tipCents >= 0) onSelect(tipCents, roundUp ? roundUpAmount : undefined);
  }, [customInput, onSelect, roundUp, roundUpAmount]);

  if (customMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8" style={{ backgroundColor: '#0f172a' }}>
        <h2 className="text-2xl font-bold text-white mb-6">Enter Custom Tip</h2>
        <div className="flex items-center gap-3 mb-8">
          <span className="text-4xl font-bold text-white">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className="w-48 rounded-2xl px-6 py-4 text-4xl font-mono text-center outline-none bg-white/10 text-white"
            autoFocus
          />
        </div>
        <div className="flex gap-4 w-full max-w-sm">
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="flex-1 rounded-2xl py-4 text-lg font-bold text-white/70 bg-white/10 transition-all hover:bg-white/20 active:scale-[0.98]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={!customInput}
            className="flex-1 rounded-2xl py-4 text-lg font-bold text-white bg-green-500 transition-all hover:bg-green-400 active:scale-[0.98] disabled:opacity-40"
          >
            Add Tip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8" style={{ backgroundColor: '#0f172a' }}>
      {/* Greeting */}
      <div className="text-center mb-8">
        {businessName && (
          <p className="text-sm font-medium text-white/50 mb-1">Thank you for visiting</p>
        )}
        <h1 className="text-3xl font-bold text-white">
          {businessName ?? 'Thank You!'}
        </h1>
        {serverName && (
          <p className="text-base text-white/60 mt-2">
            Your server: <span className="font-semibold text-white/80">{serverName}</span>
          </p>
        )}
      </div>

      {/* Total */}
      <div className="mb-8">
        <p className="text-sm text-white/40 text-center mb-1">Your Total</p>
        <p className="text-5xl font-black font-mono text-white text-center">
          {formatMoney(subtotalCents)}
        </p>
      </div>

      {/* Would you like to add a tip? */}
      <p className="text-lg font-semibold text-white/80 mb-6">
        Would you like to leave a tip?
      </p>

      {/* Tip tier buttons — large, friendly */}
      <div className="flex gap-4 w-full max-w-lg mb-6">
        {tipPercentages.map((pct) => {
          const tipCents = Math.round((subtotalCents * pct) / 100);
          return (
            <button
              key={pct}
              type="button"
              onClick={() => handlePercentage(pct)}
              className="flex-1 flex flex-col items-center justify-center rounded-3xl py-6 transition-all hover:scale-[1.03] active:scale-[0.97] border-2 border-white/10 bg-white/5 hover:bg-white/10"
            >
              <span className="text-3xl font-black text-white">{pct}%</span>
              <span className="text-base font-mono text-white/60 mt-1">
                {formatMoney(tipCents)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Secondary actions */}
      <div className="flex gap-3 w-full max-w-lg mb-6">
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          className="flex-1 rounded-2xl py-4 text-base font-bold text-white/70 bg-white/5 border border-white/10 transition-all hover:bg-white/10 active:scale-[0.98]"
        >
          Custom Amount
        </button>
        <button
          type="button"
          onClick={handleNoTip}
          className="flex-1 rounded-2xl py-4 text-base font-bold text-white/40 bg-white/5 border border-white/10 transition-all hover:bg-white/10 active:scale-[0.98]"
        >
          No Tip
        </button>
      </div>

      {/* Round-up donation (optional) */}
      {charityName && (
        <button
          type="button"
          onClick={() => setRoundUp(!roundUp)}
          className={`flex items-center gap-3 w-full max-w-lg rounded-2xl px-6 py-4 border-2 transition-all ${
            roundUp
              ? 'border-pink-400/60 bg-pink-500/10'
              : 'border-white/10 bg-white/5'
          }`}
        >
          <Heart
            className={`h-5 w-5 shrink-0 transition-colors ${roundUp ? 'text-pink-400 fill-pink-400' : 'text-white/40'}`}
          />
          <div className="flex-1 text-left">
            <span className={`text-sm font-semibold ${roundUp ? 'text-pink-300' : 'text-white/60'}`}>
              Round up {formatMoney(roundUpAmount)} for {charityName}
            </span>
          </div>
          <div
            className={`w-12 h-7 rounded-full relative transition-colors ${
              roundUp ? 'bg-pink-500' : 'bg-white/20'
            }`}
          >
            <div
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                roundUp ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </div>
        </button>
      )}

      {/* Timeout progress */}
      <div className="w-full max-w-lg mt-8">
        <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${timeoutProgress * 100}%`,
              backgroundColor: timeoutProgress > 0.2 ? 'rgba(255,255,255,0.2)' : '#f59e0b',
            }}
          />
        </div>
      </div>
    </div>
  );
}
