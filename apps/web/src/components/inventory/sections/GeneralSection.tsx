'use client';

import { useState, useMemo, useEffect } from 'react';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { useAllCategories } from '@/hooks/use-catalog';
import type { CategoryRow } from '@/types/catalog';
import type { ItemFormState } from '../ItemEditDrawer';

const ITEM_TYPES = [
  { value: 'retail', label: 'Retail' },
  { value: 'food', label: 'Food' },
  { value: 'beverage', label: 'Beverage' },
  { value: 'service', label: 'Service' },
  { value: 'green_fee', label: 'Green Fee' },
  { value: 'rental', label: 'Rental' },
] as const;

interface GeneralSectionProps {
  form: ItemFormState;
  onUpdate: (updates: Partial<ItemFormState>) => void;
}

export function GeneralSection({ form, onUpdate }: GeneralSectionProps) {
  // Single hook call — departments, subDepts, categories all derived in-memory
  const { data: allCategories } = useAllCategories();
  const cats: CategoryRow[] = allCategories ?? [];

  // Derive dropdown lists from the flat category array (no extra API calls)
  const departmentList = useMemo(() => cats.filter((c) => c.parentId === null), [cats]);

  // Resolve initial hierarchy from form.categoryId by walking up the tree
  const resolvedHierarchy = useMemo(() => {
    if (!form.categoryId || !cats.length) {
      return { departmentId: '', subDepartmentId: '' };
    }
    const category = cats.find((c: CategoryRow) => c.id === form.categoryId);
    if (!category) return { departmentId: '', subDepartmentId: '' };
    const subDept = cats.find((c: CategoryRow) => c.id === category.parentId);
    if (!subDept) return { departmentId: '', subDepartmentId: '' };
    const dept = cats.find((c: CategoryRow) => c.id === subDept.parentId);
    return {
      departmentId: dept?.id ?? subDept.parentId ?? '',
      subDepartmentId: subDept.id,
    };
  }, [form.categoryId, cats]);

  // Local cascade state for top-down navigation
  const [departmentId, setDepartmentId] = useState(resolvedHierarchy.departmentId);
  const [subDepartmentId, setSubDepartmentId] = useState(resolvedHierarchy.subDepartmentId);

  // Sync when resolved hierarchy changes (e.g., full API data arrives after pre-seed)
  useEffect(() => {
    if (resolvedHierarchy.departmentId) setDepartmentId(resolvedHierarchy.departmentId);
    if (resolvedHierarchy.subDepartmentId) setSubDepartmentId(resolvedHierarchy.subDepartmentId);
  }, [resolvedHierarchy.departmentId, resolvedHierarchy.subDepartmentId]);

  // Derive filtered lists in-memory from the already-loaded flat array
  const subDepartmentList = useMemo(
    () => (departmentId ? cats.filter((c) => c.parentId === departmentId) : []),
    [cats, departmentId],
  );
  const categoryList = useMemo(
    () => (subDepartmentId ? cats.filter((c) => c.parentId === subDepartmentId) : []),
    [cats, subDepartmentId],
  );

  return (
    <CollapsibleSection id="general" title="General">
      <div className="space-y-3">
        {/* Item Name */}
        <div>
          <label htmlFor="edit-name" className="mb-1 block text-xs font-medium text-foreground">
            Item Name <span className="text-red-500">*</span>
          </label>
          <input
            id="edit-name"
            type="text"
            value={form.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Item Type + Description row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-type" className="mb-1 block text-xs font-medium text-foreground">
              Item Type
            </label>
            <select
              id="edit-type"
              value={form.itemType}
              onChange={(e) => onUpdate({ itemType: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-desc" className="mb-1 block text-xs font-medium text-foreground">
              Description
            </label>
            <input
              id="edit-desc"
              type="text"
              value={form.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Optional"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Department → SubDepartment → Category cascade */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="edit-dept" className="mb-1 block text-xs font-medium text-foreground">
              Department
            </label>
            <select
              id="edit-dept"
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setSubDepartmentId('');
                onUpdate({ categoryId: null });
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Select...</option>
              {departmentList.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-subdept" className="mb-1 block text-xs font-medium text-foreground">
              Sub Dept
            </label>
            <select
              id="edit-subdept"
              value={subDepartmentId}
              onChange={(e) => {
                setSubDepartmentId(e.target.value);
                onUpdate({ categoryId: null });
              }}
              disabled={!departmentId}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Select...</option>
              {subDepartmentList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-cat" className="mb-1 block text-xs font-medium text-foreground">
              Category
            </label>
            <select
              id="edit-cat"
              value={form.categoryId ?? ''}
              onChange={(e) => onUpdate({ categoryId: e.target.value || null })}
              disabled={!subDepartmentId}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Select...</option>
              {categoryList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
