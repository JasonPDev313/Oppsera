'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Users, Clock, ChevronRight, LogOut, PartyPopper, AlertCircle, Navigation } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface WaitlistStatus {
  guestName: string;
  partySize: number;
  status: 'waiting' | 'notified' | 'seated' | 'cancelled' | 'left' | 'expired' | 'no_show';
  position: number;
  estimatedMinutes: number | null;
  quotedWaitMinutes: number | null;
  joinedAt: string;
  notifiedAt: string | null;
  notificationExpiryMinutes: number;
  confirmationStatus: string | null;
  venueName: string;
  menuUrl: string | null;
  branding: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    logoUrl: string | null;
    fontFamily: string;
  };
  content: {
    type: string;
    content: string | null;
    url: string | null;
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['seated', 'cancelled', 'left', 'expired', 'no_show']);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function safeColor(c: string, fallback: string): string {
  return HEX_COLOR_RE.test(c) ? c : fallback;
}

interface FetchResult {
  data: WaitlistStatus | null;
  errorCode: string | null;
}

async function fetchStatus(tenantSlug: string, token: string, signal?: AbortSignal): Promise<FetchResult> {
  try {
    const res = await fetch(`/api/v1/fnb/public/${tenantSlug}/waitlist/status/${token}`, { signal });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      return { data: null, errorCode: json?.error?.code ?? 'UNKNOWN' };
    }
    const json = await res.json();
    return { data: json.data, errorCode: null };
  } catch {
    return { data: null, errorCode: 'NETWORK_ERROR' };
  }
}

// ── Sub-Components ───────────────────────────────────────────────

function PositionCircle({ position, primaryColor, secondaryColor }: { position: number; primaryColor: string; secondaryColor: string }) {
  const pc = safeColor(primaryColor, '#6366f1');
  const sc = safeColor(secondaryColor, '#3b82f6');
  return (
    <div className="relative mx-auto w-28 h-28 rounded-full flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${sc}, ${pc})`, boxShadow: `0 4px 20px ${pc}40` }}>
      <div className="text-center">
        <span className="text-3xl font-black text-white">{position}</span>
        <span className="block text-[10px] font-semibold text-white/70 uppercase tracking-wider">in line</span>
      </div>
    </div>
  );
}

function WaitProgress({ estimatedMinutes, quotedMinutes, primaryColor, secondaryColor }: {
  estimatedMinutes: number | null; quotedMinutes: number | null; primaryColor: string; secondaryColor: string;
}) {
  const total = quotedMinutes ?? estimatedMinutes ?? 30;
  const remaining = estimatedMinutes ?? 0;
  const pct = total > 0 ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100)) : 100;
  const pc = safeColor(primaryColor, '#6366f1');
  const sc = safeColor(secondaryColor, '#3b82f6');

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">Wait estimate</span>
        <span className="font-bold text-foreground">~{remaining} min</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${sc}, ${pc})` }} />
      </div>
    </div>
  );
}

function NotifiedBanner({ expiryMinutes, notifiedAt, accentColor }: { expiryMinutes: number; notifiedAt: string; accentColor: string }) {
  const [remaining, setRemaining] = useState(0);
  // Sanitize color to prevent CSS injection in <style> tag
  const safeAccent = safeColor(accentColor, '#22c55e');

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
    <div className="rounded-2xl p-6 text-center mx-4 mt-6"
      style={{ background: `linear-gradient(135deg, ${safeAccent}, ${safeAccent}dd)`, animation: 'pulse-bg 2s ease-in-out infinite' }}>
      <PartyPopper className="mx-auto h-10 w-10 text-white mb-3" />
      <h2 className="text-2xl font-black text-white mb-2">YOUR TABLE IS READY!</h2>
      <p className="text-sm text-white/80 mb-4">Please head to the host stand</p>
      {remaining > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-1.5">
          <Clock className="h-3.5 w-3.5 text-white/90" />
          <span className="text-sm font-bold text-white tabular-nums">{mins}:{secs.toString().padStart(2, '0')}</span>
          <span className="text-xs text-white/70">remaining</span>
        </div>
      )}
      <style>{`@keyframes pulse-bg { 0%, 100% { box-shadow: 0 0 0 0 ${safeAccent}66; } 50% { box-shadow: 0 0 0 12px ${safeAccent}00; } }`}</style>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function BrandedWaitlistStatusPage() {
  const { tenantSlug, token } = useParams<{ tenantSlug: string; token: string }>();
  const [data, setData] = useState<WaitlistStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveError, setLeaveError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const prevPosition = useRef<number | null>(null);
  const [positionChanged, setPositionChanged] = useState(false);
  const [movedUp, setMovedUp] = useState(false);
  const statusRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  const load = useCallback(async () => {
    const { data: result, errorCode: ec } = await fetchStatus(tenantSlug, token);
    if (!result) { setInvalid(true); setErrorCode(ec); setLoading(false); return; }
    // Detect position change for animation
    if (prevPosition.current !== null && prevPosition.current !== result.position) {
      const didMoveUp = result.position < prevPosition.current;
      setPositionChanged(true);
      setMovedUp(didMoveUp);
      setTimeout(() => { setPositionChanged(false); setMovedUp(false); }, 2000);
    }
    prevPosition.current = result.position;
    statusRef.current = result.status;
    setData(result);
    setLoading(false);

    // Stop polling on terminal states
    if (TERMINAL_STATUSES.has(result.status) && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [tenantSlug, token]);

  // Initial load + adaptive polling (no data?.status in deps to avoid re-render loop)
  useEffect(() => {
    load();
    const getInterval = () => statusRef.current === 'notified' ? 5_000 : 15_000;
    timerRef.current = setInterval(() => {
      load();
    }, getInterval());

    // Re-check interval when status changes
    const intervalChecker = setInterval(() => {
      if (!timerRef.current) return;
      const desired = getInterval();
      // Recreate interval if status changed to notified (need faster polling)
      if (statusRef.current === 'notified' && desired === 5_000) {
        clearInterval(timerRef.current);
        timerRef.current = setInterval(load, 5_000);
      }
    }, 10_000);

    const handleVisibility = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(intervalChecker);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  useEffect(() => {
    if (!data?.joinedAt || TERMINAL_STATUSES.has(data.status)) return;
    const calc = () => setElapsedMinutes(Math.max(0, Math.floor((Date.now() - new Date(data.joinedAt).getTime()) / 60_000)));
    calc();
    const timer = setInterval(calc, 60_000);
    return () => clearInterval(timer);
  }, [data?.joinedAt, data?.status]);

  const handleLeave = async () => {
    setLeaveError(false);
    const res = await fetch(`/api/v1/fnb/public/${tenantSlug}/waitlist/status/${token}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      setLeaveError(true);
      return;
    }
    await load();
    setShowLeaveConfirm(false);
  };

  const handleConfirmArrival = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/v1/fnb/public/${tenantSlug}/waitlist/status/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimatedMinutes: 5 }),
      });
      if (res.ok) setConfirmed(true);
    } catch {
      // Silently fail — not critical
    } finally {
      setConfirming(false);
    }
  };

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-40 mx-auto" />
        <div className="h-28 w-28 bg-muted rounded-full mx-auto" />
        <div className="h-4 bg-muted rounded w-60 mx-auto" />
        <div className="h-2.5 bg-muted rounded" />
      </div>
    );
  }

  if (invalid || !data) {
    const isTenantIssue = errorCode === 'TENANT_NOT_FOUND';
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-bold text-foreground mb-2">
          {isTenantIssue ? 'Waitlist Not Available' : 'Link No Longer Valid'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isTenantIssue
            ? 'This waitlist is not currently active. Please check back later.'
            : 'This waitlist link has expired or been removed.'}
        </p>
        {isTenantIssue && (
          <a href={`/waitlist/${tenantSlug}`}
            className="mt-4 text-sm font-semibold text-indigo-400 hover:text-indigo-300 underline">
            Try joining the waitlist
          </a>
        )}
      </div>
    );
  }

  const b = data.branding;
  const fontStyle = b.fontFamily !== 'system-ui' ? { fontFamily: `"${b.fontFamily}", sans-serif` } : {};

  // ── Terminal States (including no_show) ─────────────────────
  if (data.status === 'cancelled' || data.status === 'left' || data.status === 'expired' || data.status === 'no_show') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center" style={fontStyle}>
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <LogOut className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">
          {data.status === 'expired' || data.status === 'no_show' ? 'Your Spot Expired' : 'Removed from Waitlist'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {data.status === 'expired' || data.status === 'no_show'
            ? "You were notified but didn't arrive in time."
            : "You've been removed from the waitlist."}
        </p>
      </div>
    );
  }

  if (data.status === 'seated') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center" style={fontStyle}>
        <PartyPopper className="h-12 w-12 mb-4" style={{ color: safeColor(b.accentColor, '#22c55e') }} />
        <h2 className="text-xl font-bold text-foreground mb-2">Enjoy Your Meal!</h2>
        <p className="text-sm text-muted-foreground">Thank you for dining with us, {data.guestName}.</p>
      </div>
    );
  }

  // ── Notified ────────────────────────────────────────────────
  if (data.status === 'notified' && data.notifiedAt) {
    const isConfirmed = confirmed || data.confirmationStatus === 'on_my_way';
    return (
      <div className="pb-8" style={fontStyle}>
        {b.logoUrl && <div className="flex justify-center pt-4"><img src={b.logoUrl} alt={data.venueName} className="h-10 max-w-[160px] object-contain" /></div>}
        <div className="text-center pt-4 px-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{data.venueName}</p>
        </div>
        <NotifiedBanner expiryMinutes={data.notificationExpiryMinutes} notifiedAt={data.notifiedAt} accentColor={b.accentColor} />
        <div className="px-6 mt-6 space-y-3">
          <div className="rounded-xl bg-muted p-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{data.guestName}</span>
              <span className="text-muted-foreground">&middot;</span>
              <span className="text-muted-foreground">Party of {data.partySize}</span>
            </div>
          </div>
          {/* On My Way confirmation button */}
          {isConfirmed ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center justify-center gap-2">
              <Navigation className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-500">On my way!</span>
            </div>
          ) : (
            <button type="button" onClick={handleConfirmArrival} disabled={confirming}
              className="w-full rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${safeColor(b.secondaryColor, '#3b82f6')}, ${safeColor(b.primaryColor, '#6366f1')})` }}>
              <Navigation className="h-4 w-4" />
              {confirming ? 'Confirming...' : "I'm On My Way"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Waiting ─────────────────────────────────────────────────
  return (
    <div className="pb-8" style={fontStyle}>
      {b.logoUrl && <div className="flex justify-center pt-4"><img src={b.logoUrl} alt={data.venueName} className="h-10 max-w-[160px] object-contain" /></div>}
      <div className="text-center pt-4 px-4 mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{data.venueName}</p>
        <h1 className="text-lg font-bold text-foreground mt-1">You&apos;re on the waitlist</h1>
      </div>

      <div className="relative">
        <div className={`transition-transform duration-500 ${positionChanged ? 'scale-110' : 'scale-100'}`}>
          <PositionCircle position={data.position} primaryColor={b.primaryColor} secondaryColor={b.secondaryColor} />
        </div>
        {movedUp && (
          <p className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-500 whitespace-nowrap animate-bounce">You moved up!</p>
        )}
      </div>

      <div className="px-6">
        <WaitProgress estimatedMinutes={data.estimatedMinutes} quotedMinutes={data.quotedWaitMinutes} primaryColor={b.primaryColor} secondaryColor={b.secondaryColor} />
      </div>

      <div className="px-6 mt-6">
        <div className="rounded-xl bg-muted p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{data.guestName}</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-muted-foreground">Party of {data.partySize}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              Joined {new Date(data.joinedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              <span className="text-muted-foreground/60 ml-1.5">({elapsedMinutes}m ago)</span>
            </span>
          </div>
        </div>
      </div>

      {/* While You Wait content */}
      {data.content && (
        <div className="px-6 mt-4">
          {data.content.url ? (
            <a href={data.content.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl p-4 transition-colors"
              style={{ backgroundColor: `${safeColor(b.primaryColor, '#6366f1')}10` }}>
              <span className="text-sm font-semibold" style={{ color: safeColor(b.primaryColor, '#6366f1') }}>
                {data.content.type === 'menu_link' ? 'Browse Our Menu' : data.content.type === 'specials' ? 'View Specials' : 'While You Wait'}
              </span>
              <ChevronRight className="h-4 w-4" style={{ color: `${safeColor(b.primaryColor, '#6366f1')}80` }} />
            </a>
          ) : data.content.content ? (
            <div className="rounded-xl p-4" style={{ backgroundColor: `${safeColor(b.primaryColor, '#6366f1')}08` }}>
              <p className="text-sm text-muted-foreground">{data.content.content}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Leave */}
      <div className="px-6 mt-8 text-center">
        {showLeaveConfirm ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-foreground mb-3">Are you sure you want to leave?</p>
            {leaveError && (
              <p className="text-xs text-red-400 mb-2">Something went wrong. Please try again.</p>
            )}
            <div className="flex gap-2 justify-center">
              <button type="button" onClick={() => setShowLeaveConfirm(false)}
                className="text-xs font-semibold rounded-lg px-4 py-2 bg-surface border border-border text-muted-foreground">Stay</button>
              <button type="button" onClick={handleLeave}
                className="text-xs font-semibold rounded-lg px-4 py-2 bg-red-500 text-white">Leave Waitlist</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowLeaveConfirm(true)}
            className="text-xs text-muted-foreground underline">Leave Waitlist</button>
        )}
      </div>
    </div>
  );
}
