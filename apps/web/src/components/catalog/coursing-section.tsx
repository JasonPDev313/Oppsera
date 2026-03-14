'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { Lock, Unlock, Info } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────

interface CourseDefinition {
  id: string;
  courseNumber: number;
  courseName: string;
  sortOrder: number;
  isActive: boolean;
}

interface ResolvedRule {
  effectiveRule: {
    defaultCourseNumber: number | null;
    allowedCourseNumbers: number[] | null;
    lockCourse: boolean;
  };
  source: string;
  defaultSource: string;
}

export interface CoursingState {
  mode: 'inherit' | 'override';
  defaultCourseNumber: number | null;
  allowedCourseNumbers: number[] | null;
  lockCourse: boolean;
}

interface CoursingSectionProps {
  /** Item ID — null when creating a new item */
  itemId: string | null;
  /** Category ID from the form — used to preview inherited rules */
  categoryId: string | null;
  /** Current coursing state managed by parent */
  state: CoursingState;
  /** Update handler */
  onChange: (state: CoursingState) => void;
}

// ── Styling ─────────────────────────────────────────────────────────

const labelCls = 'block text-sm font-medium text-zinc-300 mb-1';
const selectCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const badgeCls = 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium';

function sourceBadge(source: string) {
  const colors: Record<string, string> = {
    department: 'bg-purple-500/20 text-purple-300',
    sub_department: 'bg-indigo-500/20 text-indigo-300',
    category: 'bg-blue-500/20 text-blue-300',
    item: 'bg-emerald-500/20 text-emerald-300',
    none: 'bg-zinc-700/50 text-zinc-400',
  };
  const labels: Record<string, string> = {
    department: 'Department',
    sub_department: 'Sub-Department',
    category: 'Category',
    item: 'Item Override',
    none: 'No Rule',
  };
  return (
    <span className={`${badgeCls} ${colors[source] ?? colors.none}`}>
      {labels[source] ?? source}
    </span>
  );
}

// ── Component ───────────────────────────────────────────────────────

export function CoursingSection({ itemId, categoryId, state, onChange }: CoursingSectionProps) {
  // Fetch course definitions for this location
  const { data: defsData } = useQuery({
    queryKey: ['fnb-course-definitions'],
    queryFn: () => apiFetch<{ data: CourseDefinition[] }>('/api/v1/fnb/course-definitions'),
  });
  const definitions = defsData?.data ?? [];

  // Fetch resolved rule for inherited preview
  const resolveUrl = itemId
    ? `/api/v1/fnb/course-rules/resolve?itemId=${itemId}`
    : categoryId
      ? `/api/v1/fnb/course-rules/resolve?categoryId=${categoryId}`
      : null;

  const { data: resolvedData } = useQuery({
    queryKey: ['fnb-course-rules-resolve', itemId, categoryId],
    queryFn: () => apiFetch<{ data: ResolvedRule }>(resolveUrl!),
    enabled: !!resolveUrl,
  });
  const resolved = resolvedData?.data ?? null;

  const setField = useCallback(<K extends keyof CoursingState>(key: K, value: CoursingState[K]) => {
    onChange({ ...state, [key]: value });
  }, [state, onChange]);

  const toggleMode = useCallback(() => {
    const newMode = state.mode === 'inherit' ? 'override' : 'inherit';
    if (newMode === 'inherit') {
      // Reset to inherit — clear overrides
      onChange({ mode: 'inherit', defaultCourseNumber: null, allowedCourseNumbers: null, lockCourse: false });
    } else {
      // Switch to override — pre-fill from inherited values
      const eff = resolved?.effectiveRule;
      onChange({
        mode: 'override',
        defaultCourseNumber: eff?.defaultCourseNumber ?? null,
        allowedCourseNumbers: eff?.allowedCourseNumbers ?? null,
        lockCourse: eff?.lockCourse ?? false,
      });
    }
  }, [state.mode, resolved, onChange]);

  const toggleAllowedCourse = useCallback((courseNum: number) => {
    const current = state.allowedCourseNumbers ?? [];
    const next = current.includes(courseNum)
      ? current.filter((n) => n !== courseNum)
      : [...current, courseNum].sort((a, b) => a - b);
    setField('allowedCourseNumbers', next.length > 0 ? next : null);
  }, [state.allowedCourseNumbers, setField]);

  if (definitions.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
        <h4 className="text-sm font-semibold text-zinc-200 mb-2">Coursing</h4>
        <p className="text-xs text-zinc-500">
          No course definitions configured for this location. Configure courses in Settings → F&B → Ordering.
        </p>
      </div>
    );
  }

  const activeDefs = definitions.filter((d) => d.isActive);

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-200">Coursing</h4>
        <button
          type="button"
          onClick={toggleMode}
          className="text-xs px-2.5 py-1 rounded-md border border-zinc-600 text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          {state.mode === 'inherit' ? 'Override for this item' : 'Use inherited coursing'}
        </button>
      </div>

      {/* Inherited preview */}
      {state.mode === 'inherit' && (
        <div className="space-y-2">
          {resolved && resolved.source !== 'none' ? (
            <>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Info className="h-3.5 w-3.5 text-zinc-500" />
                <span>Inherited from {sourceBadge(resolved.source)}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-zinc-500">Default Course</span>
                  <p className="text-zinc-200 mt-0.5">
                    {resolved.effectiveRule.defaultCourseNumber
                      ? activeDefs.find((d) => d.courseNumber === resolved.effectiveRule.defaultCourseNumber)?.courseName
                        ?? `Course ${resolved.effectiveRule.defaultCourseNumber}`
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Allowed Courses</span>
                  <p className="text-zinc-200 mt-0.5">
                    {resolved.effectiveRule.allowedCourseNumbers
                      ? resolved.effectiveRule.allowedCourseNumbers
                          .map((n) => activeDefs.find((d) => d.courseNumber === n)?.courseName ?? `#${n}`)
                          .join(', ')
                      : 'All'}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Locked</span>
                  <p className="text-zinc-200 mt-0.5 flex items-center gap-1">
                    {resolved.effectiveRule.lockCourse
                      ? <><Lock className="h-3 w-3 text-amber-400" /> Yes</>
                      : <><Unlock className="h-3 w-3 text-zinc-500" /> No</>}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-500">
              No coursing rule defined for this item&apos;s hierarchy. The POS operator will choose the course manually.
            </p>
          )}
        </div>
      )}

      {/* Override form */}
      {state.mode === 'override' && (
        <div className="space-y-3">
          {/* Default Course */}
          <div>
            <label className={labelCls}>Default Course</label>
            <select
              className={selectCls}
              value={state.defaultCourseNumber ?? ''}
              onChange={(e) => setField('defaultCourseNumber', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {activeDefs.map((d) => (
                <option key={d.courseNumber} value={d.courseNumber}>
                  {d.courseName} (Course {d.courseNumber})
                </option>
              ))}
            </select>
          </div>

          {/* Allowed Courses */}
          <div>
            <label className={labelCls}>Allowed Courses</label>
            <p className="text-xs text-zinc-500 mb-2">
              Leave all unchecked to allow any course. Check specific courses to restrict.
            </p>
            <div className="flex flex-wrap gap-2">
              {activeDefs.map((d) => {
                const checked = state.allowedCourseNumbers?.includes(d.courseNumber) ?? false;
                return (
                  <label
                    key={d.courseNumber}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAllowedCourse(d.courseNumber)}
                      className="sr-only"
                    />
                    {d.courseName}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Lock Course */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.lockCourse}
              onChange={(e) => setField('lockCourse', e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/40"
            />
            <span className="text-sm text-zinc-300">Lock course</span>
            <span className="text-xs text-zinc-500">Server cannot change course for this item</span>
          </label>
        </div>
      )}
    </div>
  );
}
