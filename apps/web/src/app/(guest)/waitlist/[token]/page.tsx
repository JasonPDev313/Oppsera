'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Users, Clock, ChevronRight, LogOut, PartyPopper, AlertCircle } from 'lucide-react';

interface WaitlistStatus {
  id: string;
  guestName: string;
  partySize: number;
  status: 'waiting' | 'notified' | 'seated' | 'cancelled' | 'left' | 'expired' | 'no_show';
  position: number;
  estimatedMinutes: number | null;
  quotedWaitMinutes: number | null;
  joinedAt: string;
  notifiedAt: string | null;
  notificationExpiryMinutes: number;
  venueName: string;
  menuUrl: string | null;
}

async function fetchStatus(token: string, signal?: AbortSignal): Promise<WaitlistStatus | null> {
  try {
    const res = await fetch(`/api/v1/guest/waitlist/${token}`, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

function PositionCircle({ position }: { position: number }) {
  return (
    <div
      className="relative mx-auto w-28 h-28 rounded-full flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
      }}
    >
      <div className="text-center">
        <span className="text-3xl font-black text-white">{position}</span>
        <span className="block text-[10px] font-semibold text-white/70 uppercase tracking-wider">
          in line
        </span>
      </div>
    </div>
  );
}

function WaitProgress({ estimatedMinutes, quotedMinutes }: { estimatedMinutes: number | null; quotedMinutes: number | null }) {
  const total = quotedMinutes ?? estimatedMinutes ?? 30;
  const remaining = estimatedMinutes ?? 0;
  const pct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">Wait estimate</span>
        <span className="font-bold text-foreground">~{remaining} min</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
          }}
        />
      </div>
    </div>
  );
}

function NotifiedBanner({ expiryMinutes, notifiedAt }: { expiryMinutes: number; notifiedAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => {
      const notif = new Date(notifiedAt).getTime();
      const expiry = notif + expiryMinutes * 60_000;
      setRemaining(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [expiryMinutes, notifiedAt]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div
      className="rounded-2xl p-6 text-center mx-4 mt-6"
      style={{
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        animation: 'pulse-bg 2s ease-in-out infinite',
      }}
    >
      <PartyPopper className="mx-auto h-10 w-10 text-white mb-3" />
      <h2 className="text-2xl font-black text-white mb-2">YOUR TABLE IS READY!</h2>
      <p className="text-sm text-white/80 mb-4">Please head to the host stand</p>
      {remaining > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-1.5">
          <Clock className="h-3.5 w-3.5 text-white/90" />
          <span className="text-sm font-bold text-white tabular-nums">
            {mins}:{secs.toString().padStart(2, '0')}
          </span>
          <span className="text-xs text-white/70">remaining</span>
        </div>
      )}
      <style>{`
        @keyframes pulse-bg {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
        }
      `}</style>
    </div>
  );
}

export default function GuestWaitlistStatusPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<WaitlistStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const prevStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchStatus(token);
    if (!result) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    setData(result);
    setLoading(false);
    prevStatus.current = result.status;
  }, [token]);

  // Initial load + polling
  useEffect(() => {
    load();
    const pollMs = data?.status === 'notified' ? 5_000 : 15_000;
    const timer = setInterval(load, pollMs);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load, data?.status]);

  const handleLeave = async () => {
    await fetch(`/api/v1/guest/waitlist/${token}`, {
      method: 'DELETE',
    });
    load();
    setShowLeaveConfirm(false);
  };

  // ── Loading skeleton ─────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-40 mx-auto" />
        <div className="h-28 w-28 bg-muted rounded-full mx-auto" />
        <div className="h-4 bg-muted rounded w-60 mx-auto" />
        <div className="h-2.5 bg-muted rounded" />
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-4 bg-muted rounded w-48" />
        </div>
      </div>
    );
  }

  // ── Invalid token ────────────────────────────────
  if (invalid || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-bold text-foreground mb-2">Link No Longer Valid</h2>
        <p className="text-sm text-muted-foreground">This waitlist link has expired or been removed.</p>
      </div>
    );
  }

  // ── Cancelled / Left / Expired ───────────────────
  if (data.status === 'cancelled' || data.status === 'left' || data.status === 'expired') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <LogOut className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">
          {data.status === 'expired' ? 'Your Spot Expired' : 'Removed from Waitlist'}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {data.status === 'expired'
            ? 'You were notified but didn\'t arrive in time.'
            : 'You\'ve been removed from the waitlist.'}
        </p>
      </div>
    );
  }

  // ── Seated ───────────────────────────────────────
  if (data.status === 'seated') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <PartyPopper className="h-12 w-12 text-green-500 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Enjoy Your Meal!</h2>
        <p className="text-sm text-muted-foreground">Thank you for dining with us, {data.guestName}.</p>
      </div>
    );
  }

  // ── Notified ─────────────────────────────────────
  if (data.status === 'notified' && data.notifiedAt) {
    return (
      <div className="pb-8">
        <div className="text-center pt-6 px-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{data.venueName}</p>
        </div>
        <NotifiedBanner
          expiryMinutes={data.notificationExpiryMinutes}
          notifiedAt={data.notifiedAt}
        />
        <div className="px-6 mt-6">
          <div className="rounded-xl bg-muted p-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{data.guestName}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">Party of {data.partySize}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Waiting (default) ────────────────────────────
  return (
    <div className="pb-8">
      {/* Venue name */}
      <div className="text-center pt-6 px-4 mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{data.venueName}</p>
        <h1 className="text-lg font-bold text-foreground mt-1">You&apos;re on the waitlist</h1>
      </div>

      {/* Position */}
      <PositionCircle position={data.position} />

      {/* Wait progress */}
      <div className="px-6">
        <WaitProgress
          estimatedMinutes={data.estimatedMinutes}
          quotedMinutes={data.quotedWaitMinutes}
        />
      </div>

      {/* Party info */}
      <div className="px-6 mt-6">
        <div className="rounded-xl bg-muted p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{data.guestName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Party of {data.partySize}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              Joined {new Date(data.joinedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* While you wait */}
      {data.menuUrl && (
        <div className="px-6 mt-4">
          <a
            href={data.menuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl bg-indigo-500/10 p-4 transition-colors hover:bg-indigo-500/20"
          >
            <span className="text-sm font-semibold text-indigo-600">Browse Our Menu</span>
            <ChevronRight className="h-4 w-4 text-indigo-400" />
          </a>
        </div>
      )}

      {/* Leave waitlist */}
      <div className="px-6 mt-8 text-center">
        {showLeaveConfirm ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-foreground mb-3">Are you sure you want to leave?</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="text-xs font-semibold rounded-lg px-4 py-2 bg-surface border border-border text-muted-foreground"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={handleLeave}
                className="text-xs font-semibold rounded-lg px-4 py-2 bg-red-500 text-white"
              >
                Leave Waitlist
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            className="text-xs text-muted-foreground underline"
          >
            Leave Waitlist
          </button>
        )}
      </div>
    </div>
  );
}
