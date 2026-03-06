'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Phone, User, Loader2, ChevronDown, ChevronUp, Clock, AlertCircle, MapPin, Check } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface WaitlistPublicConfig {
  venueName: string;
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    welcomeHeadline: string;
    welcomeSubtitle: string;
    footerText: string | null;
  };
  form: {
    minPartySize: number;
    maxPartySize: number;
    requirePhone: boolean;
    enableSeatingPreference: boolean;
    seatingOptions: string[];
    enableOccasion: boolean;
    occasionOptions: string[];
    enableNotes: boolean;
    notesMaxLength: number;
    customFields: { label: string; type: string; required: boolean; options?: string[] }[];
    termsText: string | null;
  };
  content: {
    whileYouWaitEnabled: boolean;
    whileYouWaitType: string;
    whileYouWaitContent: string | null;
    whileYouWaitUrl: string | null;
  };
  allowCheckWait: boolean;
}

interface WaitEstimate {
  estimatedMinutes: number;
  queueLength: number;
  accepting: boolean;
}

interface WaitlistLocation {
  locationId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  slug: string;
}

// ── Helpers ──────────────────────────────────────────────────────

const SAFE_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
function safeColor(c: string, fallback: string): string {
  return SAFE_COLOR_RE.test(c) ? c : fallback;
}

// ── Component ────────────────────────────────────────────────────

export default function WaitlistJoinContent() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();

  // Multi-location
  const [locations, setLocations] = useState<WaitlistLocation[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const activeSlug = selectedSlug ?? tenantSlug;

  // Data
  const [config, setConfig] = useState<WaitlistPublicConfig | null>(null);
  const [estimate, setEstimate] = useState<WaitEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [customSize, setCustomSize] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [preference, setPreference] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [showOptional, setShowOptional] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<{ position: number; estimatedMinutes: number | null; guestName: string } | null>(null);

  // Fetch locations on mount (multi-location support)
  useEffect(() => {
    if (!tenantSlug) return;
    fetch(`/api/v1/fnb/public/${tenantSlug}/waitlist/locations`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.data?.locations?.length > 1) {
          setLocations(json.data.locations);
        }
      })
      .catch(() => { /* multi-location is optional */ });
  }, [tenantSlug]);

  // Fetch config + estimate on mount (or when location changes)
  useEffect(() => {
    if (!activeSlug) return;
    setLoading(true);
    setConfig(null);
    setEstimate(null);
    const base = `/api/v1/fnb/public/${activeSlug}/waitlist`;

    let wasRateLimited = false;
    Promise.all([
      fetch(`${base}/config`).then((r) => {
        if (r.status === 429) { wasRateLimited = true; setRateLimited(true); return null; }
        return r.ok ? r.json() : null;
      }),
      fetch(`${base}/estimate`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([configJson, estimateJson]) => {
      if (!configJson?.data) {
        if (!wasRateLimited) setNotFound(true);
        setLoading(false);
        return;
      }
      setConfig(configJson.data);
      if (estimateJson?.data) setEstimate(estimateJson.data);
      setLoading(false);
    }).catch(() => {
      setNotFound(true);
      setLoading(false);
    });
  }, [activeSlug]);

  const effectiveSize = showCustom ? parseInt(customSize, 10) || 0 : partySize;

  const handleSubmit = useCallback(async () => {
    setError(null);
    setDuplicateMessage(null);
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (config?.form.requirePhone && !phone.trim()) { setError('Please enter your phone number'); return; }
    if (effectiveSize < (config?.form.minPartySize ?? 1)) { setError(`Party size must be at least ${config?.form.minPartySize ?? 1}`); return; }

    // Validate required custom fields
    if (config?.form.customFields) {
      for (const field of config.form.customFields) {
        if (field.required && !customFieldValues[field.label]?.trim()) {
          setError(`${field.label} is required`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/fnb/public/${activeSlug}/waitlist/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: name.trim(),
          guestPhone: phone.trim() || undefined,
          partySize: effectiveSize,
          seatingPreference: preference || undefined,
          occasion: occasion || undefined,
          notes: notes.trim() || undefined,
          customFieldValues: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
          source: 'online',
        }),
      });

      if (res.status === 429) { setError('Too many requests. Please wait and try again.'); return; }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      const json = await res.json();

      // Handle duplicate (phone already on waitlist — no token returned)
      if (json.data?.duplicate) {
        setDuplicateMessage(json.data.message ?? 'You are already on the waitlist.');
        return;
      }

      const token = json.data?.token;
      if (token) {
        setJoinSuccess({
          position: json.data.position ?? 1,
          estimatedMinutes: json.data.estimatedMinutes ?? null,
          guestName: name.trim(),
        });
        setTimeout(() => router.push(`/waitlist/${activeSlug}/status/${token}`), 2500);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }, [name, phone, effectiveSize, preference, occasion, notes, customFieldValues, activeSlug, router, config]);

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-48 mx-auto" />
        <div className="h-4 bg-muted rounded w-64 mx-auto" />
        <div className="space-y-4 pt-4">
          <div className="h-12 bg-muted rounded-xl" />
          <div className="h-12 bg-muted rounded-xl" />
          <div className="flex gap-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-10 w-10 bg-muted rounded-lg" />)}</div>
          <div className="h-14 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  // ── Rate Limited ───────────────────────────────────────────
  if (rateLimited) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-bold text-foreground mb-2">Too Many Requests</h2>
        <p className="text-sm text-muted-foreground">Please wait a moment and refresh the page.</p>
      </div>
    );
  }

  // ── Not Found ───────────────────────────────────────────────
  if (notFound || !config) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-bold text-foreground mb-2">Waitlist Not Available</h2>
        <p className="text-sm text-muted-foreground">This waitlist is not currently active. Please check back later.</p>
      </div>
    );
  }

  // ── Full / Not Accepting ────────────────────────────────────
  if (estimate && !estimate.accepting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-bold text-foreground mb-2">Waitlist is Full</h2>
        <p className="text-sm text-muted-foreground">We&apos;re at capacity right now. Please check back in a few minutes.</p>
      </div>
    );
  }

  const rawB = config.branding;
  const b = {
    ...rawB,
    primaryColor: safeColor(rawB.primaryColor, '#6366f1'),
    secondaryColor: safeColor(rawB.secondaryColor, '#8b5cf6'),
    accentColor: safeColor(rawB.accentColor, '#f59e0b'),
    fontFamily: rawB.fontFamily.replace(/[^A-Za-z0-9 _+-]/g, ''),
  };
  const pc = b.primaryColor;
  const sc = b.secondaryColor;

  // ── Success Celebration ──────────────────────────────────────
  if (joinSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <style>{`@keyframes fnb-sp { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.15); } 70% { transform: scale(0.95); } 100% { transform: scale(1); opacity: 1; } } .fnb-success-pop { animation: fnb-sp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }`}</style>
        <div className="fnb-success-pop">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: `linear-gradient(135deg, ${sc}, ${pc})`, boxShadow: `0 8px 24px ${pc}40` }}>
            <Check className="h-10 w-10 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-foreground mb-1">You&apos;re #{joinSuccess.position} in line!</h2>
        {joinSuccess.estimatedMinutes != null && (
          <p className="text-sm text-muted-foreground mb-1">Estimated wait: ~{joinSuccess.estimatedMinutes} min</p>
        )}
        <p className="text-xs text-muted-foreground mt-3 animate-pulse">Taking you to your status page...</p>
      </div>
    );
  }
  const f = config.form;
  const partySizeButtons: number[] = [];
  for (let i = f.minPartySize; i <= Math.min(f.maxPartySize, 7); i++) partySizeButtons.push(i);
  const showCustomButton = f.maxPartySize > 7;

  const hasOptionalFields = f.enableOccasion || f.enableNotes || f.customFields.length > 0;

  return (
    <div className="pb-8" style={{ fontFamily: b.fontFamily !== 'system-ui' ? `"${b.fontFamily}", sans-serif` : 'system-ui' }}>
      {/* Multi-Location Picker */}
      {locations.length > 1 && (
        <div className="px-6 pt-4">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            <MapPin className="h-3.5 w-3.5" /> Location
          </label>
          <div className="flex flex-wrap gap-2">
            {locations.map((loc) => {
              const isActive = loc.slug === activeSlug;
              return (
                <button key={loc.locationId} type="button"
                  onClick={() => setSelectedSlug(loc.slug)}
                  className="rounded-full px-4 py-2 text-xs font-semibold transition-all border"
                  style={{
                    backgroundColor: isActive ? `${b.primaryColor}15` : undefined,
                    color: isActive ? b.primaryColor : undefined,
                    borderColor: isActive ? `${b.primaryColor}40` : 'transparent',
                  }}>
                  {loc.name}
                  {loc.city && <span className="text-muted-foreground ml-1">({loc.city})</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Logo */}
      {b.logoUrl && /^https:\/\//.test(b.logoUrl) && (
        <div className="flex justify-center pt-6">
          <img src={b.logoUrl} alt={config.venueName} className="h-12 max-w-[200px] object-contain" />
        </div>
      )}

      {/* Header */}
      <div className="text-center pt-4 px-6 mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{config.venueName}</p>
        <h1 className="text-xl font-bold text-foreground">{b.welcomeHeadline}</h1>
        <p className="text-sm text-muted-foreground mt-1">{b.welcomeSubtitle}</p>
        {estimate && config.allowCheckWait && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5" style={{ backgroundColor: `${b.primaryColor}15` }}>
            <Clock className="h-3.5 w-3.5" style={{ color: b.primaryColor }} />
            <span className="text-sm font-semibold" style={{ color: b.primaryColor }}>~{estimate.estimatedMinutes} min wait</span>
            <span className="text-xs text-muted-foreground">({estimate.queueLength} in line)</span>
          </div>
        )}
      </div>

      <div className="px-6 space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="waitlist-name" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            <User className="h-3.5 w-3.5" /> Name
          </label>
          <input id="waitlist-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': `${b.primaryColor}40` } as React.CSSProperties} />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="waitlist-phone" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            <Phone className="h-3.5 w-3.5" /> Phone {!f.requirePhone && <span className="text-muted-foreground normal-case">(optional)</span>}
          </label>
          <input id="waitlist-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567"
            className="w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': `${b.primaryColor}40` } as React.CSSProperties} />
        </div>

        {/* Party Size */}
        <div>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            <Users className="h-3.5 w-3.5" /> Party Size
          </label>
          <div className="flex flex-wrap gap-2">
            {partySizeButtons.map((s) => (
              <button key={s} type="button"
                onClick={() => { setPartySize(s); setShowCustom(false); }}
                className="w-10 h-10 rounded-lg text-sm font-semibold transition-all"
                style={{
                  backgroundColor: !showCustom && partySize === s ? b.primaryColor : 'rgba(148, 163, 184, 0.1)',
                  color: !showCustom && partySize === s ? '#fff' : undefined,
                  border: !showCustom && partySize === s ? 'none' : '1px solid rgba(148, 163, 184, 0.15)',
                }}
              >{s}</button>
            ))}
            {showCustomButton && (
              <button type="button" onClick={() => setShowCustom(true)}
                className="w-10 h-10 rounded-lg text-sm font-semibold transition-all"
                style={{
                  backgroundColor: showCustom ? b.primaryColor : 'rgba(148, 163, 184, 0.1)',
                  color: showCustom ? '#fff' : undefined,
                  border: showCustom ? 'none' : '1px solid rgba(148, 163, 184, 0.15)',
                }}
              >{Math.min(f.maxPartySize, 8)}+</button>
            )}
          </div>
          {showCustom && (
            <input type="number" value={customSize} onChange={(e) => setCustomSize(e.target.value)}
              placeholder={`Enter party size (${Math.min(f.maxPartySize, 8)}-${f.maxPartySize})`}
              min={Math.min(f.maxPartySize, 8)} max={f.maxPartySize}
              className="mt-2 w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': `${b.primaryColor}40` } as React.CSSProperties} />
          )}
        </div>

        {/* Seating Preference */}
        {f.enableSeatingPreference && f.seatingOptions.length > 0 && (
          <div>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Seating Preference <span className="text-muted-foreground normal-case">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {f.seatingOptions.map((pref) => (
                <button key={pref} type="button" onClick={() => setPreference(preference === pref ? null : pref)}
                  className="rounded-full px-4 py-2 text-xs font-semibold transition-all border"
                  style={{
                    backgroundColor: preference === pref ? `${b.primaryColor}15` : 'rgba(148, 163, 184, 0.1)',
                    color: preference === pref ? b.primaryColor : undefined,
                    borderColor: preference === pref ? `${b.primaryColor}40` : 'rgba(148, 163, 184, 0.15)',
                  }}
                >{pref}</button>
              ))}
            </div>
          </div>
        )}

        {/* Optional Fields Toggle */}
        {hasOptionalFields && (
          <button type="button" onClick={() => setShowOptional(!showOptional)}
            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
            {showOptional ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showOptional ? 'Hide' : 'More'} options
          </button>
        )}

        {showOptional && (
          <div className="space-y-4">
            {/* Occasion */}
            {f.enableOccasion && f.occasionOptions.length > 0 && (
              <div>
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Occasion</label>
                <div className="flex flex-wrap gap-2">
                  {f.occasionOptions.map((occ) => (
                    <button key={occ} type="button" onClick={() => setOccasion(occasion === occ ? null : occ)}
                      className="rounded-full px-4 py-2 text-xs font-semibold transition-all border"
                      style={{
                        backgroundColor: occasion === occ ? `${b.primaryColor}15` : 'rgba(148, 163, 184, 0.1)',
                        color: occasion === occ ? b.primaryColor : undefined,
                        borderColor: occasion === occ ? `${b.primaryColor}40` : 'rgba(148, 163, 184, 0.15)',
                      }}
                    >{occ}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {f.enableNotes && (
              <div>
                <label htmlFor="waitlist-notes" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Notes</label>
                <textarea id="waitlist-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special requests or dietary needs?"
                  maxLength={f.notesMaxLength}
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent resize-none h-20"
                  style={{ '--tw-ring-color': `${b.primaryColor}40` } as React.CSSProperties} />
              </div>
            )}

            {/* Custom Fields */}
            {f.customFields.map((field) => (
              <div key={field.label}>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  {field.label} {!field.required && <span className="normal-case">(optional)</span>}
                </label>
                {field.type === 'select' && field.options ? (
                  <select value={customFieldValues[field.label] ?? ''} onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.label]: e.target.value }))}
                    className="w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ '--tw-ring-color': `${b.primaryColor}40` } as React.CSSProperties}>
                    <option value="">Select...</option>
                    {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input type={field.type === 'number' ? 'number' : 'text'}
                    value={customFieldValues[field.label] ?? ''} onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.label]: e.target.value }))}
                    className="w-full rounded-xl border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ '--tw-ring-color': `${b.primaryColor}40` } as React.CSSProperties} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Terms */}
        {f.termsText && (
          <p className="text-xs text-muted-foreground">{f.termsText}</p>
        )}

        {/* Duplicate Message */}
        {duplicateMessage && (
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-400">{duplicateMessage}</div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-500">{error}</div>
        )}

        {/* Submit */}
        <button type="button" onClick={handleSubmit} disabled={submitting || !!duplicateMessage}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${b.secondaryColor}, ${b.primaryColor})` }}>
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Joining...
            </span>
          ) : 'Join Waitlist'}
        </button>

        {/* Footer */}
        {b.footerText && (
          <p className="text-center text-xs text-muted-foreground pt-2">{b.footerText}</p>
        )}
      </div>
    </div>
  );
}
