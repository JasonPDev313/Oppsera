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
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface AppointmentDetails {
  appointmentId: string;
  confirmationNumber: string;
  status: 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  serviceName: string;
  providerName: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  priceCents: number;
  depositAmountCents: number;
  notes?: string;
  tenantName: string;
  cancellationPolicy?: string;
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

function isInPast(isoString: string): boolean {
  return new Date(isoString) < new Date();
}

function getStatusDisplay(status: AppointmentDetails['status']): {
  label: string;
  color: string;
  bgColor: string;
  icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'confirmed':
      return { label: 'Confirmed', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200', icon: CheckCircle2 };
    case 'checked_in':
      return { label: 'Checked In', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', icon: CheckCircle2 };
    case 'completed':
      return { label: 'Completed', color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200', icon: CheckCircle2 };
    case 'cancelled':
      return { label: 'Cancelled', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', icon: XCircle };
    case 'no_show':
      return { label: 'No Show', color: 'text-amber-700', bgColor: 'bg-amber-50 border-amber-200', icon: AlertCircle };
    default:
      return { label: status, color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200', icon: AlertCircle };
  }
}

// ── Main Component ─────────────────────────────────────────────────

export default function ManageContent() {
  const params = useParams<{ tenantSlug: string; token: string }>();
  const { tenantSlug, token } = params;

  const [state, setState] = useState<PageState>('loading');
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const baseUrl = `/api/v1/spa/public/${tenantSlug}`;

  // ── Fetch Appointment ─────────────────────────────────
  useEffect(() => {
    if (!token || !tenantSlug) return;

    fetch(`${baseUrl}/appointments/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((json) => {
        const data = json.data as AppointmentDetails;
        setAppointment(data);
        setNotes(data.notes ?? '');
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
      const res = await fetch(`${baseUrl}/appointments/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setErrorMessage(json?.error?.message ?? 'Unable to cancel. Please try again.');
        setState('view');
        return;
      }
      setAppointment((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
      setState('cancelled');
    } catch {
      setErrorMessage('Network error. Please try again.');
      setState('view');
    }
  }, [baseUrl, token]);

  // ── Save Notes ────────────────────────────────────────
  const handleSaveNotes = useCallback(async () => {
    setNotesSaving(true);
    setNotesSaved(false);
    try {
      const res = await fetch(`${baseUrl}/appointments/${token}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() }),
      });
      if (res.ok) {
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
      }
    } catch {
      // Best-effort save
    } finally {
      setNotesSaving(false);
    }
  }, [baseUrl, token, notes]);

  // ── Loading ───────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto mb-3 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading appointment...</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Not Found</h1>
          <p className="text-sm text-gray-500">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ── Cancel Confirmation ───────────────────────────────
  if (state === 'confirm-cancel' && appointment) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 mx-auto mb-3">
              <XCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Cancel Appointment?</h2>
            <p className="text-sm text-gray-500 mt-1">
              Are you sure you want to cancel your {appointment.serviceName} appointment on{' '}
              {formatFullDate(appointment.startTime)} at {formatTime(appointment.startTime)}?
            </p>
          </div>

          {appointment.cancellationPolicy && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
              <p className="text-xs text-amber-700">{appointment.cancellationPolicy}</p>
            </div>
          )}

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
              className="w-full rounded-lg py-3 text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
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
          <Loader2 className="h-8 w-8 text-gray-400 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-gray-500">Cancelling appointment...</p>
        </div>
      </div>
    );
  }

  // ── Cancelled Success ─────────────────────────────────
  if (state === 'cancelled' && appointment) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mx-auto mb-3">
            <XCircle className="h-8 w-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Appointment Cancelled</h2>
          <p className="text-sm text-gray-500">
            Your {appointment.serviceName} appointment has been cancelled.
          </p>
          {appointment.depositAmountCents > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              Any applicable refund will be processed according to the cancellation policy.
            </p>
          )}
          <a
            href={`/book/${tenantSlug}/spa`}
            className="inline-block mt-6 rounded-lg px-6 py-2.5 text-sm font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
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
  const past = isInPast(appointment.startTime);
  const canCancel = appointment.status === 'confirmed' && !past;
  const canEditNotes = appointment.status === 'confirmed' && !past;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="text-center pt-6 px-6 pb-4">
        <h1 className="text-lg font-bold text-gray-900">{appointment.tenantName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage Your Appointment</p>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mx-4 mb-3 rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Status Badge */}
      <div className="px-4 mb-4">
        <div className={`rounded-lg border p-3 flex items-center gap-2 ${statusDisplay.bgColor}`}>
          <StatusIcon className={`h-4 w-4 ${statusDisplay.color}`} />
          <span className={`text-sm font-semibold ${statusDisplay.color}`}>
            {statusDisplay.label}
          </span>
          {appointment.confirmationNumber && (
            <span className="ml-auto text-xs text-gray-500">
              #{appointment.confirmationNumber}
            </span>
          )}
        </div>
      </div>

      {/* Details Card */}
      <div className="mx-4 rounded-lg border border-gray-200 divide-y divide-gray-100">
        <div className="p-4">
          <h3 className="text-base font-bold text-gray-900">{appointment.serviceName}</h3>
        </div>
        <div className="px-4 py-3 flex items-center gap-3">
          <User className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-700">{appointment.providerName}</span>
        </div>
        <div className="px-4 py-3 flex items-center gap-3">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-700">
            {formatFullDate(appointment.startTime)}
          </span>
        </div>
        <div className="px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-700">
            {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
            <span className="text-gray-400 ml-1">({appointment.durationMinutes} min)</span>
          </span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Price</span>
          <span className="text-sm font-bold text-gray-900">{formatMoney(appointment.priceCents)}</span>
        </div>
      </div>

      {/* Notes Section */}
      {canEditNotes && (
        <div className="mx-4 mt-4">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <FileText className="h-3.5 w-3.5" />
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesSaved(false);
            }}
            placeholder="Any special requests..."
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none"
          />
          <div className="flex items-center justify-end gap-2 mt-1.5">
            {notesSaved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={notesSaving}
              className="rounded-lg px-4 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              {notesSaving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>
        </div>
      )}

      {/* Read-only notes for past/non-editable */}
      {!canEditNotes && appointment.notes && (
        <div className="mx-4 mt-4">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <FileText className="h-3.5 w-3.5" />
            Notes
          </label>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-sm text-gray-700">{appointment.notes}</p>
          </div>
        </div>
      )}

      {/* Cancel Button */}
      {canCancel && (
        <div className="mx-4 mt-6">
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setState('confirm-cancel');
            }}
            className="w-full rounded-lg py-3 text-sm font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors active:scale-[0.98]"
          >
            Cancel Appointment
          </button>
        </div>
      )}

      {/* Book Again Link */}
      <div className="mx-4 mt-3 mb-6">
        <a
          href={`/book/${tenantSlug}/spa`}
          className="flex items-center justify-center gap-1 w-full rounded-lg py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Book Another Appointment
        </a>
      </div>

      {/* Footer */}
      <div className="mt-auto text-center pb-4 pt-2">
        <p className="text-[10px] text-gray-400">Powered by OppsEra</p>
      </div>
    </div>
  );
}
