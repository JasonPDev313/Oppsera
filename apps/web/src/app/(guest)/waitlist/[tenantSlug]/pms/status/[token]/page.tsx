'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Bed, Calendar, Clock, Check, AlertCircle, X, Loader2 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface PmsWaitlistStatus {
  guestName: string;
  status: 'waiting' | 'offered' | 'booked' | 'canceled' | 'expired' | 'declined';
  positionRange: string | null;
  roomTypeName: string | null;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number | null;
  flexibility: string | null;
  offerExpiresAt: string | null;
  offeredRateCents: number | null;
  propertyName: string;
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
  };
}

// ── Helpers ──────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['booked', 'canceled', 'expired', 'declined']);
const SAFE_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function safeColor(c: string, fallback: string): string {
  return SAFE_COLOR_RE.test(c) ? c : fallback;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function nightCount(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn + 'T00:00:00');
  const b = new Date(checkOut + 'T00:00:00');
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

// ── Sub-Components ───────────────────────────────────────────────

function PositionCircle({ positionRange, primaryColor, secondaryColor }: {
  positionRange: string; primaryColor: string; secondaryColor: string;
}) {
  const pc = safeColor(primaryColor, '#6366f1');
  const sc = safeColor(secondaryColor, '#3b82f6');
  return (
    <div className="relative mx-auto w-28 h-28 rounded-full flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${sc}, ${pc})`, boxShadow: `0 4px 20px ${pc}40` }}>
      <div className="text-center">
        <span className="text-2xl font-black text-white">{positionRange}</span>
        <span className="block text-[10px] font-semibold text-white/70 uppercase tracking-wider">in line</span>
      </div>
    </div>
  );
}

function CountdownTimer({ expiresAt, accentColor }: { expiresAt: string; accentColor: string }) {
  const [remaining, setRemaining] = useState(0);
  const safeAccent = safeColor(accentColor, '#22c55e');

  useEffect(() => {
    const calc = () => {
      const expiry = new Date(expiresAt).getTime();
      setRemaining(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const hours = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;

  if (remaining <= 0) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-4 py-1.5">
        <Clock className="h-3.5 w-3.5 text-red-500" />
        <span className="text-sm font-bold text-red-600">Offer Expired</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5"
      style={{ backgroundColor: `${safeAccent}15`, border: `1px solid ${safeAccent}30` }}>
      <Clock className="h-3.5 w-3.5" style={{ color: safeAccent }} />
      <span className="text-sm font-bold tabular-nums" style={{ color: safeAccent }}>
        {hours > 0 ? `${hours}:` : ''}{mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
      </span>
      <span className="text-xs text-gray-500">to respond</span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function PmsWaitlistStatusPage() {
  const { tenantSlug, token } = useParams<{ tenantSlug: string; token: string }>();

  const [data, setData] = useState<PmsWaitlistStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const statusRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/pms/public/${tenantSlug}/waitlist/status/${token}`);
      if (!res.ok) {
        setInvalid(true);
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (!json.data) {
        setInvalid(true);
        setLoading(false);
        return;
      }
      const result = json.data as PmsWaitlistStatus;
      statusRef.current = result.status;
      setData(result);
      setLoading(false);

      // Stop polling on terminal states
      if (TERMINAL_STATUSES.has(result.status) && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch {
      setInvalid(true);
      setLoading(false);
    }
  }, [tenantSlug, token]);

  // Update browser tab title with property name
  useEffect(() => {
    if (data?.propertyName) {
      document.title = `${data.propertyName} Waitlist`;
    }
  }, [data?.propertyName]);

  // Adaptive polling: 15s waiting, 5s offered, stop on terminal
  useEffect(() => {
    load();

    const getInterval = () => statusRef.current === 'offered' ? 5_000 : 15_000;

    timerRef.current = setInterval(() => {
      load();
    }, getInterval());

    // Re-check interval when status changes
    const intervalChecker = setInterval(() => {
      if (!timerRef.current) return;
      const desired = getInterval();
      if (statusRef.current === 'offered' && desired === 5_000) {
        clearInterval(timerRef.current);
        timerRef.current = setInterval(load, 5_000);
      }
    }, 10_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(intervalChecker);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  const handleAction = async (action: 'accept' | 'decline') => {
    setActionError(null);
    setActionLoading(action);
    try {
      const res = await fetch(`/api/v1/pms/public/${tenantSlug}/waitlist/status/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setActionError(json?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }
      await load();
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeave = async () => {
    setActionError(null);
    setActionLoading('leave');
    try {
      const res = await fetch(`/api/v1/pms/public/${tenantSlug}/waitlist/status/${token}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        setActionError('Something went wrong. Please try again.');
        return;
      }
      await load();
      setShowLeaveConfirm(false);
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-40 mx-auto" />
        <div className="h-28 w-28 bg-gray-200 rounded-full mx-auto" />
        <div className="h-4 bg-gray-200 rounded w-60 mx-auto" />
        <div className="h-16 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (invalid || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-2">Link No Longer Valid</h2>
        <p className="text-sm text-gray-500">This waitlist link has expired or been removed.</p>
        <a href={`/waitlist/${tenantSlug}/pms`}
          className="mt-4 text-sm font-semibold underline" style={{ color: '#6366f1' }}>
          Join the waitlist
        </a>
      </div>
    );
  }

  const rawB = data.branding;
  const b = {
    ...rawB,
    primaryColor: safeColor(rawB.primaryColor, '#6366f1'),
    secondaryColor: safeColor(rawB.secondaryColor, '#8b5cf6'),
    accentColor: safeColor(rawB.accentColor, '#22c55e'),
    fontFamily: rawB.fontFamily.replace(/[^A-Za-z0-9 _+-]/g, ''),
  };
  const pc = b.primaryColor;
  const sc = b.secondaryColor;
  const fontStyle: React.CSSProperties = b.fontFamily !== 'system-ui' ? { fontFamily: `"${b.fontFamily}", sans-serif` } : {};

  // Summary card shared across states
  const summaryCard = (
    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2">
      {data.roomTypeName && (
        <div className="flex items-center gap-2 text-sm">
          <Bed className="h-4 w-4 text-gray-400" />
          <span className="text-gray-700">{data.roomTypeName}</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <Calendar className="h-4 w-4 text-gray-400" />
        <span className="text-gray-700">
          {formatDate(data.checkInDate)} &ndash; {formatDate(data.checkOutDate)}
          <span className="text-gray-400 ml-1">({nightCount(data.checkInDate, data.checkOutDate)} {nightCount(data.checkInDate, data.checkOutDate) === 1 ? 'night' : 'nights'})</span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <span className="text-gray-400 text-xs ml-6">
          {data.adults} {data.adults === 1 ? 'adult' : 'adults'}
          {data.children ? `, ${data.children} ${data.children === 1 ? 'child' : 'children'}` : ''}
        </span>
      </div>
    </div>
  );

  // ── Booked (Terminal - Success) ────────────────────────────
  if (data.status === 'booked') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center" style={fontStyle}>
        <style>{`@keyframes pms-bk { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.15); } 70% { transform: scale(0.95); } 100% { transform: scale(1); opacity: 1; } } .pms-booked-pop { animation: pms-bk 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }`}</style>
        <div className="pms-booked-pop">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: `linear-gradient(135deg, ${sc}, ${pc})`, boxShadow: `0 8px 24px ${pc}40` }}>
            <Check className="h-10 w-10 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Booking Confirmed!</h2>
        <p className="text-sm text-gray-500 mb-6">Your reservation is all set, {data.guestName}.</p>
        <div className="w-full max-w-sm">{summaryCard}</div>
      </div>
    );
  }

  // ── Canceled / Expired / Declined (Terminal) ───────────────
  if (data.status === 'canceled' || data.status === 'expired' || data.status === 'declined') {
    const label = data.status === 'expired' ? 'expired' : data.status === 'declined' ? 'declined' : 'canceled';
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center" style={fontStyle}>
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <X className="h-7 w-7 text-gray-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          Your waitlist entry has been {label}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {data.status === 'expired'
            ? 'The offer expired before it was accepted.'
            : data.status === 'declined'
            ? 'You declined the room offer.'
            : 'You have been removed from the waitlist.'}
        </p>
        <a href={`/waitlist/${tenantSlug}/pms`}
          className="text-sm font-semibold rounded-xl px-6 py-2.5 text-white transition-all active:scale-[0.98]"
          style={{ background: `linear-gradient(135deg, ${sc}, ${pc})` }}>
          Rejoin Waitlist
        </a>
      </div>
    );
  }

  // ── Offered ────────────────────────────────────────────────
  if (data.status === 'offered') {
    const safeAccent = safeColor(b.accentColor, '#22c55e');
    return (
      <div className="pb-8" style={fontStyle}>
        <style>{`@keyframes pms-offer-pulse { 0%, 100% { box-shadow: 0 0 0 0 ${safeAccent}40; } 50% { box-shadow: 0 0 0 12px ${safeAccent}00; } } .pms-offer-ring { animation: pms-offer-pulse 2s ease-in-out infinite; }`}</style>

        {b.logoUrl && /^https:\/\//.test(b.logoUrl) && (
          <div className="flex justify-center pt-4">
            <img src={b.logoUrl} alt={data.propertyName} className="h-10 max-w-[160px] object-contain" />
          </div>
        )}

        <div className="text-center pt-4 px-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{data.propertyName}</p>
        </div>

        {/* Celebration banner */}
        <div className="mx-4 mt-6 rounded-2xl p-6 text-center pms-offer-ring"
          style={{ background: `linear-gradient(135deg, ${safeAccent}, ${safeAccent}dd)` }}>
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-2xl font-black text-white mb-2">Your Room is Available!</h2>
          <p className="text-sm text-white/80 mb-4">Great news, {data.guestName}!</p>
          {data.offerExpiresAt && (
            <CountdownTimer expiresAt={data.offerExpiresAt} accentColor="#ffffff" />
          )}
        </div>

        <div className="px-6 mt-6 space-y-4">
          {/* Offer details */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
            {data.roomTypeName && (
              <div className="flex items-center gap-2 text-sm">
                <Bed className="h-4 w-4 text-gray-400" />
                <span className="font-semibold text-gray-900">{data.roomTypeName}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">
                {formatDate(data.checkInDate)} &ndash; {formatDate(data.checkOutDate)}
              </span>
            </div>
            {data.offeredRateCents != null && (
              <div className="flex items-center gap-2 text-sm">
                <span className="ml-6 text-lg font-bold text-gray-900">
                  ${(data.offeredRateCents / 100).toFixed(2)}
                  <span className="text-xs font-normal text-gray-500">/night</span>
                </span>
              </div>
            )}
          </div>

          {/* Action error */}
          {actionError && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <span className="text-xs text-red-700">{actionError}</span>
            </div>
          )}

          {/* Accept / Decline buttons */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleAction('accept')}
              disabled={actionLoading !== null}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${safeAccent}dd, ${safeAccent})` }}
            >
              {actionLoading === 'accept' ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Accepting...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Check className="h-4 w-4" /> Accept Offer
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleAction('decline')}
              disabled={actionLoading !== null}
              className="w-full rounded-xl py-3 text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {actionLoading === 'decline' ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Declining...
                </span>
              ) : 'Decline'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Waiting (Default) ──────────────────────────────────────
  return (
    <div className="pb-8" style={fontStyle}>
      {b.logoUrl && /^https:\/\//.test(b.logoUrl) && (
        <div className="flex justify-center pt-4">
          <img src={b.logoUrl} alt={data.propertyName} className="h-10 max-w-[160px] object-contain" />
        </div>
      )}

      <div className="text-center pt-4 px-4 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{data.propertyName}</p>
        <h1 className="text-lg font-bold text-gray-900 mt-1">You&apos;re on the Waitlist</h1>
      </div>

      {/* Position circle */}
      {data.positionRange && (
        <PositionCircle positionRange={data.positionRange} primaryColor={pc} secondaryColor={sc} />
      )}

      <p className="text-center text-sm text-gray-500 mt-3">
        You are in position <span className="font-bold text-gray-900">{data.positionRange ?? '—'}</span>
      </p>

      {/* Summary */}
      <div className="px-6 mt-6">
        {summaryCard}
      </div>

      {/* Leave Waitlist */}
      <div className="px-6 mt-8 text-center">
        {showLeaveConfirm ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-gray-900 mb-3">Are you sure you want to leave the waitlist?</p>
            {actionError && (
              <p className="text-xs text-red-600 mb-2">{actionError}</p>
            )}
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => { setShowLeaveConfirm(false); setActionError(null); }}
                className="text-xs font-semibold rounded-lg px-4 py-2 bg-white border border-gray-200 text-gray-600"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={handleLeave}
                disabled={actionLoading === 'leave'}
                className="text-xs font-semibold rounded-lg px-4 py-2 bg-red-500 text-white disabled:opacity-50"
              >
                {actionLoading === 'leave' ? 'Leaving...' : 'Leave Waitlist'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="text-xs text-gray-400 underline hover:text-gray-600 transition-colors"
          >
            Leave Waitlist
          </button>
        )}
      </div>
    </div>
  );
}
