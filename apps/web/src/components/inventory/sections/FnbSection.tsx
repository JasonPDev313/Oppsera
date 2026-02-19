'use client';

import { useMemo } from 'react';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { Badge } from '@/components/ui/badge';
import { useModifierGroups } from '@/hooks/use-catalog';

const PREP_TIMES = [5, 10, 15, 20, 30, 45, 60] as const;

const FRACTION_OPTIONS = [
  { value: 1, label: 'Full (1)' },
  { value: 0.75, label: '¾' },
  { value: 0.5, label: '½' },
  { value: 0.25, label: '¼' },
] as const;

interface FnbSectionProps {
  metadata: Record<string, unknown>;
  onUpdateMetadata: (key: string, value: unknown) => void;
}

export function FnbSection({ metadata, onUpdateMetadata }: FnbSectionProps) {
  const prepTime = (metadata.prepTime as number) ?? '';
  const course = (metadata.course as string) ?? '';
  const allowSpecialInstructions = !!metadata.allowSpecialInstructions;
  const allowedFractions = useMemo(
    () => new Set((metadata.allowedFractions as number[]) ?? [1]),
    [metadata.allowedFractions],
  );

  const { data: allModifierGroups } = useModifierGroups();
  const groups = allModifierGroups ?? [];

  const defaultGroupIds = useMemo(
    () => new Set((metadata.defaultModifierGroupIds as string[]) ?? []),
    [metadata.defaultModifierGroupIds],
  );
  const optionalGroupIds = useMemo(
    () => new Set((metadata.optionalModifierGroupIds as string[]) ?? []),
    [metadata.optionalModifierGroupIds],
  );

  const toggleDefault = (groupId: string) => {
    const next = new Set(defaultGroupIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
      // Remove from optional if it was there
      const optNext = new Set(optionalGroupIds);
      optNext.delete(groupId);
      onUpdateMetadata('optionalModifierGroupIds', [...optNext]);
    }
    onUpdateMetadata('defaultModifierGroupIds', [...next]);
  };

  const toggleOptional = (groupId: string) => {
    const next = new Set(optionalGroupIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
      // Remove from default if it was there
      const defNext = new Set(defaultGroupIds);
      defNext.delete(groupId);
      onUpdateMetadata('defaultModifierGroupIds', [...defNext]);
    }
    onUpdateMetadata('optionalModifierGroupIds', [...next]);
  };

  return (
    <CollapsibleSection
      id="fnb"
      title="Food & Beverage"
      badge={<Badge variant="warning">F&B</Badge>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Prep Time */}
          <div>
            <label htmlFor="edit-prep" className="mb-1 block text-xs font-medium text-gray-700">
              Prep Time
            </label>
            <select
              id="edit-prep"
              value={String(prepTime)}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                onUpdateMetadata('prepTime', val);
              }}
              className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Not set</option>
              {PREP_TIMES.map((t) => (
                <option key={t} value={t}>{t} min</option>
              ))}
            </select>
          </div>

          {/* Course */}
          <div>
            <label htmlFor="edit-course" className="mb-1 block text-xs font-medium text-gray-700">
              Course
            </label>
            <input
              id="edit-course"
              type="text"
              value={course}
              onChange={(e) => onUpdateMetadata('course', e.target.value || null)}
              placeholder="e.g. Appetizer, Main, Dessert"
              className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Special Instructions toggle */}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
          <input
            type="checkbox"
            checked={allowSpecialInstructions}
            onChange={(e) => onUpdateMetadata('allowSpecialInstructions', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-700">Allow Special Instructions</span>
            <p className="text-xs text-gray-500">Let servers add custom notes for the kitchen</p>
          </div>
        </label>

        {/* Fractional Sales */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Allowed Portion Sizes</label>
          <div className="flex gap-2">
            {FRACTION_OPTIONS.map((opt) => {
              const isSelected = allowedFractions.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const next = new Set(allowedFractions);
                    if (opt.value === 1) return; // Full is always required
                    if (next.has(opt.value)) {
                      next.delete(opt.value);
                    } else {
                      next.add(opt.value);
                    }
                    const sorted = [...next].sort((a, b) => b - a);
                    onUpdateMetadata('allowedFractions', sorted);
                  }}
                  disabled={opt.value === 1}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                  } ${opt.value === 1 ? 'cursor-default opacity-70' : ''}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            Enable fractional selling (e.g., half portion). Full is always available.
          </p>
        </div>

        {/* Modifier Groups */}
        {groups.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-700">Modifier Groups</p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
              {groups.map((group) => {
                const isDefault = defaultGroupIds.has(group.id);
                const isOptional = optionalGroupIds.has(group.id);
                return (
                  <div
                    key={group.id}
                    className="flex items-center justify-between border-b border-gray-100 px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-gray-900">{group.name}</span>
                      {group.isRequired && (
                        <Badge variant="error" className="ml-1.5 text-[10px]">Required</Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleDefault(group.id)}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          isDefault
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        Default
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleOptional(group.id)}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                          isOptional
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        Optional
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400">
              Default groups open automatically when adding the item. Optional groups can be chosen by the server.
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
