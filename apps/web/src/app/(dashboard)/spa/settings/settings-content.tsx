'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, Clock } from 'lucide-react';
import { useSpaSettings, useUpdateSpaSettings } from '@/hooks/use-spa';
import type { SpaSettings } from '@/hooks/use-spa';

/* ────────────────────────────────────────────────────────────────────
 * Local form state — maps to/from backend SpaSettings fields
 * ──────────────────────────────────────────────────────────────────── */

interface FormState {
  defaultAppointmentDuration: number;     // derived from bufferMinutes or custom
  bookingLeadTimeHours: number;           // bookingWindowDays * 24 (simplified)
  cancellationWindowHours: number;        // cancellationPolicyMinutes / 60
  allowOnlineBooking: boolean;
  requireDeposit: boolean;
  defaultDepositPercentage: number;       // depositPercentage ?? 25
  allowWalkIns: boolean;                  // local-only for now
  sendConfirmationEmail: boolean;         // local-only for now
  sendReminder: boolean;                  // local-only for now
  reminderHoursBefore: number;            // local-only for now
  businessHours: Record<string, { open: string; close: string; closed: boolean }>;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const DEFAULT_BUSINESS_HOURS: FormState['businessHours'] = {
  monday:    { open: '09:00', close: '18:00', closed: false },
  tuesday:   { open: '09:00', close: '18:00', closed: false },
  wednesday: { open: '09:00', close: '18:00', closed: false },
  thursday:  { open: '09:00', close: '18:00', closed: false },
  friday:    { open: '09:00', close: '18:00', closed: false },
  saturday:  { open: '10:00', close: '16:00', closed: false },
  sunday:    { open: '10:00', close: '16:00', closed: true },
};

const DEFAULT_FORM: FormState = {
  defaultAppointmentDuration: 60,
  bookingLeadTimeHours: 2,
  cancellationWindowHours: 24,
  allowOnlineBooking: true,
  requireDeposit: false,
  defaultDepositPercentage: 25,
  allowWalkIns: true,
  sendConfirmationEmail: true,
  sendReminder: true,
  reminderHoursBefore: 24,
  businessHours: DEFAULT_BUSINESS_HOURS,
};

/** Map backend SpaSettings to local form state */
function toFormState(s: SpaSettings): FormState {
  const opHours = s.operatingHours ?? {};
  const businessHours: FormState['businessHours'] = {};
  for (const day of DAYS) {
    const h = opHours[day];
    businessHours[day] = h
      ? { open: h.open, close: h.close, closed: false }
      : (DEFAULT_BUSINESS_HOURS[day] ?? { open: '09:00', close: '18:00', closed: true });
  }

  return {
    defaultAppointmentDuration: s.bufferMinutes > 0 ? s.bufferMinutes : 60,
    bookingLeadTimeHours: (s.bookingWindowDays ?? 0) > 0 ? s.bookingWindowDays * 24 : 2,
    cancellationWindowHours: Math.round((s.cancellationPolicyMinutes ?? 0) / 60) || 24,
    allowOnlineBooking: s.allowOnlineBooking,
    requireDeposit: s.requireDeposit,
    defaultDepositPercentage: s.depositPercentage ?? 25,
    allowWalkIns: true,
    sendConfirmationEmail: true,
    sendReminder: true,
    reminderHoursBefore: 24,
    businessHours,
  };
}

/** Map local form state to backend update payload */
function toUpdatePayload(f: FormState) {
  const operatingHours: Record<string, { open: string; close: string }> = {};
  for (const day of DAYS) {
    const h = f.businessHours[day];
    if (h && !h.closed) {
      operatingHours[day] = { open: h.open, close: h.close };
    }
  }

  return {
    bufferMinutes: f.defaultAppointmentDuration,
    cancellationPolicyMinutes: f.cancellationWindowHours * 60,
    allowOnlineBooking: f.allowOnlineBooking,
    requireDeposit: f.requireDeposit,
    depositPercentage: f.requireDeposit ? f.defaultDepositPercentage : null,
    operatingHours: Object.keys(operatingHours).length > 0 ? operatingHours : null,
  };
}

/* ────────────────────────────────────────────────────────────────────
 * Inline components
 * ──────────────────────────────────────────────────────────────────── */

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-2">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-600'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          className="w-24 rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Main component
 * ──────────────────────────────────────────────────────────────────── */

export default function SettingsContent() {
  const { data: serverSettings, isLoading } = useSpaSettings();
  const { mutate: updateSettings, isPending: isSaving } = useUpdateSpaSettings();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (serverSettings) {
      setForm(toFormState(serverSettings));
      setIsDirty(false);
    }
  }, [serverSettings]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  function handleSave() {
    updateSettings(toUpdatePayload(form), {
      onSuccess: () => setIsDirty(false),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground">Spa Settings</h1>
      </div>

      {/* General Settings */}
      <section className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">General Settings</h2>
        <div className="space-y-1">
          {/* Business Hours (display only) */}
          <div className="pb-3">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">Business Hours</span>
            </div>
            <div className="space-y-2 pl-6">
              {DAYS.map((day) => {
                const hours = form.businessHours[day];
                return (
                  <div key={day} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground w-24">{DAY_LABELS[day]}</span>
                    <span className="text-foreground tabular-nums">
                      {hours?.closed ? (
                        <span className="text-muted-foreground italic">Closed</span>
                      ) : (
                        `${hours?.open ?? '09:00'} - ${hours?.close ?? '18:00'}`
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <NumberField
              label="Default appointment duration"
              value={form.defaultAppointmentDuration}
              onChange={(v) => update('defaultAppointmentDuration', v)}
              suffix="min"
              min={15}
              max={480}
            />
          </div>
          <NumberField
            label="Booking lead time"
            value={form.bookingLeadTimeHours}
            onChange={(v) => update('bookingLeadTimeHours', v)}
            suffix="hours"
            min={0}
            max={168}
          />
          <NumberField
            label="Cancellation policy window"
            value={form.cancellationWindowHours}
            onChange={(v) => update('cancellationWindowHours', v)}
            suffix="hours"
            min={0}
            max={168}
          />
        </div>
      </section>

      {/* Booking Settings */}
      <section className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Booking Settings</h2>
        <div className="space-y-1">
          <Toggle
            label="Allow online booking"
            checked={form.allowOnlineBooking}
            onChange={(v) => update('allowOnlineBooking', v)}
          />
          <Toggle
            label="Require deposit"
            checked={form.requireDeposit}
            onChange={(v) => update('requireDeposit', v)}
          />
          {form.requireDeposit && (
            <div className="pl-4 border-l-2 border-indigo-500/30 ml-1">
              <NumberField
                label="Default deposit percentage"
                value={form.defaultDepositPercentage}
                onChange={(v) => update('defaultDepositPercentage', v)}
                suffix="%"
                min={1}
                max={100}
              />
            </div>
          )}
          <Toggle
            label="Allow walk-ins"
            checked={form.allowWalkIns}
            onChange={(v) => update('allowWalkIns', v)}
          />
        </div>
      </section>

      {/* Notification Settings */}
      <section className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Notification Settings</h2>
        <div className="space-y-1">
          <Toggle
            label="Send confirmation email"
            checked={form.sendConfirmationEmail}
            onChange={(v) => update('sendConfirmationEmail', v)}
          />
          <Toggle
            label="Send reminder"
            checked={form.sendReminder}
            onChange={(v) => update('sendReminder', v)}
          />
          {form.sendReminder && (
            <div className="pl-4 border-l-2 border-indigo-500/30 ml-1">
              <NumberField
                label="Reminder before appointment"
                value={form.reminderHoursBefore}
                onChange={(v) => update('reminderHoursBefore', v)}
                suffix="hours"
                min={1}
                max={72}
              />
            </div>
          )}
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
