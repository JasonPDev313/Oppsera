'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  Users, Calendar, Loader2, Check, ChevronDown, Building2,
  Bed, AlertCircle, Mail, Phone, User, FileText,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface PmsProperty {
  id: string;
  name: string;
}

interface PmsRoomType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  maxOccupancy: number;
  maxAdults: number;
}

interface PmsWaitlistConfig {
  tenantName: string;
  properties?: PmsProperty[];
  propertyId?: string;
  branding?: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    welcomeHeadline: string;
    welcomeSubtitle: string;
    footerText: string | null;
  };
  form?: {
    requireEmail: boolean;
    requirePhone: boolean;
    showRates: boolean;
    maxAdvanceDays: number;
    termsText: string | null;
  };
  roomTypes?: PmsRoomType[];
}

type FlexibilityOption = 'exact_dates' | 'flexible_1_day' | 'flexible_3_days' | 'flexible_week' | 'any_dates';

const FLEXIBILITY_LABELS: Record<FlexibilityOption, string> = {
  exact_dates: 'Exact Dates',
  flexible_1_day: '\u00b11 Day',
  flexible_3_days: '\u00b13 Days',
  flexible_week: '\u00b11 Week',
  any_dates: 'Any Dates',
};

// ── Helpers ──────────────────────────────────────────────────────

const SAFE_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
function safeColor(c: string, fallback: string): string {
  return SAFE_COLOR_RE.test(c) ? c : fallback;
}

// ── Component ────────────────────────────────────────────────────

export default function PmsWaitlistJoinContent() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const propertyIdParam = searchParams.get('propertyId');

  // Data
  const [config, setConfig] = useState<PmsWaitlistConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  // Property picker
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(propertyIdParam);
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);

  // Form
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [roomTypeId, setRoomTypeId] = useState<string>('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [flexibility, setFlexibility] = useState<FlexibilityOption>('exact_dates');
  const [notes, setNotes] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showFlexDropdown, setShowFlexDropdown] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<{
    token: string;
  } | null>(null);

  // Fetch config
  useEffect(() => {
    if (!tenantSlug) return;
    const pid = selectedPropertyId || propertyIdParam;
    const qs = pid ? `?propertyId=${encodeURIComponent(pid)}` : '';
    setLoading(true);
    setNotFound(false);

    fetch(`/api/v1/pms/public/${tenantSlug}/waitlist/config${qs}`)
      .then((r) => {
        if (r.status === 429) { setRateLimited(true); return null; }
        if (r.status === 403) { setNotFound(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((json) => {
        if (!json?.data) {
          if (!rateLimited) setNotFound(true);
          setLoading(false);
          return;
        }
        const data = json.data as PmsWaitlistConfig;
        setConfig(data);

        // If multiple properties and none selected, show picker
        if (data.properties && data.properties.length > 1 && !pid) {
          setShowPropertyPicker(true);
        } else {
          setShowPropertyPicker(false);
        }
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [tenantSlug, selectedPropertyId, propertyIdParam, rateLimited]);

  // Today's date for min on date inputs
  const today = new Date().toISOString().split('T')[0];

  const handleSubmit = useCallback(async () => {
    setError(null);

    // Validation
    if (!guestName.trim()) { setError('Please enter your name'); return; }
    if (config?.form?.requireEmail && !guestEmail.trim()) { setError('Please enter your email'); return; }
    if (config?.form?.requirePhone && !guestPhone.trim()) { setError('Please enter your phone number'); return; }
    if (!checkIn) { setError('Please select a check-in date'); return; }
    if (!checkOut) { setError('Please select a check-out date'); return; }
    if (checkOut <= checkIn) { setError('Check-out must be after check-in'); return; }
    if (adults < 1) { setError('At least 1 adult is required'); return; }
    if (config?.form?.termsText && !acceptedTerms) { setError('Please accept the terms'); return; }

    const pid = selectedPropertyId || propertyIdParam;
    const qs = pid ? `?propertyId=${encodeURIComponent(pid)}` : '';

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/pms/public/${tenantSlug}/waitlist/join${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
          roomTypeId: roomTypeId || undefined,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          adults,
          children: children || undefined,
          flexibility,
          notes: notes.trim() || undefined,
          source: 'online',
        }),
      });

      if (res.status === 429) { setError('Too many requests. Please wait and try again.'); return; }
      if (res.status === 409) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? 'You are already on the waitlist for these dates.');
        return;
      }
      if (res.status === 403) {
        setError('The waitlist is currently closed. Please check back later.');
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      const json = await res.json();
      const token = json.data?.guestToken;

      if (token) {
        setJoinSuccess({ token });
        setTimeout(() => {
          router.push(`/waitlist/${tenantSlug}/pms/status/${token}`);
        }, 2500);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }, [
    guestName, guestEmail, guestPhone, roomTypeId, checkIn, checkOut,
    adults, children, flexibility, notes, acceptedTerms,
    tenantSlug, selectedPropertyId, propertyIdParam, config, router,
  ]);

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mx-auto" />
        <div className="h-4 bg-gray-200 rounded w-64 mx-auto" />
        <div className="space-y-4 pt-4">
          <div className="h-12 bg-gray-200 rounded-xl" />
          <div className="h-12 bg-gray-200 rounded-xl" />
          <div className="h-12 bg-gray-200 rounded-xl" />
          <div className="h-14 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  // ── Rate Limited ───────────────────────────────────────────
  if (rateLimited) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-2">Too Many Requests</h2>
        <p className="text-sm text-gray-500">Please wait a moment and refresh the page.</p>
      </div>
    );
  }

  // ── Not Found / Disabled ───────────────────────────────────
  if (notFound || !config) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
        <h2 className="text-lg font-bold text-gray-900 mb-2">Waitlist Not Available</h2>
        <p className="text-sm text-gray-500">This waitlist is not currently active. Please check back later.</p>
      </div>
    );
  }

  const rawB = config.branding ?? { primaryColor: '#6366f1', secondaryColor: '#8b5cf6', accentColor: '#f59e0b', fontFamily: 'system-ui', welcomeHeadline: 'Room Waitlist', welcomeSubtitle: 'Get notified when your preferred room becomes available.', logoUrl: null, footerText: null };
  const b = {
    ...rawB,
    primaryColor: safeColor(rawB.primaryColor, '#6366f1'),
    secondaryColor: safeColor(rawB.secondaryColor, '#8b5cf6'),
    accentColor: safeColor(rawB.accentColor, '#f59e0b'),
    fontFamily: rawB.fontFamily.replace(/[^A-Za-z0-9 _+-]/g, ''),
  };
  const form = config.form ?? { requireEmail: true, requirePhone: false, showRates: true, maxAdvanceDays: 365, termsText: null };
  const pc = b.primaryColor;
  const sc = b.secondaryColor;

  // ── Property Picker ────────────────────────────────────────
  if (showPropertyPicker && config.properties && config.properties.length > 1) {
    return (
      <div className="pb-8" style={{ fontFamily: b.fontFamily !== 'system-ui' ? `"${b.fontFamily}", sans-serif` : 'system-ui' }}>
        {b.logoUrl && /^https:\/\//.test(b.logoUrl) && (
          <div className="flex justify-center pt-6">
            <img src={b.logoUrl} alt={config.tenantName} className="h-12 max-w-50 object-contain" />
          </div>
        )}
        <div className="text-center pt-4 px-6 mb-6">
          <h1 className="text-xl font-bold text-gray-900">Select a Property</h1>
          <p className="text-sm text-gray-500 mt-1">Choose which property you&apos;d like to join the waitlist for</p>
        </div>
        <div className="px-6 space-y-3">
          {config.properties.map((prop) => (
            <button
              key={prop.id}
              type="button"
              onClick={() => {
                setSelectedPropertyId(prop.id);
                setShowPropertyPicker(false);
              }}
              className="w-full text-left rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${pc}15` }}>
                  <Building2 className="h-5 w-5" style={{ color: pc }} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{prop.name}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Success Celebration ──────────────────────────────────────
  if (joinSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <style>{`@keyframes pms-sp { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.15); } 70% { transform: scale(0.95); } 100% { transform: scale(1); opacity: 1; } } .pms-success-pop { animation: pms-sp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }`}</style>
        <div className="pms-success-pop">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: `linear-gradient(135deg, ${sc}, ${pc})`, boxShadow: `0 8px 24px ${pc}40` }}>
            <Check className="h-10 w-10 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">You&apos;re on the waitlist!</h2>
        <p className="text-sm text-gray-500 mb-1">We&apos;ll notify you when a room becomes available</p>
        <p className="text-xs text-gray-400 mt-3 animate-pulse">Taking you to your status page...</p>
      </div>
    );
  }

  const roomTypes: PmsRoomType[] = config.roomTypes ?? [];
  const maxAdults = 10;
  const maxChildren = 6;

  return (
    <div className="pb-8" style={{ fontFamily: b.fontFamily !== 'system-ui' ? `"${b.fontFamily}", sans-serif` : 'system-ui' }}>
      {/* Logo */}
      {b.logoUrl && /^https:\/\//.test(b.logoUrl) && (
        <div className="flex justify-center pt-6">
          <img src={b.logoUrl} alt={config.tenantName} className="h-12 max-w-50 object-contain" />
        </div>
      )}

      {/* Header */}
      <div className="text-center pt-4 px-6 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{config.tenantName}</p>
        <h1 className="text-xl font-bold text-gray-900">{b.welcomeHeadline}</h1>
        <p className="text-sm text-gray-500 mt-1">{b.welcomeSubtitle}</p>
      </div>

      <div className="px-6 space-y-5">
        {/* Guest Name */}
        <div>
          <label htmlFor="pms-name" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <User className="h-3.5 w-3.5" /> Name
          </label>
          <input
            id="pms-name"
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Your full name"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties}
          />
        </div>

        {/* Guest Email */}
        <div>
          <label htmlFor="pms-email" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <Mail className="h-3.5 w-3.5" /> Email {!form.requireEmail && <span className="text-gray-400 normal-case">(optional)</span>}
          </label>
          <input
            id="pms-email"
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties}
          />
        </div>

        {/* Guest Phone */}
        <div>
          <label htmlFor="pms-phone" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <Phone className="h-3.5 w-3.5" /> Phone {!form.requirePhone && <span className="text-gray-400 normal-case">(optional)</span>}
          </label>
          <input
            id="pms-phone"
            type="tel"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties}
          />
        </div>

        {/* Room Type */}
        {roomTypes.length > 0 && (
          <div>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              <Bed className="h-3.5 w-3.5" /> Room Type
            </label>
            <div className="relative">
              <select
                value={roomTypeId}
                onChange={(e) => setRoomTypeId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties}
              >
                <option value="">Any Room</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}{rt.maxOccupancy ? ` (up to ${rt.maxOccupancy})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pms-checkin" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              <Calendar className="h-3.5 w-3.5" /> Check-in
            </label>
            <input
              id="pms-checkin"
              type="date"
              value={checkIn}
              min={today}
              onChange={(e) => {
                setCheckIn(e.target.value);
                // Auto-set checkout to next day if empty or before new check-in
                if (!checkOut || e.target.value >= checkOut) {
                  const next = new Date(e.target.value);
                  next.setDate(next.getDate() + 1);
                  setCheckOut(next.toISOString().split('T')[0] ?? '');
                }
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties}
            />
          </div>
          <div>
            <label htmlFor="pms-checkout" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              <Calendar className="h-3.5 w-3.5" /> Check-out
            </label>
            <input
              id="pms-checkout"
              type="date"
              value={checkOut}
              min={checkIn || today}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties}
            />
          </div>
        </div>

        {/* Guests: Adults + Children */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              <Users className="h-3.5 w-3.5" /> Adults
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdults(Math.max(1, adults - 1))}
                disabled={adults <= 1}
                className="w-10 h-10 rounded-lg border border-gray-200 text-gray-600 font-bold text-lg flex items-center justify-center transition-colors hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                -
              </button>
              <span className="w-8 text-center text-sm font-semibold text-gray-900 tabular-nums">{adults}</span>
              <button
                type="button"
                onClick={() => setAdults(Math.min(maxAdults, adults + 1))}
                disabled={adults >= maxAdults}
                className="w-10 h-10 rounded-lg border border-gray-200 text-gray-600 font-bold text-lg flex items-center justify-center transition-colors hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>
          <div>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              <Users className="h-3.5 w-3.5" /> Children
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChildren(Math.max(0, children - 1))}
                disabled={children <= 0}
                className="w-10 h-10 rounded-lg border border-gray-200 text-gray-600 font-bold text-lg flex items-center justify-center transition-colors hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                -
              </button>
              <span className="w-8 text-center text-sm font-semibold text-gray-900 tabular-nums">{children}</span>
              <button
                type="button"
                onClick={() => setChildren(Math.min(maxChildren, children + 1))}
                disabled={children >= maxChildren}
                className="w-10 h-10 rounded-lg border border-gray-200 text-gray-600 font-bold text-lg flex items-center justify-center transition-colors hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Flexibility */}
        <div>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <Calendar className="h-3.5 w-3.5" /> Date Flexibility
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFlexDropdown(!showFlexDropdown)}
              className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties}
            >
              <span>{FLEXIBILITY_LABELS[flexibility]}</span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showFlexDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showFlexDropdown && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                {(Object.keys(FLEXIBILITY_LABELS) as FlexibilityOption[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { setFlexibility(opt); setShowFlexDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 ${
                      flexibility === opt ? 'font-semibold' : 'text-gray-700'
                    }`}
                    style={flexibility === opt ? { color: pc, backgroundColor: `${pc}08` } : undefined}
                  >
                    {FLEXIBILITY_LABELS[opt]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="pms-notes" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <FileText className="h-3.5 w-3.5" /> Notes <span className="text-gray-400 normal-case">(optional)</span>
          </label>
          <textarea
            id="pms-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special requests or preferences?"
            maxLength={500}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none h-20"
            style={{ '--tw-ring-color': `${pc}40` } as React.CSSProperties}
          />
        </div>

        {/* Terms */}
        {form.termsText && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
              style={{ accentColor: pc }}
            />
            <span className="text-xs text-gray-500 leading-relaxed">{form.termsText}</span>
          </label>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <span className="text-xs text-red-700">{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${sc}, ${pc})` }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Joining Waitlist...
            </span>
          ) : 'Join Waitlist'}
        </button>

        {/* Footer */}
        {b.footerText && (
          <p className="text-center text-xs text-gray-400 pt-2">{b.footerText}</p>
        )}
      </div>
    </div>
  );
}
