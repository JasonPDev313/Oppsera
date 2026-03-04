'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Clock, AlertCircle, Check } from 'lucide-react';

/**
 * Embeddable waitlist widget — designed to be loaded in an iframe on the operator's website.
 * Compact version of the join form with source='widget'.
 * Communicates back to parent via postMessage on successful join.
 */

interface WidgetConfig {
  venueName: string;
  branding: { primaryColor: string; secondaryColor: string };
  form: { minPartySize: number; maxPartySize: number; requirePhone: boolean };
  allowCheckWait: boolean;
}

interface WaitEstimate {
  estimatedMinutes: number;
  queueLength: number;
  accepting: boolean;
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
function safe(c: string, fb: string) { return HEX_RE.test(c) ? c : fb; }

export default function WidgetContent() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [estimate, setEstimate] = useState<WaitEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!tenantSlug) return;
    const base = `/api/v1/fnb/public/${tenantSlug}/waitlist`;
    Promise.all([
      fetch(`${base}/config`).then((r) => r.ok ? r.json() : null),
      fetch(`${base}/estimate`).then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([c, e]) => {
      if (!c?.data) { setNotFound(true); setLoading(false); return; }
      setConfig(c.data);
      if (e?.data) setEstimate(e.data);
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });
  }, [tenantSlug]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!name.trim()) { setError('Name is required'); return; }
    if (config?.form.requirePhone && !phone.trim()) { setError('Phone is required'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/fnb/public/${tenantSlug}/waitlist/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: name.trim(),
          guestPhone: phone.trim() || undefined,
          partySize,
          source: 'widget',
        }),
      });

      if (res.status === 429) { setError('Too many requests'); return; }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? 'Something went wrong');
        return;
      }

      const json = await res.json();
      if (json.data?.duplicate) {
        setError('You are already on the waitlist.');
        return;
      }

      const token = json.data?.token;
      if (token) {
        setSuccess(true);
        // Notify parent iframe
        try { window.parent.postMessage({ type: 'waitlist-joined', token, position: json.data.position }, '*'); } catch { /* no parent */ }
        // Redirect to status page
        setTimeout(() => router.push(`/waitlist/${tenantSlug}/status/${token}`), 1500);
      } else {
        setError('Something went wrong');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }, [name, phone, partySize, tenantSlug, router, config]);

  if (loading) {
    return (
      <div className="p-4 space-y-3 max-w-sm mx-auto animate-pulse">
        <div className="h-3 bg-muted rounded w-28 mx-auto" />
        <div className="h-3 bg-muted rounded w-16 mx-auto mt-1" />
        <div className="h-10 bg-muted rounded-lg mt-3" />
        <div className="h-10 bg-muted rounded-lg" />
        <div className="flex gap-1.5">{Array.from({ length: 6 }).map((_, i) => (<div key={i} className="flex-1 h-9 rounded-lg bg-muted" />))}</div>
        <div className="h-10 bg-muted rounded-lg" />
      </div>
    );
  }

  if (notFound || !config) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Waitlist not available</p>
      </div>
    );
  }

  if (estimate && !estimate.accepting) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
        <Users className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Waitlist is full</p>
      </div>
    );
  }

  const pc = safe(config.branding.primaryColor, '#6366f1');
  const sc = safe(config.branding.secondaryColor, '#8b5cf6');

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
        <style>{`@keyframes widget-pop { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }`}</style>
        <div style={{ animation: 'widget-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: `linear-gradient(135deg, ${sc}, ${pc})`, boxShadow: `0 4px 16px ${pc}30` }}>
            <Check className="h-7 w-7 text-white" />
          </div>
        </div>
        <p className="text-sm font-semibold text-foreground">You&apos;re on the list!</p>
        <p className="text-xs text-muted-foreground mt-1 animate-pulse">Redirecting to your status page...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 max-w-sm mx-auto">
      <div className="text-center">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{config.venueName}</p>
        {estimate && config.allowCheckWait && (
          <div className="inline-flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3" style={{ color: pc }} />
            <span className="text-xs font-semibold" style={{ color: pc }}>~{estimate.estimatedMinutes} min</span>
          </div>
        )}
      </div>

      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
        style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties} />

      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
        placeholder={config.form.requirePhone ? 'Phone (required)' : 'Phone (optional)'}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
        style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties} />

      <div className="flex gap-1.5">
        {Array.from({ length: Math.min(config.form.maxPartySize, 6) }, (_, i) => i + config.form.minPartySize).map((s) => (
          <button key={s} type="button" onClick={() => setPartySize(s)}
            className="flex-1 h-9 rounded-lg text-xs font-bold transition-all"
            style={{ backgroundColor: partySize === s ? pc : undefined, color: partySize === s ? '#fff' : undefined }}>
            {s}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button type="button" onClick={handleSubmit} disabled={submitting}
        className="w-full rounded-lg py-2.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${sc}, ${pc})` }}>
        {submitting ? 'Joining...' : 'Join Waitlist'}
      </button>
    </div>
  );
}
