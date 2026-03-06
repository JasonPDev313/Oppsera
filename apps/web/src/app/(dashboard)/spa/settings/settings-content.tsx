'use client';

import { useState, useEffect } from 'react';
import { Settings, Save } from 'lucide-react';
import { useSpaSettings, useUpdateSpaSettings } from '@/hooks/use-spa';
import type { SpaSettings } from '@/hooks/use-spa';
import { useAuthContext } from '@/components/auth-provider';

/* ────────────────────────────────────────────────────────────────────
 * Local form state — maps to/from backend SpaSettings fields
 * ──────────────────────────────────────────────────────────────────── */

interface FormState {
  defaultBufferMinutes: number;
  defaultCleanupMinutes: number;
  defaultSetupMinutes: number;
  rebookingWindowDays: number;
  cancellationWindowHours: number;        // derived from cancellationDefaults
  onlineBookingEnabled: boolean;
  waitlistEnabled: boolean;
  autoAssignProvider: boolean;
  requireDeposit: boolean;
  defaultDepositPercentage: number;       // derived from depositRules
  sendConfirmationEmail: boolean;         // derived from notificationPreferences
  sendReminder: boolean;                  // derived from notificationPreferences
  reminderHoursBefore: number;            // derived from notificationPreferences
}

const DEFAULT_FORM: FormState = {
  defaultBufferMinutes: 15,
  defaultCleanupMinutes: 10,
  defaultSetupMinutes: 5,
  rebookingWindowDays: 90,
  cancellationWindowHours: 24,
  onlineBookingEnabled: false,
  waitlistEnabled: true,
  autoAssignProvider: true,
  requireDeposit: false,
  defaultDepositPercentage: 25,
  sendConfirmationEmail: true,
  sendReminder: true,
  reminderHoursBefore: 24,
};

/** Map backend SpaSettings to local form state */
function toFormState(s: SpaSettings): FormState {
  const cancelDefaults = (s.cancellationDefaults ?? {}) as Record<string, unknown>;
  const cancelMinutes = typeof cancelDefaults.windowMinutes === 'number' ? cancelDefaults.windowMinutes : 1440;

  const depositRules = (s.depositRules ?? {}) as Record<string, unknown>;
  const requireDeposit = depositRules.required === true;
  const depositPct = typeof depositRules.percentage === 'number' ? depositRules.percentage : 25;

  const notifPrefs = (s.notificationPreferences ?? {}) as Record<string, unknown>;

  return {
    defaultBufferMinutes: s.defaultBufferMinutes,
    defaultCleanupMinutes: s.defaultCleanupMinutes,
    defaultSetupMinutes: s.defaultSetupMinutes,
    rebookingWindowDays: s.rebookingWindowDays,
    cancellationWindowHours: Math.round(cancelMinutes / 60),
    onlineBookingEnabled: s.onlineBookingEnabled,
    waitlistEnabled: s.waitlistEnabled,
    autoAssignProvider: s.autoAssignProvider,
    requireDeposit,
    defaultDepositPercentage: depositPct,
    sendConfirmationEmail: notifPrefs.confirmationEmail !== false,
    sendReminder: notifPrefs.reminder !== false,
    reminderHoursBefore: typeof notifPrefs.reminderHoursBefore === 'number' ? notifPrefs.reminderHoursBefore : 24,
  };
}

/** Map local form state to backend update payload */
function toUpdatePayload(f: FormState) {
  return {
    defaultBufferMinutes: f.defaultBufferMinutes,
    defaultCleanupMinutes: f.defaultCleanupMinutes,
    defaultSetupMinutes: f.defaultSetupMinutes,
    rebookingWindowDays: f.rebookingWindowDays,
    onlineBookingEnabled: f.onlineBookingEnabled,
    waitlistEnabled: f.waitlistEnabled,
    autoAssignProvider: f.autoAssignProvider,
    depositRules: {
      required: f.requireDeposit,
      percentage: f.requireDeposit ? f.defaultDepositPercentage : null,
    },
    cancellationDefaults: {
      windowMinutes: f.cancellationWindowHours * 60,
    },
    notificationPreferences: {
      confirmationEmail: f.sendConfirmationEmail,
      reminder: f.sendReminder,
      reminderHoursBefore: f.reminderHoursBefore,
    },
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
  const { locations } = useAuthContext();
  const locationId = locations?.[0]?.id;
  const { data: serverSettings, isLoading } = useSpaSettings({ locationId });
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
          <NumberField
            label="Buffer between appointments"
            value={form.defaultBufferMinutes}
            onChange={(v) => update('defaultBufferMinutes', v)}
            suffix="min"
            min={0}
            max={120}
          />
          <NumberField
            label="Cleanup time"
            value={form.defaultCleanupMinutes}
            onChange={(v) => update('defaultCleanupMinutes', v)}
            suffix="min"
            min={0}
            max={120}
          />
          <NumberField
            label="Setup time"
            value={form.defaultSetupMinutes}
            onChange={(v) => update('defaultSetupMinutes', v)}
            suffix="min"
            min={0}
            max={120}
          />
          <NumberField
            label="Rebooking window"
            value={form.rebookingWindowDays}
            onChange={(v) => update('rebookingWindowDays', v)}
            suffix="days"
            min={1}
            max={365}
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
            label="Enable online booking"
            checked={form.onlineBookingEnabled}
            onChange={(v) => update('onlineBookingEnabled', v)}
          />
          <Toggle
            label="Enable waitlist"
            checked={form.waitlistEnabled}
            onChange={(v) => update('waitlistEnabled', v)}
          />
          <Toggle
            label="Auto-assign provider"
            checked={form.autoAssignProvider}
            onChange={(v) => update('autoAssignProvider', v)}
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
