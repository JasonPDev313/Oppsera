'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  CalendarDays,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  ChevronLeft,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface AppointmentItem {
  id: string;
  serviceName: string;
  serviceCategory: string;
  durationMinutes: number;
  providerName: string | null;
  startAt: string;
  endAt: string;
  finalPriceCents: number;
  status: string;
}

interface CancellationPolicy {
  windowHours: number;
  feeType: string;
  feeValue: number;
  isWithinWindow: boolean;
}

interface AppointmentDetails {
  appointmentNumber: string;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  providerName: string | null;
  startAt: string;
  endAt: string;
  status: string;
  notes: string | null;
  depositAmountCents: number;
  depositStatus: string;
  cancellationReason: string | null;
  canceledAt: string | null;
  canCancel: boolean;
  cancellationPolicy: CancellationPolicy | null;
  items: AppointmentItem[];
}

type PageState = 'loading' | 'view' | 'confirm-cancel' | 'cancelling' | 'cancelled' | 'error';

// ── Helpers ────────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatFullDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusDisplay(status: string): {
  label: string;
  color: string;
  bgColor: string;
  icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'scheduled':
      return { label: 'Scheduled', color: 'text-indigo-500', bgColor: 'bg-indigo-500/10 border-indigo-500/30', icon: CalendarDays };
    case 'confirmed':
      return { label: 'Confirmed', color: 'text-green-500', bgColor: 'bg-green-500/10 border-green-500/30', icon: CheckCircle2 };
    case 'checked_in':
      return { label: 'Checked In', color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', icon: CheckCircle2 };
    case 'in_service':
      return { label: 'In Service', color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', icon: Clock };
    case 'completed':
      return { label: 'Completed', color: 'text-muted-foreground', bgColor: 'bg-accent border-border', icon: CheckCircle2 };
    case 'checked_out':
      return { label: 'Completed', color: 'text-muted-foreground', bgColor: 'bg-accent border-border', icon: CheckCircle2 };
    case 'canceled':
      return { label: 'Cancelled', color: 'text-red-500', bgColor: 'bg-red-500/10 border-red-500/30', icon: XCircle };
    case 'no_show':
      return { label: 'No Show', color: 'text-amber-500', bgColor: 'bg-amber-500/10 border-amber-500/30', icon: AlertCircle };
    default:
      return { label: status, color: 'text-muted-foreground', bgColor: 'bg-accent border-border', icon: AlertCircle };
  }
}

/** Derive display values from appointment items array */
function deriveServiceInfo(items: AppointmentItem[]) {
  const names = items.map((i) => i.serviceName);
  const totalPriceCents = items.reduce((sum, i) => sum + i.finalPriceCents, 0);
  const totalDurationMinutes = items.reduce((sum, i) => sum + i.durationMinutes, 0);
  return {
    serviceSummary: names.length === 1 ? names[0]! : `${names.length} services`,
    serviceNames: names,
    totalPriceCents,
    totalDurationMinutes,
  };
}

/** Build a cancellation policy description for display */
function buildCancellationPolicyText(policy: CancellationPolicy): string {
  if (policy.feeType === 'none' || policy.feeValue === 0) {
    return 'This appointment can be cancelled at no charge.';
  }
  const feeDesc = policy.feeType === 'percentage'
    ? `${policy.feeValue}% of the service total`
    : formatMoney(policy.feeValue * 100);

  if (policy.isWithinWindow) {
    return `Cancelling within ${policy.windowHours} hours of your appointment. A cancellation fee of ${feeDesc} may apply.`;
  }
  return `Cancellations within ${policy.windowHours} hours of the appointment may incur a fee of ${feeDesc}.`;
}

// ── Main Component ─────────────────────────────────────────────────

export default function ManageContent() {
  const params = useParams<{ tenantSlug: string; token: string }>();
  const { tenantSlug, token } = params;

  const [state, setState] = useState<PageState>('loading');
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const baseUrl = `/api/v1/spa/public/${tenantSlug}`;

  // ── Fetch Appointment ─────────────────────────────────
  useEffect(() => {
    if (!token || !tenantSlug) return;

    fetch(`${baseUrl}/manage/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((json) => {
        setAppointment(json.data as AppointmentDetails);
        setState('view');
      })
      .catch(() => {
        setState('error');
        setErrorMessage('Appointment not found. Please check your link and try again.');
      });
  }, [token, tenantSlug, baseUrl]);

  // ── Cancel Appointment ────────────────────────────────
  const handleCancel = useCallback(async () => {
    setState('cancelling');
    try {
      const res = await fetch(`${baseUrl}/manage/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          reason: cancelReason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setErrorMessage(json?.error?.message ?? 'Unable to cancel. Please try again.');
        setState('view');
        return;
      }
      setAppointment((prev) => (prev ? { ...prev, status: 'canceled', canCancel: false } : prev));
      setState('cancelled');
    } catch {
      setErrorMessage('Network error. Please try again.');
      setState('view');
    }
  }, [baseUrl, token, cancelReason]);

  // ── Loading ───────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-3 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading appointment...</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-foreground mb-2">Not Found</h1>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ── Cancel Confirmation ───────────────────────────────
  if (state === 'confirm-cancel' && appointment) {
    const { serviceSummary } = deriveServiceInfo(appointment.items);

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 mx-auto mb-3">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Cancel Appointment?</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Are you sure you want to cancel your {serviceSummary} appointment on{' '}
              {formatFullDate(appointment.startAt)} at {formatTime(appointment.startAt)}?
            </p>
          </div>

          {appointment.cancellationPolicy && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-500">
                  {buildCancellationPolicyText(appointment.cancellationPolicy)}
                </p>
              </div>
            </div>
          )}

          {/* Optional cancellation reason */}
          <div className="mb-4">
            <label htmlFor="cancel-reason" className="block text-xs font-medium text-muted-foreground mb-1">
              Reason (optional)
            </label>
            <textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Let us know why you're cancelling..."
              rows={2}
              maxLength={500}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none"
            />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleCancel}
              className="w-full rounded-lg py-3 text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors active:scale-[0.98]"
            >
              Yes, Cancel Appointment
            </button>
            <button
              type="button"
              onClick={() => {
                setState('view');
                setErrorMessage(null);
              }}
              className="w-full rounded-lg py-3 text-sm font-semibold text-muted-foreground border border-border hover:bg-accent transition-colors"
            >
              Keep My Appointment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Cancelling ────────────────────────────────────────
  if (state === 'cancelling') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-muted-foreground mx-auto mb-3 animate-spin" />
          <p className="text-sm text-muted-foreground">Cancelling appointment...</p>
        </div>
      </div>
    );
  }

  // ── Cancelled Success ─────────────────────────────────
  if (state === 'cancelled' && appointment) {
    const { serviceSummary } = deriveServiceInfo(appointment.items);

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent mx-auto mb-3">
            <XCircle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1">Appointment Cancelled</h2>
          <p className="text-sm text-muted-foreground">
            Your {serviceSummary} appointment has been cancelled.
          </p>
          {appointment.depositAmountCents > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Any applicable refund will be processed according to the cancellation policy.
            </p>
          )}
          <a
            href={`/book/${tenantSlug}/spa`}
            className="inline-block mt-6 rounded-lg px-6 py-2.5 text-sm font-semibold text-indigo-600 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
          >
            Book a New Appointment
          </a>
        </div>
      </div>
    );
  }

  // ── View Appointment ──────────────────────────────────
  if (!appointment) return null;

  const statusDisplay = getStatusDisplay(appointment.status);
  const StatusIcon = statusDisplay.icon;
  const { serviceSummary, serviceNames, totalPriceCents, totalDurationMinutes } = deriveServiceInfo(appointment.items);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="text-center pt-6 px-6 pb-4">
        <h1 className="text-lg font-bold text-foreground">Manage Your Appointment</h1>
        <p className="text-sm text-muted-foreground mt-0.5">#{appointment.appointmentNumber}</p>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-4 mb-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-500">{errorMessage}</p>
        </div>
      )}

      {/* Status Badge */}
      <div className="px-4 mb-4">
        <div className={`rounded-lg border p-3 flex items-center gap-2 ${statusDisplay.bgColor}`}>
          <StatusIcon className={`h-4 w-4 ${statusDisplay.color}`} />
          <span className={`text-sm font-semibold ${statusDisplay.color}`}>
            {statusDisplay.label}
          </span>
        </div>
      </div>

      {/* Details Card */}
      <div className="mx-4 rounded-lg border border-border divide-y divide-border">
        {/* Service(s) */}
        <div className="p-4">
          {serviceNames.length === 1 ? (
            <h3 className="text-base font-bold text-foreground">{serviceNames[0]}</h3>
          ) : (
            <div>
              <h3 className="text-base font-bold text-foreground mb-1">{serviceSummary}</h3>
              <ul className="space-y-0.5">
                {appointment.items.map((item) => (
                  <li key={item.id} className="text-sm text-muted-foreground">
                    {item.serviceName}
                    <span className="text-muted-foreground ml-1">({item.durationMinutes} min)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Provider */}
        {appointment.providerName && (
          <div className="px-4 py-3 flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground">{appointment.providerName}</span>
          </div>
        )}

        {/* Guest Name */}
        {appointment.guestName && (
          <div className="px-4 py-3 flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground">{appointment.guestName}</span>
          </div>
        )}

        {/* Date */}
        <div className="px-4 py-3 flex items-center gap-3">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">
            {formatFullDate(appointment.startAt)}
          </span>
        </div>

        {/* Time */}
        <div className="px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">
            {formatTime(appointment.startAt)} - {formatTime(appointment.endAt)}
            <span className="text-muted-foreground ml-1">({totalDurationMinutes} min)</span>
          </span>
        </div>

        {/* Price */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Total Price</span>
          </div>
          <span className="text-sm font-bold text-foreground">{formatMoney(totalPriceCents)}</span>
        </div>

        {/* Deposit */}
        {appointment.depositAmountCents > 0 && (
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground ml-7">Deposit ({appointment.depositStatus})</span>
            <span className="text-sm text-foreground">{formatMoney(appointment.depositAmountCents)}</span>
          </div>
        )}
      </div>

      {/* Notes (read-only) */}
      {appointment.notes && (
        <div className="mx-4 mt-4">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            <FileText className="h-3.5 w-3.5" />
            Notes
          </label>
          <div className="rounded-lg bg-surface border border-border p-3">
            <p className="text-sm text-foreground">{appointment.notes}</p>
          </div>
        </div>
      )}

      {/* Cancellation Info (for already-cancelled) */}
      {appointment.canceledAt && (
        <div className="mx-4 mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
          <p className="text-xs text-red-500">
            Cancelled on {formatFullDate(appointment.canceledAt)} at {formatTime(appointment.canceledAt)}
            {appointment.cancellationReason && (
              <> &mdash; {appointment.cancellationReason}</>
            )}
          </p>
        </div>
      )}

      {/* Cancel Button */}
      {appointment.canCancel && (
        <div className="mx-4 mt-6">
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setState('confirm-cancel');
            }}
            className="w-full rounded-lg py-3 text-sm font-semibold text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors active:scale-[0.98]"
          >
            Cancel Appointment
          </button>
        </div>
      )}

      {/* Book Again Link */}
      <div className="mx-4 mt-3 mb-6">
        <a
          href={`/book/${tenantSlug}/spa`}
          className="flex items-center justify-center gap-1 w-full rounded-lg py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-500/10 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Book Another Appointment
        </a>
      </div>

      {/* Footer */}
      <div className="mt-auto text-center pb-4 pt-2">
        <p className="text-[10px] text-muted-foreground">Powered by OppsEra</p>
      </div>
    </div>
  );
}
