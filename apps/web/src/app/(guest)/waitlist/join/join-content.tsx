'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users, Phone, User, Loader2 } from 'lucide-react';

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const SEATING_PREFS = ['Indoor', 'Outdoor', 'Bar', 'Booth'] as const;

interface JoinEstimate {
  estimatedMinutes: number;
  currentQueueLength: number;
}

export default function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locationId = searchParams.get('location') ?? '';

  // ── Form state ────────────────────────────────────
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [customSize, setCustomSize] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [preference, setPreference] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<JoinEstimate | null>(null);
  const [venueName, setVenueName] = useState('');

  // ── Fetch estimate on mount ────────────────────────
  useEffect(() => {
    if (!locationId) return;
    fetch(`/api/v1/guest/waitlist/estimate?locationId=${locationId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setEstimate(json.data);
          if (json.data.venueName) setVenueName(json.data.venueName);
        }
      })
      .catch(() => {});
  }, [locationId]);

  const effectiveSize = showCustom ? parseInt(customSize, 10) || 0 : partySize;

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (effectiveSize < 1) {
      setError('Please select a party size');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/guest/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          guestName: name.trim(),
          guestPhone: phone.trim() || undefined,
          partySize: effectiveSize,
          seatingPreference: preference || undefined,
          source: 'qr_code',
        }),
      });

      if (res.status === 429) {
        setError('Too many requests. Please wait a moment and try again.');
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      const json = await res.json();
      const token = json.data?.token;
      if (token) {
        router.push(`/waitlist/${token}`);
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }, [name, phone, effectiveSize, preference, locationId, router]);

  if (!locationId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6 text-center">
        <p className="text-sm text-muted-foreground">Invalid link. Please scan the QR code again.</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="text-center pt-6 px-6 mb-6">
        {venueName && (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            {venueName}
          </p>
        )}
        <h1 className="text-xl font-bold text-foreground">Join the Waitlist</h1>
        {estimate && (
          <p className="text-sm text-muted-foreground mt-1">
            Current estimated wait: <span className="font-semibold text-indigo-600">~{estimate.estimatedMinutes} min</span>
          </p>
        )}
      </div>

      <div className="px-6 space-y-5">
        {/* Name */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            <User className="h-3.5 w-3.5" />
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            <Phone className="h-3.5 w-3.5" />
            Phone <span className="text-muted-foreground normal-case">(optional)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
          />
        </div>

        {/* Party Size */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            <Users className="h-3.5 w-3.5" />
            Party Size
          </label>
          <div className="flex flex-wrap gap-2">
            {PARTY_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (s === 8) {
                    setShowCustom(true);
                  } else {
                    setPartySize(s);
                    setShowCustom(false);
                  }
                }}
                className={`w-10 h-10 rounded-lg text-sm font-semibold transition-all ${
                  !showCustom && partySize === s
                    ? 'bg-indigo-500 text-white shadow-md'
                    : s === 8 && showCustom
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {s === 8 ? '8+' : s}
              </button>
            ))}
          </div>
          {showCustom && (
            <input
              type="number"
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              placeholder="Enter party size"
              min={8}
              max={99}
              className="mt-2 w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          )}
        </div>

        {/* Seating Preference */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Seating Preference <span className="text-muted-foreground normal-case">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SEATING_PREFS.map((pref) => (
              <button
                key={pref}
                type="button"
                onClick={() => setPreference(preference === pref ? null : pref)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  preference === pref
                    ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/30'
                    : 'bg-muted text-muted-foreground border border-transparent hover:bg-accent'
                }`}
              >
                {pref}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-500">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Joining...
            </span>
          ) : (
            'Join Waitlist'
          )}
        </button>
      </div>
    </div>
  );
}
