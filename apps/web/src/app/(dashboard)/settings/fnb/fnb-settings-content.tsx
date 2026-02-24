'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useFnbSettings } from '@/hooks/use-fnb-settings';

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
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-surface">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-semibold">Course Names</h3>
          <p className="text-xs text-gray-500 mt-0.5">
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
            <span className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 shrink-0">
              {index + 1}
            </span>

            {/* Name input */}
            <input
              type="text"
              value={name}
              onChange={(e) => renameCourse(index, e.target.value)}
              maxLength={50}
              className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              placeholder="Course name"
            />

            {/* Move up/down */}
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveUp(index)}
                className="rounded p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-20 transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={index === courses.length - 1}
                onClick={() => moveDown(index)}
                className="rounded p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-20 transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Delete */}
            <button
              type="button"
              disabled={courses.length <= 1}
              onClick={() => removeCourse(index)}
              className="rounded p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 disabled:opacity-20 transition-colors"
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
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 transition-colors w-full justify-center"
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
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-surface p-4 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold">Auto-Fire Single Course</h3>
        <p className="text-xs text-gray-500 mt-0.5">
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
          className="flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 h-8 w-8 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold">F&B Configuration</h1>
          <p className="text-xs text-gray-500">Course pacing, ordering defaults, and kitchen settings</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
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
        </div>
      )}
    </div>
  );
}
