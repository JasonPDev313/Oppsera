'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Save, RotateCcw, ChevronDown, ChevronRight, Plus, X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ────────────────────────────────────────────────────────

interface MealPeriodPacing { maxCovers: number; maxReservations: number }
interface MealPeriodSchedule { start: string; end: string }
interface SpecialHourOverride { start: string; end: string }
interface SpecialHourEntry {
  date: string;
  label: string;
  overrides: {
    breakfast: SpecialHourOverride | null;
    brunch: SpecialHourOverride | null;
    lunch: SpecialHourOverride | null;
    dinner: SpecialHourOverride | null;
  };
}

interface HostSettings {
  reservations: {
    slotMinutes: number;
    maxPartySize: number;
    advanceBookingDays: number;
    sameDayEnabled: boolean;
    requirePhone: boolean;
    requireEmail: boolean;
    allowSpecialRequests: boolean;
    confirmationRequired: boolean;
    autoConfirmUpToParty: number;
    defaultDurationMinutes: { breakfast: number; brunch: number; lunch: number; dinner: number };
    bufferMinutes: number;
    overbookPercent: number;
    minLeadTimeMinutes: number;
  };
  pacing: {
    enabled: boolean;
    coversPerInterval: number;
    intervalMinutes: number;
    onlinePacingPercent: number;
    perMealPeriod: { breakfast: MealPeriodPacing; brunch: MealPeriodPacing; lunch: MealPeriodPacing; dinner: MealPeriodPacing };
  };
  waitlist: {
    maxSize: number;
    noShowGraceMinutes: number;
    notifyExpiryMinutes: number;
    autoRemoveAfterExpiryMinutes: number;
    allowQuotedTime: boolean;
    priorityEnabled: boolean;
    priorityTags: string[];
    requirePartySize: boolean;
    maxWaitMinutes: number;
  };
  estimation: {
    enabled: boolean;
    defaultTurnMinutes: { small: number; medium: number; large: number; xlarge: number };
    byTableType: { bar: number; booth: number; patio: number; highTop: number };
    dayOfWeekMultiplier: { sun: number; mon: number; tue: number; wed: number; thu: number; fri: number; sat: number };
    useHistoricalData: boolean;
    historicalWeight: number;
  };
  deposits: {
    enabled: boolean;
    mode: 'per_person' | 'flat' | 'percentage';
    amountCents: number;
    percentOfEstimate: number;
    minPartySizeForDeposit: number;
    refundableUntilHoursBefore: number;
    noShowFeeEnabled: boolean;
    noShowFeeCents: number;
    lateCancellationEnabled: boolean;
    lateCancellationHoursBefore: number;
    lateCancellationFeeCents: number;
  };
  notifications: {
    smsEnabled: boolean;
    emailEnabled: boolean;
    autoConfirmation: boolean;
    autoReminder: boolean;
    reminderHoursBefore: number;
    secondReminderHoursBefore: number;
    smsFromNumber: string | null;
    templates: {
      confirmationSms: string;
      confirmationEmail: string;
      reminderSms: string;
      waitlistReadySms: string;
      waitlistAddedSms: string;
      cancellationSms: string;
      noShowSms: string;
    };
    waitlistReadyAlert: boolean;
    sendOnCancellation: boolean;
    sendOnModification: boolean;
  };
  tableManagement: {
    autoAssignEnabled: boolean;
    allowCombinations: boolean;
    maxCombinedTables: number;
    holdTimeMinutes: number;
    lateArrivalGraceMinutes: number;
    autoReleaseAfterGraceMinutes: number;
    preferenceWeights: {
      capacityFit: number;
      seatingPreference: number;
      serverBalance: number;
      vipPreference: number;
    };
    minCapacityUtilization: number;
    maxCapacityOverflow: number;
  };
  serverRotation: {
    method: 'round_robin' | 'cover_balance' | 'manual';
    trackCoversPerServer: boolean;
    maxCoverDifference: number;
    skipCutServers: boolean;
    rebalanceOnCut: boolean;
  };
  guestSelfService: {
    waitlistEnabled: boolean;
    reservationEnabled: boolean;
    qrCodeEnabled: boolean;
    showMenuWhileWaiting: boolean;
    showEstimatedWait: boolean;
    showQueuePosition: boolean;
    allowCancellation: boolean;
    requirePhoneVerification: boolean;
  };
  schedule: {
    blackoutDates: string[];
    specialHours: SpecialHourEntry[];
    closedDays: string[];
    holidayAutoClose: boolean;
  };
  display: {
    defaultView: 'map' | 'grid';
    showElapsedTime: boolean;
    showServerOnTables: boolean;
    showCoverCount: boolean;
    showTableStatus: boolean;
    autoSelectMealPeriod: boolean;
    colorCodeByStatus: boolean;
    colorCodeByServer: boolean;
    compactMode: boolean;
    refreshIntervalSeconds: number;
    mealPeriodSchedule: {
      breakfast: MealPeriodSchedule;
      brunch: MealPeriodSchedule;
      lunch: MealPeriodSchedule;
      dinner: MealPeriodSchedule;
    };
  };
  alerts: {
    soundEnabled: boolean;
    newReservationSound: boolean;
    waitlistEntrySound: boolean;
    tableReadySound: boolean;
    noShowAlertMinutes: number;
    capacityWarningPercent: number;
    longWaitAlertMinutes: number;
    overdueReservationMinutes: number;
  };
  guestProfile: {
    enableTags: boolean;
    defaultTags: string[];
    occasionOptions: string[];
    seatingPreferences: string[];
    trackVisitHistory: boolean;
    showGuestNotes: boolean;
  };
}

const DEFAULT_HOST_SETTINGS: HostSettings = {
  reservations: {
    slotMinutes: 30, maxPartySize: 20, advanceBookingDays: 30, sameDayEnabled: true,
    requirePhone: false, requireEmail: false, allowSpecialRequests: true, confirmationRequired: false,
    autoConfirmUpToParty: 0, defaultDurationMinutes: { breakfast: 45, brunch: 60, lunch: 60, dinner: 90 },
    bufferMinutes: 10, overbookPercent: 0, minLeadTimeMinutes: 60,
  },
  pacing: {
    enabled: false, coversPerInterval: 20, intervalMinutes: 15, onlinePacingPercent: 50,
    perMealPeriod: {
      breakfast: { maxCovers: 0, maxReservations: 0 }, brunch: { maxCovers: 0, maxReservations: 0 },
      lunch: { maxCovers: 0, maxReservations: 0 }, dinner: { maxCovers: 0, maxReservations: 0 },
    },
  },
  waitlist: {
    maxSize: 50, noShowGraceMinutes: 15, notifyExpiryMinutes: 10, autoRemoveAfterExpiryMinutes: 15,
    allowQuotedTime: true, priorityEnabled: false, priorityTags: ['VIP', 'Regular', 'First Time'],
    requirePartySize: true, maxWaitMinutes: 120,
  },
  estimation: {
    enabled: true,
    defaultTurnMinutes: { small: 45, medium: 60, large: 75, xlarge: 90 },
    byTableType: { bar: 0, booth: 0, patio: 0, highTop: 0 },
    dayOfWeekMultiplier: { sun: 1.0, mon: 1.0, tue: 1.0, wed: 1.0, thu: 1.0, fri: 1.15, sat: 1.15 },
    useHistoricalData: true, historicalWeight: 0.7,
  },
  deposits: {
    enabled: false, mode: 'per_person', amountCents: 2500, percentOfEstimate: 0,
    minPartySizeForDeposit: 6, refundableUntilHoursBefore: 24, noShowFeeEnabled: false,
    noShowFeeCents: 2500, lateCancellationEnabled: false, lateCancellationHoursBefore: 4, lateCancellationFeeCents: 1500,
  },
  notifications: {
    smsEnabled: false, emailEnabled: true, autoConfirmation: false, autoReminder: false,
    reminderHoursBefore: 4, secondReminderHoursBefore: 0, smsFromNumber: null,
    templates: {
      confirmationSms: 'Hi {guest_name}, your reservation for {party_size} at {restaurant_name} on {date} at {time} is confirmed.',
      confirmationEmail: 'Your reservation is confirmed for {party_size} guests on {date} at {time}.',
      reminderSms: 'Reminder: Your reservation at {restaurant_name} is tomorrow at {time} for {party_size} guests.',
      waitlistReadySms: 'Hi {guest_name}, your table is ready at {restaurant_name}! Please check in within {expiry_minutes} minutes.',
      waitlistAddedSms: "Hi {guest_name}, you've been added to the waitlist at {restaurant_name}. Estimated wait: {wait_time}.",
      cancellationSms: 'Your reservation at {restaurant_name} on {date} at {time} has been cancelled.',
      noShowSms: '',
    },
    waitlistReadyAlert: true, sendOnCancellation: true, sendOnModification: true,
  },
  tableManagement: {
    autoAssignEnabled: false, allowCombinations: true, maxCombinedTables: 4, holdTimeMinutes: 15,
    lateArrivalGraceMinutes: 15, autoReleaseAfterGraceMinutes: 0,
    preferenceWeights: { capacityFit: 0.4, seatingPreference: 0.2, serverBalance: 0.3, vipPreference: 0.1 },
    minCapacityUtilization: 0.5, maxCapacityOverflow: 2,
  },
  serverRotation: {
    method: 'round_robin', trackCoversPerServer: true, maxCoverDifference: 10,
    skipCutServers: true, rebalanceOnCut: false,
  },
  guestSelfService: {
    waitlistEnabled: false, reservationEnabled: false, qrCodeEnabled: false,
    showMenuWhileWaiting: true, showEstimatedWait: true, showQueuePosition: false,
    allowCancellation: true, requirePhoneVerification: false,
  },
  schedule: { blackoutDates: [], specialHours: [], closedDays: [], holidayAutoClose: false },
  display: {
    defaultView: 'map', showElapsedTime: true, showServerOnTables: true, showCoverCount: true,
    showTableStatus: true, autoSelectMealPeriod: true, colorCodeByStatus: true, colorCodeByServer: false,
    compactMode: false, refreshIntervalSeconds: 30,
    mealPeriodSchedule: {
      breakfast: { start: '06:00', end: '10:30' }, brunch: { start: '10:00', end: '14:00' },
      lunch: { start: '11:00', end: '15:00' }, dinner: { start: '17:00', end: '22:00' },
    },
  },
  alerts: {
    soundEnabled: true, newReservationSound: true, waitlistEntrySound: true, tableReadySound: true,
    noShowAlertMinutes: 15, capacityWarningPercent: 90, longWaitAlertMinutes: 45, overdueReservationMinutes: 10,
  },
  guestProfile: {
    enableTags: true, defaultTags: ['VIP', 'Regular', 'First Time', 'Birthday', 'Anniversary', 'Allergy', 'High Chair'],
    occasionOptions: ['Birthday', 'Anniversary', 'Date Night', 'Business', 'Celebration', 'Holiday'],
    seatingPreferences: ['Indoor', 'Outdoor', 'Bar', 'Booth', 'Window', 'Quiet', 'High Top'],
    trackVisitHistory: true, showGuestNotes: true,
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-400/50'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${checked ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}

function NumberField({ value, onChange, label, min, max, step, suffix }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-20 rounded border border-border bg-surface px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

function TimeField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </label>
  );
}

function SelectField({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function TextField({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-foreground shrink-0">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 rounded border border-border bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </label>
  );
}

function TextAreaField({ value, onChange, label, rows }: { value: string; onChange: (v: string) => void; label: string; rows?: number }) {
  return (
    <div className="py-1.5 space-y-1">
      <span className="text-sm text-foreground">{label}</span>
      <textarea
        value={value}
        rows={rows ?? 2}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

function TagList({ tags, onChange, label, placeholder }: { tags: string[]; onChange: (v: string[]) => void; label: string; placeholder?: string }) {
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };
  return (
    <div className="py-1.5 space-y-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 px-2 py-0.5 text-xs">
            {t}
            <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-red-500"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={input}
          placeholder={placeholder ?? 'Add tag...'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button type="button" onClick={add} className="rounded bg-indigo-600 text-white px-2 py-1 text-xs hover:bg-indigo-500 transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DayCheckboxes({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const days = [
    { key: 'sun', label: 'Su' }, { key: 'mon', label: 'Mo' }, { key: 'tue', label: 'Tu' },
    { key: 'wed', label: 'We' }, { key: 'thu', label: 'Th' }, { key: 'fri', label: 'Fr' }, { key: 'sat', label: 'Sa' },
  ];
  const toggle = (d: string) => selected.includes(d) ? onChange(selected.filter((x) => x !== d)) : onChange([...selected, d]);
  return (
    <div className="py-1.5 space-y-1">
      <span className="text-sm text-foreground">Closed Days</span>
      <div className="flex gap-1.5">
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.key)}
            className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${selected.includes(d.key) ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-surface border border-border text-muted-foreground hover:bg-accent'}`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground pt-2 pb-1 font-medium uppercase tracking-wider">{children}</p>;
}

function Section({ title, expanded, onToggle, children, badge }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode; badge?: string }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-accent/30 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {badge && <span className="text-[10px] bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">{badge}</span>}
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && <div className="px-4 py-3 space-y-1 border-t border-border">{children}</div>}
    </div>
  );
}

function CentsField({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const dollars = (value / 100).toFixed(2);
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-sm text-muted-foreground">$</span>
        <input
          type="number"
          value={dollars}
          min={0}
          step={0.01}
          onChange={(e) => onChange(Math.round(parseFloat(e.target.value || '0') * 100))}
          className="w-20 rounded border border-border bg-surface px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </label>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function HostSettingsPanel({ locationId }: { locationId: string }) {
  const [settings, setSettings] = useState<HostSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    reservations: true,
    pacing: false,
    waitlist: false,
    estimation: false,
    deposits: false,
    notifications: false,
    tableManagement: false,
    serverRotation: false,
    guestSelfService: false,
    schedule: false,
    display: false,
    alerts: false,
    guestProfile: false,
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = buildQueryString({ locationId });
      const res = await apiFetch(`/api/v1/fnb/host/settings${qs}`) as { data: HostSettings };
      setSettings(res.data);
    } catch {
      // Fall back to defaults so UI is still usable
      setSettings(DEFAULT_HOST_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const qs = buildQueryString({ locationId });
      await apiFetch(`/api/v1/fnb/host/settings${qs}`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  const reset = () => { load(); setIsDirty(false); };

  const update = <K extends keyof HostSettings>(section: K, patch: Partial<HostSettings[K]>) => {
    if (!settings) return;
    setSettings({ ...settings, [section]: { ...settings[section], ...patch } });
    setIsDirty(true);
  };

  const toggle = (section: string) => setExpanded((e) => ({ ...e, [section]: !e[section] }));

  if (isLoading || !settings) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-accent/30 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const meals = ['breakfast', 'brunch', 'lunch', 'dinner'] as const;
  const dayLabels = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' } as const;

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-foreground">Host Settings</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            disabled={!isDirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 transition-all active:scale-[0.97]"
            aria-label="Reset changes"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            onClick={save}
            disabled={!isDirty || isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-all active:scale-[0.97]"
            aria-label="Save settings"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── 1. Reservations ── */}
      <Section title="Reservations" expanded={!!expanded['reservations']} onToggle={() => toggle('reservations')}>
        <NumberField label="Time Slot" value={settings.reservations.slotMinutes} min={15} max={60} suffix="min" onChange={(v) => update('reservations', { slotMinutes: v })} />
        <NumberField label="Max Party Size" value={settings.reservations.maxPartySize} min={1} max={99} onChange={(v) => update('reservations', { maxPartySize: v })} />
        <NumberField label="Advance Booking" value={settings.reservations.advanceBookingDays} min={1} max={365} suffix="days" onChange={(v) => update('reservations', { advanceBookingDays: v })} />
        <NumberField label="Min Lead Time" value={settings.reservations.minLeadTimeMinutes} min={0} max={1440} suffix="min" onChange={(v) => update('reservations', { minLeadTimeMinutes: v })} />
        <NumberField label="Buffer Between Reservations" value={settings.reservations.bufferMinutes} min={0} max={30} suffix="min" onChange={(v) => update('reservations', { bufferMinutes: v })} />
        <NumberField label="Overbook Tolerance" value={settings.reservations.overbookPercent} min={0} max={50} suffix="%" onChange={(v) => update('reservations', { overbookPercent: v })} />
        <Toggle label="Allow Same-Day Reservations" checked={settings.reservations.sameDayEnabled} onChange={(v) => update('reservations', { sameDayEnabled: v })} />
        <Toggle label="Require Phone Number" checked={settings.reservations.requirePhone} onChange={(v) => update('reservations', { requirePhone: v })} />
        <Toggle label="Require Email" checked={settings.reservations.requireEmail} onChange={(v) => update('reservations', { requireEmail: v })} />
        <Toggle label="Allow Special Requests" checked={settings.reservations.allowSpecialRequests} onChange={(v) => update('reservations', { allowSpecialRequests: v })} />
        <Toggle label="Require Confirmation" description="Reservations start as pending until confirmed" checked={settings.reservations.confirmationRequired} onChange={(v) => update('reservations', { confirmationRequired: v })} />
        {settings.reservations.confirmationRequired && (
          <NumberField label="Auto-Confirm Parties Up To" value={settings.reservations.autoConfirmUpToParty} min={0} max={99} onChange={(v) => update('reservations', { autoConfirmUpToParty: v })} />
        )}
        <SectionLabel>Default Duration per Meal Period</SectionLabel>
        {meals.map((meal) => (
          <NumberField
            key={meal}
            label={meal.charAt(0).toUpperCase() + meal.slice(1)}
            value={settings.reservations.defaultDurationMinutes[meal]}
            min={15} max={240} suffix="min"
            onChange={(v) => update('reservations', { defaultDurationMinutes: { ...settings.reservations.defaultDurationMinutes, [meal]: v } })}
          />
        ))}
      </Section>

      {/* ── 2. Pacing & Capacity ── */}
      <Section title="Pacing & Capacity" expanded={!!expanded['pacing']} onToggle={() => toggle('pacing')} badge="Pro">
        <Toggle label="Enable Pacing Controls" description="Limit covers and reservations per time interval" checked={settings.pacing.enabled} onChange={(v) => update('pacing', { enabled: v })} />
        {settings.pacing.enabled && (
          <>
            <NumberField label="Covers Per Interval" value={settings.pacing.coversPerInterval} min={1} max={200} onChange={(v) => update('pacing', { coversPerInterval: v })} />
            <NumberField label="Interval" value={settings.pacing.intervalMinutes} min={15} max={60} suffix="min" onChange={(v) => update('pacing', { intervalMinutes: v })} />
            <NumberField label="Online Pacing" value={settings.pacing.onlinePacingPercent} min={0} max={100} suffix="%" onChange={(v) => update('pacing', { onlinePacingPercent: v })} />
            <SectionLabel>Per Meal Period Limits</SectionLabel>
            {meals.map((meal) => (
              <div key={meal} className="space-y-0">
                <p className="text-xs text-muted-foreground pt-1">{meal.charAt(0).toUpperCase() + meal.slice(1)}</p>
                <div className="flex gap-2">
                  <NumberField label="Max Covers" value={settings.pacing.perMealPeriod[meal].maxCovers} min={0} onChange={(v) => update('pacing', { perMealPeriod: { ...settings.pacing.perMealPeriod, [meal]: { ...settings.pacing.perMealPeriod[meal], maxCovers: v } } })} />
                  <NumberField label="Max Resos" value={settings.pacing.perMealPeriod[meal].maxReservations} min={0} onChange={(v) => update('pacing', { perMealPeriod: { ...settings.pacing.perMealPeriod, [meal]: { ...settings.pacing.perMealPeriod[meal], maxReservations: v } } })} />
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground pt-1">Set 0 for unlimited</p>
          </>
        )}
      </Section>

      {/* ── 3. Waitlist ── */}
      <Section title="Waitlist" expanded={!!expanded['waitlist']} onToggle={() => toggle('waitlist')}>
        <NumberField label="Max Waitlist Size" value={settings.waitlist.maxSize} min={1} max={200} onChange={(v) => update('waitlist', { maxSize: v })} />
        <NumberField label="Max Wait Time" value={settings.waitlist.maxWaitMinutes} min={15} max={240} suffix="min" onChange={(v) => update('waitlist', { maxWaitMinutes: v })} />
        <NumberField label="No-Show Grace Period" value={settings.waitlist.noShowGraceMinutes} min={5} max={60} suffix="min" onChange={(v) => update('waitlist', { noShowGraceMinutes: v })} />
        <NumberField label="Notification Expiry" value={settings.waitlist.notifyExpiryMinutes} min={3} max={30} suffix="min" onChange={(v) => update('waitlist', { notifyExpiryMinutes: v })} />
        <NumberField label="Auto Remove After Expiry" value={settings.waitlist.autoRemoveAfterExpiryMinutes} min={5} max={60} suffix="min" onChange={(v) => update('waitlist', { autoRemoveAfterExpiryMinutes: v })} />
        <Toggle label="Allow Quoted Wait Times" checked={settings.waitlist.allowQuotedTime} onChange={(v) => update('waitlist', { allowQuotedTime: v })} />
        <Toggle label="Require Party Size" checked={settings.waitlist.requirePartySize} onChange={(v) => update('waitlist', { requirePartySize: v })} />
        <Toggle label="Enable Priority Levels" description="Tag guests with priority levels (VIP, Regular, etc.)" checked={settings.waitlist.priorityEnabled} onChange={(v) => update('waitlist', { priorityEnabled: v })} />
        {settings.waitlist.priorityEnabled && (
          <TagList tags={settings.waitlist.priorityTags} onChange={(v) => update('waitlist', { priorityTags: v })} label="Priority Tags" placeholder="Add priority level..." />
        )}
      </Section>

      {/* ── 4. Turn Time & Estimation ── */}
      <Section title="Turn Time & Estimation" expanded={!!expanded['estimation']} onToggle={() => toggle('estimation')}>
        <Toggle label="Enable Wait Estimation" checked={settings.estimation.enabled} onChange={(v) => update('estimation', { enabled: v })} />
        {settings.estimation.enabled && (
          <>
            <Toggle label="Use Historical Data" description="Weight estimates based on actual turn times" checked={settings.estimation.useHistoricalData} onChange={(v) => update('estimation', { useHistoricalData: v })} />
            {settings.estimation.useHistoricalData && (
              <NumberField label="Historical Weight" value={settings.estimation.historicalWeight} min={0} max={1} step={0.1} onChange={(v) => update('estimation', { historicalWeight: v })} />
            )}
            <SectionLabel>Default Turn Times by Party Size</SectionLabel>
            {([['small', '1-2 guests'], ['medium', '3-4 guests'], ['large', '5-6 guests'], ['xlarge', '7+ guests']] as const).map(([key, label]) => (
              <NumberField key={key} label={label} value={settings.estimation.defaultTurnMinutes[key]} min={15} max={180} suffix="min" onChange={(v) => update('estimation', { defaultTurnMinutes: { ...settings.estimation.defaultTurnMinutes, [key]: v } })} />
            ))}
            <SectionLabel>Override by Table Type</SectionLabel>
            {([['bar', 'Bar Seating'], ['booth', 'Booth'], ['patio', 'Patio'], ['highTop', 'High Top']] as const).map(([key, label]) => (
              <NumberField key={key} label={label} value={settings.estimation.byTableType[key]} min={0} max={180} suffix="min" onChange={(v) => update('estimation', { byTableType: { ...settings.estimation.byTableType, [key]: v } })} />
            ))}
            <p className="text-[10px] text-muted-foreground">Set 0 to use party size default</p>
            <SectionLabel>Day of Week Multipliers</SectionLabel>
            {(Object.entries(dayLabels) as [keyof typeof dayLabels, string][]).map(([key, label]) => (
              <NumberField key={key} label={label} value={settings.estimation.dayOfWeekMultiplier[key]} min={0.5} max={2.0} step={0.05} suffix="x" onChange={(v) => update('estimation', { dayOfWeekMultiplier: { ...settings.estimation.dayOfWeekMultiplier, [key]: v } })} />
            ))}
          </>
        )}
      </Section>

      {/* ── 5. Deposits & No-Show Protection ── */}
      <Section title="Deposits & No-Show Protection" expanded={!!expanded['deposits']} onToggle={() => toggle('deposits')}>
        <Toggle label="Require Deposits" description="Collect a deposit when guests book" checked={settings.deposits.enabled} onChange={(v) => update('deposits', { enabled: v })} />
        {settings.deposits.enabled && (
          <>
            <SelectField label="Deposit Mode" value={settings.deposits.mode} onChange={(v) => update('deposits', { mode: v as 'per_person' | 'flat' | 'percentage' })} options={[{ value: 'per_person', label: 'Per Person' }, { value: 'flat', label: 'Flat Amount' }, { value: 'percentage', label: '% of Estimated' }]} />
            {settings.deposits.mode !== 'percentage' && (
              <CentsField label="Deposit Amount" value={settings.deposits.amountCents} onChange={(v) => update('deposits', { amountCents: v })} />
            )}
            {settings.deposits.mode === 'percentage' && (
              <NumberField label="Percentage" value={settings.deposits.percentOfEstimate} min={0} max={100} suffix="%" onChange={(v) => update('deposits', { percentOfEstimate: v })} />
            )}
            <NumberField label="Min Party Size for Deposit" value={settings.deposits.minPartySizeForDeposit} min={1} max={99} onChange={(v) => update('deposits', { minPartySizeForDeposit: v })} />
            <NumberField label="Refundable Until" value={settings.deposits.refundableUntilHoursBefore} min={0} max={72} suffix="hrs before" onChange={(v) => update('deposits', { refundableUntilHoursBefore: v })} />
          </>
        )}
        <Toggle label="No-Show Fee" description="Charge guests who don't show up" checked={settings.deposits.noShowFeeEnabled} onChange={(v) => update('deposits', { noShowFeeEnabled: v })} />
        {settings.deposits.noShowFeeEnabled && (
          <CentsField label="No-Show Fee" value={settings.deposits.noShowFeeCents} onChange={(v) => update('deposits', { noShowFeeCents: v })} />
        )}
        <Toggle label="Late Cancellation Fee" checked={settings.deposits.lateCancellationEnabled} onChange={(v) => update('deposits', { lateCancellationEnabled: v })} />
        {settings.deposits.lateCancellationEnabled && (
          <>
            <NumberField label="Cancellation Window" value={settings.deposits.lateCancellationHoursBefore} min={1} max={72} suffix="hrs before" onChange={(v) => update('deposits', { lateCancellationHoursBefore: v })} />
            <CentsField label="Cancellation Fee" value={settings.deposits.lateCancellationFeeCents} onChange={(v) => update('deposits', { lateCancellationFeeCents: v })} />
          </>
        )}
      </Section>

      {/* ── 6. Notifications ── */}
      <Section title="Notifications" expanded={!!expanded['notifications']} onToggle={() => toggle('notifications')}>
        <Toggle label="SMS Notifications" checked={settings.notifications.smsEnabled} onChange={(v) => update('notifications', { smsEnabled: v })} />
        <Toggle label="Email Notifications" checked={settings.notifications.emailEnabled} onChange={(v) => update('notifications', { emailEnabled: v })} />
        <Toggle label="Auto-Send Confirmation" checked={settings.notifications.autoConfirmation} onChange={(v) => update('notifications', { autoConfirmation: v })} />
        <Toggle label="Auto-Send Reminder" checked={settings.notifications.autoReminder} onChange={(v) => update('notifications', { autoReminder: v })} />
        {settings.notifications.autoReminder && (
          <>
            <NumberField label="First Reminder" value={settings.notifications.reminderHoursBefore} min={1} max={48} suffix="hrs before" onChange={(v) => update('notifications', { reminderHoursBefore: v })} />
            <NumberField label="Second Reminder" value={settings.notifications.secondReminderHoursBefore} min={0} max={24} suffix="hrs before" onChange={(v) => update('notifications', { secondReminderHoursBefore: v })} />
            <p className="text-[10px] text-muted-foreground">Set 0 to disable second reminder</p>
          </>
        )}
        <Toggle label="Alert on Waitlist Ready" checked={settings.notifications.waitlistReadyAlert} onChange={(v) => update('notifications', { waitlistReadyAlert: v })} />
        <Toggle label="Send on Cancellation" checked={settings.notifications.sendOnCancellation} onChange={(v) => update('notifications', { sendOnCancellation: v })} />
        <Toggle label="Send on Modification" checked={settings.notifications.sendOnModification} onChange={(v) => update('notifications', { sendOnModification: v })} />
        {settings.notifications.smsEnabled && (
          <TextField value={settings.notifications.smsFromNumber ?? ''} onChange={(v) => update('notifications', { smsFromNumber: v || null })} label="SMS From #" placeholder="+1234567890" />
        )}
        <SectionLabel>Message Templates</SectionLabel>
        <p className="text-[10px] text-muted-foreground pb-1">Variables: {'{guest_name}'}, {'{party_size}'}, {'{date}'}, {'{time}'}, {'{restaurant_name}'}, {'{wait_time}'}, {'{expiry_minutes}'}</p>
        <TextAreaField label="Confirmation SMS" value={settings.notifications.templates.confirmationSms} onChange={(v) => update('notifications', { templates: { ...settings.notifications.templates, confirmationSms: v } })} />
        <TextAreaField label="Confirmation Email" value={settings.notifications.templates.confirmationEmail} onChange={(v) => update('notifications', { templates: { ...settings.notifications.templates, confirmationEmail: v } })} />
        <TextAreaField label="Reminder SMS" value={settings.notifications.templates.reminderSms} onChange={(v) => update('notifications', { templates: { ...settings.notifications.templates, reminderSms: v } })} />
        <TextAreaField label="Waitlist Ready SMS" value={settings.notifications.templates.waitlistReadySms} onChange={(v) => update('notifications', { templates: { ...settings.notifications.templates, waitlistReadySms: v } })} />
        <TextAreaField label="Waitlist Added SMS" value={settings.notifications.templates.waitlistAddedSms} onChange={(v) => update('notifications', { templates: { ...settings.notifications.templates, waitlistAddedSms: v } })} />
        <TextAreaField label="Cancellation SMS" value={settings.notifications.templates.cancellationSms} onChange={(v) => update('notifications', { templates: { ...settings.notifications.templates, cancellationSms: v } })} />
      </Section>

      {/* ── 7. Table Management ── */}
      <Section title="Table Management" expanded={!!expanded['tableManagement']} onToggle={() => toggle('tableManagement')}>
        <Toggle label="Auto-Assign Tables" description="Automatically suggest best table for walk-ins and reservations" checked={settings.tableManagement.autoAssignEnabled} onChange={(v) => update('tableManagement', { autoAssignEnabled: v })} />
        <Toggle label="Allow Table Combinations" checked={settings.tableManagement.allowCombinations} onChange={(v) => update('tableManagement', { allowCombinations: v })} />
        {settings.tableManagement.allowCombinations && (
          <NumberField label="Max Tables to Combine" value={settings.tableManagement.maxCombinedTables} min={2} max={10} onChange={(v) => update('tableManagement', { maxCombinedTables: v })} />
        )}
        <NumberField label="Table Hold Time" value={settings.tableManagement.holdTimeMinutes} min={5} max={30} suffix="min" onChange={(v) => update('tableManagement', { holdTimeMinutes: v })} />
        <NumberField label="Late Arrival Grace" value={settings.tableManagement.lateArrivalGraceMinutes} min={5} max={30} suffix="min" onChange={(v) => update('tableManagement', { lateArrivalGraceMinutes: v })} />
        <NumberField label="Auto-Release After Grace" value={settings.tableManagement.autoReleaseAfterGraceMinutes} min={0} max={60} suffix="min" onChange={(v) => update('tableManagement', { autoReleaseAfterGraceMinutes: v })} />
        <p className="text-[10px] text-muted-foreground">Set 0 to disable auto-release</p>
        <SectionLabel>Assignment Scoring Weights</SectionLabel>
        <NumberField label="Capacity Fit" value={settings.tableManagement.preferenceWeights.capacityFit} min={0} max={1} step={0.1} onChange={(v) => update('tableManagement', { preferenceWeights: { ...settings.tableManagement.preferenceWeights, capacityFit: v } })} />
        <NumberField label="Seating Preference" value={settings.tableManagement.preferenceWeights.seatingPreference} min={0} max={1} step={0.1} onChange={(v) => update('tableManagement', { preferenceWeights: { ...settings.tableManagement.preferenceWeights, seatingPreference: v } })} />
        <NumberField label="Server Balance" value={settings.tableManagement.preferenceWeights.serverBalance} min={0} max={1} step={0.1} onChange={(v) => update('tableManagement', { preferenceWeights: { ...settings.tableManagement.preferenceWeights, serverBalance: v } })} />
        <NumberField label="VIP Preference" value={settings.tableManagement.preferenceWeights.vipPreference} min={0} max={1} step={0.1} onChange={(v) => update('tableManagement', { preferenceWeights: { ...settings.tableManagement.preferenceWeights, vipPreference: v } })} />
        <NumberField label="Min Capacity Utilization" value={settings.tableManagement.minCapacityUtilization} min={0} max={1} step={0.1} onChange={(v) => update('tableManagement', { minCapacityUtilization: v })} />
        <NumberField label="Max Capacity Overflow" value={settings.tableManagement.maxCapacityOverflow} min={0} max={4} onChange={(v) => update('tableManagement', { maxCapacityOverflow: v })} />
      </Section>

      {/* ── 8. Server Rotation ── */}
      <Section title="Server Rotation" expanded={!!expanded['serverRotation']} onToggle={() => toggle('serverRotation')}>
        <SelectField label="Rotation Method" value={settings.serverRotation.method} onChange={(v) => update('serverRotation', { method: v as 'round_robin' | 'cover_balance' | 'manual' })} options={[{ value: 'round_robin', label: 'Round Robin' }, { value: 'cover_balance', label: 'Cover Balance' }, { value: 'manual', label: 'Manual' }]} />
        <Toggle label="Track Covers Per Server" checked={settings.serverRotation.trackCoversPerServer} onChange={(v) => update('serverRotation', { trackCoversPerServer: v })} />
        <NumberField label="Max Cover Difference" value={settings.serverRotation.maxCoverDifference} min={0} max={50} onChange={(v) => update('serverRotation', { maxCoverDifference: v })} />
        <Toggle label="Skip Cut Servers" description="Don't seat new guests with cut servers" checked={settings.serverRotation.skipCutServers} onChange={(v) => update('serverRotation', { skipCutServers: v })} />
        <Toggle label="Rebalance on Cut" description="Redistribute sections when a server is cut" checked={settings.serverRotation.rebalanceOnCut} onChange={(v) => update('serverRotation', { rebalanceOnCut: v })} />
      </Section>

      {/* ── 9. Guest Self-Service ── */}
      <Section title="Guest Self-Service" expanded={!!expanded['guestSelfService']} onToggle={() => toggle('guestSelfService')}>
        <Toggle label="Online Waitlist Join" description="Guests can join the waitlist from their phone" checked={settings.guestSelfService.waitlistEnabled} onChange={(v) => update('guestSelfService', { waitlistEnabled: v })} />
        <Toggle label="Online Reservations" description="Guests can make reservations online" checked={settings.guestSelfService.reservationEnabled} onChange={(v) => update('guestSelfService', { reservationEnabled: v })} />
        <Toggle label="QR Code Check-In" checked={settings.guestSelfService.qrCodeEnabled} onChange={(v) => update('guestSelfService', { qrCodeEnabled: v })} />
        <Toggle label="Show Menu While Waiting" checked={settings.guestSelfService.showMenuWhileWaiting} onChange={(v) => update('guestSelfService', { showMenuWhileWaiting: v })} />
        <Toggle label="Show Estimated Wait Time" checked={settings.guestSelfService.showEstimatedWait} onChange={(v) => update('guestSelfService', { showEstimatedWait: v })} />
        <Toggle label="Show Queue Position" checked={settings.guestSelfService.showQueuePosition} onChange={(v) => update('guestSelfService', { showQueuePosition: v })} />
        <Toggle label="Allow Self-Cancellation" checked={settings.guestSelfService.allowCancellation} onChange={(v) => update('guestSelfService', { allowCancellation: v })} />
        <Toggle label="Require Phone Verification" checked={settings.guestSelfService.requirePhoneVerification} onChange={(v) => update('guestSelfService', { requirePhoneVerification: v })} />
      </Section>

      {/* ── 10. Schedule & Exceptions ── */}
      <Section title="Schedule & Exceptions" expanded={!!expanded['schedule']} onToggle={() => toggle('schedule')}>
        <DayCheckboxes selected={settings.schedule.closedDays} onChange={(v) => update('schedule', { closedDays: v })} />
        <Toggle label="Auto-Close on Holidays" checked={settings.schedule.holidayAutoClose} onChange={(v) => update('schedule', { holidayAutoClose: v })} />
        <TagList tags={settings.schedule.blackoutDates} onChange={(v) => update('schedule', { blackoutDates: v })} label="Blackout Dates" placeholder="YYYY-MM-DD" />
        <p className="text-[10px] text-muted-foreground">No reservations accepted on blackout dates</p>
      </Section>

      {/* ── 11. Display Options ── */}
      <Section title="Display Options" expanded={!!expanded['display']} onToggle={() => toggle('display')}>
        <SelectField label="Default View" value={settings.display.defaultView} onChange={(v) => update('display', { defaultView: v as 'map' | 'grid' })} options={[{ value: 'map', label: 'Floor Map' }, { value: 'grid', label: 'Grid View' }]} />
        <NumberField label="Auto-Refresh Interval" value={settings.display.refreshIntervalSeconds} min={5} max={120} suffix="sec" onChange={(v) => update('display', { refreshIntervalSeconds: v })} />
        <Toggle label="Show Elapsed Time on Tables" checked={settings.display.showElapsedTime} onChange={(v) => update('display', { showElapsedTime: v })} />
        <Toggle label="Show Server Names on Tables" checked={settings.display.showServerOnTables} onChange={(v) => update('display', { showServerOnTables: v })} />
        <Toggle label="Show Cover Count" checked={settings.display.showCoverCount} onChange={(v) => update('display', { showCoverCount: v })} />
        <Toggle label="Show Table Status" checked={settings.display.showTableStatus} onChange={(v) => update('display', { showTableStatus: v })} />
        <Toggle label="Auto-Select Meal Period" checked={settings.display.autoSelectMealPeriod} onChange={(v) => update('display', { autoSelectMealPeriod: v })} />
        <Toggle label="Color-Code by Status" checked={settings.display.colorCodeByStatus} onChange={(v) => update('display', { colorCodeByStatus: v })} />
        <Toggle label="Color-Code by Server" checked={settings.display.colorCodeByServer} onChange={(v) => update('display', { colorCodeByServer: v })} />
        <Toggle label="Compact Mode" description="Smaller cards and tighter spacing" checked={settings.display.compactMode} onChange={(v) => update('display', { compactMode: v })} />
        <SectionLabel>Meal Period Schedule</SectionLabel>
        {meals.map((meal) => (
          <div key={meal} className="flex items-center gap-2 py-1">
            <span className="text-sm text-foreground w-20">{meal.charAt(0).toUpperCase() + meal.slice(1)}</span>
            <TimeField label="" value={settings.display.mealPeriodSchedule[meal].start} onChange={(v) => update('display', { mealPeriodSchedule: { ...settings.display.mealPeriodSchedule, [meal]: { ...settings.display.mealPeriodSchedule[meal], start: v } } })} />
            <span className="text-xs text-muted-foreground">to</span>
            <TimeField label="" value={settings.display.mealPeriodSchedule[meal].end} onChange={(v) => update('display', { mealPeriodSchedule: { ...settings.display.mealPeriodSchedule, [meal]: { ...settings.display.mealPeriodSchedule[meal], end: v } } })} />
          </div>
        ))}
      </Section>

      {/* ── 12. Sounds & Alerts ── */}
      <Section title="Sounds & Alerts" expanded={!!expanded['alerts']} onToggle={() => toggle('alerts')}>
        <Toggle label="Enable Sounds" checked={settings.alerts.soundEnabled} onChange={(v) => update('alerts', { soundEnabled: v })} />
        {settings.alerts.soundEnabled && (
          <>
            <Toggle label="New Reservation Sound" checked={settings.alerts.newReservationSound} onChange={(v) => update('alerts', { newReservationSound: v })} />
            <Toggle label="Waitlist Entry Sound" checked={settings.alerts.waitlistEntrySound} onChange={(v) => update('alerts', { waitlistEntrySound: v })} />
            <Toggle label="Table Ready Sound" checked={settings.alerts.tableReadySound} onChange={(v) => update('alerts', { tableReadySound: v })} />
          </>
        )}
        <NumberField label="No-Show Alert After" value={settings.alerts.noShowAlertMinutes} min={5} max={30} suffix="min" onChange={(v) => update('alerts', { noShowAlertMinutes: v })} />
        <NumberField label="Capacity Warning At" value={settings.alerts.capacityWarningPercent} min={50} max={100} suffix="%" onChange={(v) => update('alerts', { capacityWarningPercent: v })} />
        <NumberField label="Long Wait Alert After" value={settings.alerts.longWaitAlertMinutes} min={15} max={120} suffix="min" onChange={(v) => update('alerts', { longWaitAlertMinutes: v })} />
        <NumberField label="Overdue Reservation Alert" value={settings.alerts.overdueReservationMinutes} min={5} max={30} suffix="min" onChange={(v) => update('alerts', { overdueReservationMinutes: v })} />
      </Section>

      {/* ── 13. Guest Profile ── */}
      <Section title="Guest Profile & Tags" expanded={!!expanded['guestProfile']} onToggle={() => toggle('guestProfile')}>
        <Toggle label="Enable Guest Tags" checked={settings.guestProfile.enableTags} onChange={(v) => update('guestProfile', { enableTags: v })} />
        <Toggle label="Track Visit History" checked={settings.guestProfile.trackVisitHistory} onChange={(v) => update('guestProfile', { trackVisitHistory: v })} />
        <Toggle label="Show Guest Notes" checked={settings.guestProfile.showGuestNotes} onChange={(v) => update('guestProfile', { showGuestNotes: v })} />
        {settings.guestProfile.enableTags && (
          <TagList tags={settings.guestProfile.defaultTags} onChange={(v) => update('guestProfile', { defaultTags: v })} label="Default Tags" placeholder="Add tag..." />
        )}
        <TagList tags={settings.guestProfile.occasionOptions} onChange={(v) => update('guestProfile', { occasionOptions: v })} label="Occasion Options" placeholder="Add occasion..." />
        <TagList tags={settings.guestProfile.seatingPreferences} onChange={(v) => update('guestProfile', { seatingPreferences: v })} label="Seating Preferences" placeholder="Add preference..." />
      </Section>
    </div>
  );
}
