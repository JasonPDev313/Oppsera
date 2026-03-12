'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, Lock, Layers, AlertCircle } from 'lucide-react';
import { useFetch } from '@/hooks/use-fetch';
import { useMutation } from '@/hooks/use-mutation';
import { apiFetch } from '@/lib/api-client';
import { useDepartments, useSubDepartments, useCategories } from '@/hooks/use-catalog';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// ── Types ───────────────────────────────────────────────────────────

interface CourseDefinition {
  id: string;
  courseNumber: number;
  courseName: string;
  isActive: boolean;
}

interface CourseRuleListItem {
  id: string;
  scopeType: string;
  scopeId: string;
  scopeName: string | null;
  defaultCourseNumber: number | null;
  allowedCourseNumbers: number[] | null;
  lockCourse: boolean;
  isActive: boolean;
  staleDefault?: boolean;
}

// ── Styling ─────────────────────────────────────────────────────────

const labelCls = 'block text-sm font-medium text-zinc-300 mb-1';
const selectCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const btnPrimary = 'inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50';
const btnDanger = 'inline-flex items-center gap-1 rounded-md p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors';

function scopeLabel(scopeType: string): string {
  const labels: Record<string, string> = {
    department: 'Department',
    sub_department: 'Sub-Dept',
    category: 'Category',
    item: 'Item',
  };
  return labels[scopeType] ?? scopeType;
}

function scopeBadgeColor(scopeType: string): string {
  const colors: Record<string, string> = {
    department: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    sub_department: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    category: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    item: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  };
  return colors[scopeType] ?? 'bg-zinc-700/50 text-zinc-400 border-zinc-600';
}

// ── Component ───────────────────────────────────────────────────────

export function CoursingRulesPanel() {
  const { toast } = useToast();

  // Fetch existing data
  const { data: defsData } = useFetch<{ data: CourseDefinition[] }>('/api/v1/fnb/course-definitions');
  const { data: rulesData, mutate: refreshRules } = useFetch<{ data: CourseRuleListItem[] }>('/api/v1/fnb/course-rules');
  const definitions = defsData?.data ?? [];
  const rules = rulesData?.data ?? [];
  const activeDefs = definitions.filter((d) => d.isActive);

  // Form state for adding a new rule
  const [scopeType, setScopeType] = useState<'department' | 'sub_department' | 'category'>('department');
  const [deptId, setDeptId] = useState('');
  const [subDeptId, setSubDeptId] = useState('');
  const [catId, setCatId] = useState('');
  const [defaultCourseNumber, setDefaultCourseNumber] = useState<number | null>(null);
  const [allowedCourses, setAllowedCourses] = useState<number[]>([]);
  const [lockCourse, setLockCourse] = useState(false);
  const [overrideItems, setOverrideItems] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CourseRuleListItem | null>(null);

  // Catalog hierarchy
  const { data: departments } = useDepartments();
  const { data: subDepartments } = useSubDepartments(deptId || undefined);
  const { data: categories } = useCategories(subDeptId || undefined);

  const deptOptions = (departments || []).map((d) => ({ value: d.id, label: d.name }));
  const subDeptOptions = (subDepartments || []).map((d) => ({ value: d.id, label: d.name }));
  const catOptions = (categories || []).map((d) => ({ value: d.id, label: d.name }));

  // Derive the actual scope ID based on scope type
  const getScopeId = useCallback(() => {
    if (scopeType === 'department') return deptId;
    if (scopeType === 'sub_department') return subDeptId;
    return catId;
  }, [scopeType, deptId, subDeptId, catId]);

  // Apply rule
  const { mutate: applyRule, isLoading: isApplying } = useMutation<void, { data: unknown }>(
    useCallback(async () => {
      const scopeId = getScopeId();
      if (!scopeId) throw new Error('Select a scope target');

      return apiFetch<{ data: unknown }>('/api/v1/fnb/course-rules/bulk-apply', {
        method: 'POST',
        body: JSON.stringify({
          scopeType,
          scopeId,
          defaultCourseNumber,
          allowedCourseNumbers: allowedCourses.length > 0 ? allowedCourses : null,
          lockCourse,
          overrideItemRules: overrideItems,
        }),
      });
    }, [scopeType, getScopeId, defaultCourseNumber, allowedCourses, lockCourse, overrideItems]),
  );

  const handleApply = async () => {
    try {
      await applyRule();
      toast.success('Coursing rule applied');
      await refreshRules();
      // Reset form
      setDefaultCourseNumber(null);
      setAllowedCourses([]);
      setLockCourse(false);
      setOverrideItems(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply rule');
    }
  };

  // Delete rule (requires confirmation)
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const clientRequestId = `del-rule-${deleteTarget.id}-${Date.now()}`;
      await apiFetch(`/api/v1/fnb/course-rules/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ clientRequestId }),
      });
      toast.success('Rule removed');
      await refreshRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete rule');
    }
    setDeleteTarget(null);
  };

  const toggleAllowed = (num: number) => {
    setAllowedCourses((prev) =>
      prev.includes(num)
        ? prev.filter((n) => n !== num)
        : [...prev, num].sort((a, b) => a - b),
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Existing Rules ────────────────────────────────────── */}
      <div>
        <h4 className="text-sm font-semibold text-zinc-200 mb-3">Active Coursing Rules</h4>
        {rules.length === 0 ? (
          <p className="text-sm text-zinc-500">No coursing rules defined yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${scopeBadgeColor(rule.scopeType)}`}>
                    {scopeLabel(rule.scopeType)}
                  </span>
                  <span className="text-sm text-zinc-200">{rule.scopeName ?? rule.scopeId}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-400 flex items-center gap-1">
                    Default: {rule.defaultCourseNumber
                      ? activeDefs.find((d) => d.courseNumber === rule.defaultCourseNumber)?.courseName ?? `#${rule.defaultCourseNumber}`
                      : '—'}
                    {rule.staleDefault && (
                      <span title="Course definition is inactive or missing">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-400">
                    Allowed: {rule.allowedCourseNumbers
                      ? rule.allowedCourseNumbers.map((n) => activeDefs.find((d) => d.courseNumber === n)?.courseName ?? `#${n}`).join(', ')
                      : 'All'}
                  </span>
                  {rule.lockCourse && (
                    <Lock className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(rule)}
                    className={btnDanger}
                    title="Remove rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add / Bulk Apply Rule ──────────────────────────────── */}
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-400" />
          <h4 className="text-sm font-semibold text-zinc-200">Apply Coursing Rule</h4>
        </div>

        {/* Scope selection */}
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Scope Level</label>
            <select
              className={selectCls}
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value as 'department' | 'sub_department' | 'category');
              }}
            >
              <option value="department">Department</option>
              <option value="sub_department">Sub-Department</option>
              <option value="category">Category</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Department</label>
            <select className={selectCls} value={deptId} onChange={(e) => { setDeptId(e.target.value); setSubDeptId(''); setCatId(''); }}>
              <option value="">Select...</option>
              {deptOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {(scopeType === 'sub_department' || scopeType === 'category') && (
            <div>
              <label className={labelCls}>Sub-Department</label>
              <select className={selectCls} value={subDeptId} onChange={(e) => { setSubDeptId(e.target.value); setCatId(''); }}>
                <option value="">Select...</option>
                {subDeptOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {scopeType === 'category' && (
            <div>
              <label className={labelCls}>Category</label>
              <select className={selectCls} value={catId} onChange={(e) => setCatId(e.target.value)}>
                <option value="">Select...</option>
                {catOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Rule definition */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Default Course</label>
            <select
              className={selectCls}
              value={defaultCourseNumber ?? ''}
              onChange={(e) => setDefaultCourseNumber(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— None —</option>
              {activeDefs.map((d) => (
                <option key={d.courseNumber} value={d.courseNumber}>
                  {d.courseName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Allowed Courses</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {activeDefs.map((d) => {
                const checked = allowedCourses.includes(d.courseNumber);
                return (
                  <button
                    key={d.courseNumber}
                    type="button"
                    onClick={() => toggleAllowed(d.courseNumber)}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      checked
                        ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {d.courseName}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2 pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lockCourse}
                onChange={(e) => setLockCourse(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/40"
              />
              <span className="text-sm text-zinc-300">Lock course</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overrideItems}
                onChange={(e) => setOverrideItems(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/40"
              />
              <span className="text-sm text-zinc-300">Clear item overrides</span>
            </label>
          </div>
        </div>

        {overrideItems && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300">
              This will remove all item-level coursing overrides under the selected scope. Items will inherit from this rule instead.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying || !getScopeId()}
          className={btnPrimary}
        >
          <Plus className="h-4 w-4" />
          {isApplying ? 'Applying...' : 'Apply Rule'}
        </button>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Coursing Rule"
        description={`Remove the ${scopeLabel(deleteTarget?.scopeType ?? '')} rule for "${deleteTarget?.scopeName ?? 'Unknown'}"? Items under this scope will fall back to parent rules.`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
