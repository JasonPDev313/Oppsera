'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Loader2, Save, Pencil, X, Monitor } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useFnbSettings } from '@/hooks/use-fnb-settings';
import { useStationManagement } from '@/hooks/use-fnb-kitchen';
import type { FnbStation } from '@/types/fnb';

// ── Course Config Panel ──────────────────────────────────────────

function CourseConfigPanel({
  courseNames,
  onSave,
  isSaving,
}: {
  courseNames: string[];
  onSave: (names: string[]) => void;
  isSaving: boolean;
}) {
  const [courses, setCourses] = useState<string[]>(courseNames);
  const isDirty = JSON.stringify(courses) !== JSON.stringify(courseNames);

  const addCourse = useCallback(() => {
    if (courses.length >= 10) return;
    setCourses((prev) => [...prev, `Course ${prev.length + 1}`]);
  }, [courses.length]);

  const removeCourse = useCallback((index: number) => {
    if (courses.length <= 1) return;
    setCourses((prev) => prev.filter((_, i) => i !== index));
  }, [courses.length]);

  const renameCourse = useCallback((index: number, name: string) => {
    setCourses((prev) => prev.map((c, i) => (i === index ? name : c)));
  }, []);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setCourses((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setCourses((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
      return next;
    });
  }, []);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold">Course Names</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure the courses available for F&B orders. Min 1, max 10.
          </p>
        </div>
        <button
          type="button"
          disabled={!isDirty || isSaving}
          onClick={() => onSave(courses)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40"
          style={{ backgroundColor: isDirty ? 'var(--color-indigo-600, #4f46e5)' : '#9ca3af' }}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>

      <div className="p-4 space-y-2">
        {courses.map((name, index) => (
          <div key={index} className="flex items-center gap-2">
            {/* Order number badge */}
            <span className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold bg-muted text-muted-foreground shrink-0">
              {index + 1}
            </span>

            {/* Name input */}
            <input
              type="text"
              value={name}
              onChange={(e) => renameCourse(index, e.target.value)}
              maxLength={50}
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder="Course name"
            />

            {/* Move up/down */}
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveUp(index)}
                className="rounded p-0.5 hover:bg-accent disabled:opacity-20 transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={index === courses.length - 1}
                onClick={() => moveDown(index)}
                className="rounded p-0.5 hover:bg-accent disabled:opacity-20 transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Delete */}
            <button
              type="button"
              disabled={courses.length <= 1}
              onClick={() => removeCourse(index)}
              className="rounded p-1.5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 disabled:opacity-20 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {/* Add course button */}
        {courses.length < 10 && (
          <button
            type="button"
            onClick={addCourse}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors w-full justify-center"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Course
          </button>
        )}
      </div>
    </div>
  );
}

// ── Auto Fire Toggle ─────────────────────────────────────────────

function AutoFireToggle({
  enabled,
  onToggle,
  isSaving,
}: {
  enabled: boolean;
  onToggle: (val: boolean) => void;
  isSaving: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold">Auto-Fire Single Course</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          When a tab has only one course, automatically fire it to the kitchen when sent.
        </p>
      </div>
      <button
        type="button"
        disabled={isSaving}
        onClick={() => onToggle(!enabled)}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        style={{ backgroundColor: enabled ? '#4f46e5' : '#d1d5db' }}
      >
        <span
          className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out"
          style={{ transform: enabled ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

// ── Station Management Panel ─────────────────────────────────────

const STATION_TYPES = [
  { value: 'prep', label: 'Prep / Kitchen' },
  { value: 'bar', label: 'Bar' },
  { value: 'expo', label: 'Expo' },
] as const;

const STATION_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
] as const;

function StationTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    prep: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
    bar: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    expo: 'bg-green-500/10 text-green-500 border-green-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${colors[type] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {type}
    </span>
  );
}

interface StationFormState {
  name: string;
  displayName: string;
  stationType: string;
  color: string;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
}

const EMPTY_FORM: StationFormState = {
  name: '',
  displayName: '',
  stationType: 'prep',
  color: '#ef4444',
  warningThresholdSeconds: 300,
  criticalThresholdSeconds: 600,
};

function StationForm({
  initial,
  onSubmit,
  onCancel,
  isActing,
  submitLabel,
}: {
  initial: StationFormState;
  onSubmit: (form: StationFormState) => void;
  onCancel: () => void;
  isActing: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<StationFormState>(initial);

  const set = useCallback((key: keyof StationFormState, val: string | number) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  }, []);

  const canSubmit = form.name.trim().length > 0 && form.displayName.trim().length > 0;

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Internal Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={40}
            placeholder="e.g. kitchen_main"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Display Name</label>
          <input
            type="text"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            maxLength={60}
            placeholder="e.g. Main Kitchen"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Station Type</label>
          <select
            value={form.stationType}
            onChange={(e) => set('stationType', e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {STATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Color</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('color', c)}
                className="h-6 w-6 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: c,
                  borderColor: form.color === c ? 'white' : 'transparent',
                  boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Warning (seconds)</label>
          <input
            type="number"
            value={form.warningThresholdSeconds}
            onChange={(e) => set('warningThresholdSeconds', Number(e.target.value))}
            min={30}
            max={3600}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground mb-1">Critical (seconds)</label>
          <input
            type="number"
            value={form.criticalThresholdSeconds}
            onChange={(e) => set('criticalThresholdSeconds', Number(e.target.value))}
            min={60}
            max={7200}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit || isActing}
          onClick={() => onSubmit(form)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-40"
        >
          {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function formatThreshold(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function StationManagementPanel({ locationId }: { locationId: string | undefined }) {
  const { stations, isLoading, isActing, createStation, updateStation, deactivateStation } =
    useStationManagement({ locationId });
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (form: StationFormState) => {
      await createStation({
        name: form.name.trim(),
        displayName: form.displayName.trim(),
        stationType: form.stationType,
        color: form.color,
        warningThresholdSeconds: form.warningThresholdSeconds,
        criticalThresholdSeconds: form.criticalThresholdSeconds,
      });
      setShowAdd(false);
    },
    [createStation],
  );

  const handleUpdate = useCallback(
    async (stationId: string, form: StationFormState) => {
      await updateStation(stationId, {
        displayName: form.displayName.trim(),
        stationType: form.stationType,
        color: form.color,
        warningThresholdSeconds: form.warningThresholdSeconds,
        criticalThresholdSeconds: form.criticalThresholdSeconds,
      });
      setEditingId(null);
    },
    [updateStation],
  );

  const handleDeactivate = useCallback(
    async (station: FnbStation) => {
      if (!confirm(`Deactivate station "${station.displayName}"? It will no longer receive tickets.`)) return;
      await deactivateStation(station.id);
    },
    [deactivateStation],
  );

  const activeStations = stations.filter((s) => s.isActive);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            KDS Stations
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Kitchen display stations for routing tickets. At least one station is required for KDS.
          </p>
        </div>
        {!showAdd && (
          <button
            type="button"
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Station
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {activeStations.length === 0 && !showAdd && (
              <div className="text-center py-6">
                <Monitor className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">No stations configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add a station to start routing kitchen tickets.
                </p>
              </div>
            )}

            {activeStations.map((station) =>
              editingId === station.id ? (
                <StationForm
                  key={station.id}
                  initial={{
                    name: station.name,
                    displayName: station.displayName,
                    stationType: station.stationType,
                    color: station.color ?? '#ef4444',
                    warningThresholdSeconds: station.warningThresholdSeconds,
                    criticalThresholdSeconds: station.criticalThresholdSeconds,
                  }}
                  onSubmit={(form) => handleUpdate(station.id, form)}
                  onCancel={() => setEditingId(null)}
                  isActing={isActing}
                  submitLabel="Update"
                />
              ) : (
                <div
                  key={station.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  {/* Color swatch */}
                  <span
                    className="h-4 w-4 rounded-full shrink-0 border border-border"
                    style={{ backgroundColor: station.color ?? '#6b7280' }}
                  />

                  {/* Name + type */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{station.displayName}</span>
                      <StationTypeBadge type={station.stationType} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        Warning: {formatThreshold(station.warningThresholdSeconds)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Critical: {formatThreshold(station.criticalThresholdSeconds)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    type="button"
                    onClick={() => { setEditingId(station.id); setShowAdd(false); }}
                    className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeactivate(station)}
                    className="rounded p-1.5 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            )}

            {showAdd && (
              <StationForm
                initial={EMPTY_FORM}
                onSubmit={handleCreate}
                onCancel={() => setShowAdd(false)}
                isActing={isActing}
                submitLabel="Create Station"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Content ─────────────────────────────────────────────────

export default function FnbSettingsContent() {
  const router = useRouter();
  const { locations } = useAuthContext();
  const locationId = locations[0]?.id;

  const { settings, isLoading, isActing, updateSetting } = useFnbSettings({
    moduleKey: 'fnb_ordering',
    locationId,
  });

  const courseNames = Array.isArray(settings.default_courses)
    ? (settings.default_courses as string[])
    : ['Apps', 'Entrees', 'Desserts'];

  const autoFireSingle = typeof settings.auto_fire_single_course === 'boolean'
    ? settings.auto_fire_single_course
    : true;

  const handleSaveCourses = useCallback(
    async (names: string[]) => {
      const filtered = names.filter((n) => n.trim().length > 0);
      if (filtered.length === 0) return;
      await updateSetting('default_courses', filtered);
    },
    [updateSetting],
  );

  const handleToggleAutoFire = useCallback(
    async (val: boolean) => {
      await updateSetting('auto_fire_single_course', val);
    },
    [updateSetting],
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center justify-center rounded-lg border border-border h-8 w-8 hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold">F&B Configuration</h1>
          <p className="text-xs text-muted-foreground">Course pacing, ordering defaults, and kitchen settings</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <CourseConfigPanel
            courseNames={courseNames}
            onSave={handleSaveCourses}
            isSaving={isActing}
          />
          <AutoFireToggle
            enabled={autoFireSingle}
            onToggle={handleToggleAutoFire}
            isSaving={isActing}
          />
          <StationManagementPanel locationId={locationId} />
        </div>
      )}
    </div>
  );
}
