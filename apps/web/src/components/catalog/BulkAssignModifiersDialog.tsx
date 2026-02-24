'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronRight, ChevronLeft, Check, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useCatalogItems, useModifierGroups, useDepartments, useSubDepartments, useCategories } from '@/hooks/use-catalog';
import { useBulkModifierAssignment } from '@/hooks/use-bulk-modifier-assignment';
import { useToast } from '@/components/ui/toast';
import type { CatalogItemRow, ModifierGroupRow } from '@/types/catalog';

interface BulkAssignModifiersDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'items' | 'groups' | 'overrides' | 'confirm';
const STEPS: Step[] = ['items', 'groups', 'overrides', 'confirm'];
const STEP_LABELS: Record<Step, string> = {
  items: 'Select Items',
  groups: 'Select Groups',
  overrides: 'Overrides',
  confirm: 'Confirm',
};

export function BulkAssignModifiersDialog({ open, onClose, onSuccess }: BulkAssignModifiersDialogProps) {
  const { toast } = useToast();
  const { assign, isLoading: assigning } = useBulkModifierAssignment();

  // Step state
  const [step, setStep] = useState<Step>('items');
  const stepIndex = STEPS.indexOf(step);

  // Item selection state
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemSearch, setItemSearch] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [subDeptFilter, setSubDeptFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

  // Group selection state
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [groupSearch, setGroupSearch] = useState('');

  // Override state
  const [overrideRequired, setOverrideRequired] = useState<boolean | null>(null);
  const [overrideMin, setOverrideMin] = useState<string>('');
  const [overrideMax, setOverrideMax] = useState<string>('');
  const [overrideInstructionMode, setOverrideInstructionMode] = useState('');
  const [promptOrder, setPromptOrder] = useState<string>('');

  // Mode
  const [assignMode, setAssignMode] = useState<'merge' | 'replace'>('merge');

  // Data
  const { data: items, isLoading: itemsLoading } = useCatalogItems({
    search: itemSearch || undefined,
    categoryId: catFilter || subDeptFilter || deptFilter || undefined,
    itemType: itemTypeFilter || undefined,
  });
  const { data: groups, isLoading: groupsLoading } = useModifierGroups();
  const { data: departments } = useDepartments();
  const { data: subDepartments } = useSubDepartments(deptFilter || undefined);
  const { data: categories } = useCategories(subDeptFilter || undefined);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('items');
      setSelectedItemIds(new Set());
      setSelectedGroupIds(new Set());
      setItemSearch('');
      setItemTypeFilter('');
      setDeptFilter('');
      setSubDeptFilter('');
      setCatFilter('');
      setGroupSearch('');
      setOverrideRequired(null);
      setOverrideMin('');
      setOverrideMax('');
      setOverrideInstructionMode('');
      setPromptOrder('');
      setAssignMode('merge');
    }
  }, [open]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!groupSearch) return groups;
    const q = groupSearch.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  // Toggle item selection
  const toggleItem = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Toggle group selection
  const toggleGroup = useCallback((id: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Select all visible items
  const selectAllItems = useCallback(() => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      for (const item of items) next.add(item.id);
      return next;
    });
  }, [items]);

  // Clear all items
  const clearAllItems = useCallback(() => {
    setSelectedItemIds(new Set());
  }, []);

  // Navigation
  const canAdvance = useMemo(() => {
    switch (step) {
      case 'items': return selectedItemIds.size > 0;
      case 'groups': return selectedGroupIds.size > 0;
      case 'overrides': return true;
      case 'confirm': return true;
    }
  }, [step, selectedItemIds.size, selectedGroupIds.size]);

  const goNext = () => {
    if (stepIndex < STEPS.length - 1 && canAdvance) {
      setStep(STEPS[stepIndex + 1]!);
    }
  };

  const goBack = () => {
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1]!);
    }
  };

  // Submit
  const handleSubmit = async () => {
    try {
      const overrides: Record<string, unknown> = {};
      if (overrideRequired !== null) overrides.overrideRequired = overrideRequired;
      if (overrideMin) overrides.overrideMinSelections = parseInt(overrideMin, 10);
      if (overrideMax) overrides.overrideMaxSelections = parseInt(overrideMax, 10);
      if (overrideInstructionMode) overrides.overrideInstructionMode = overrideInstructionMode;
      if (promptOrder) overrides.promptOrder = parseInt(promptOrder, 10);

      const result = await assign({
        itemIds: Array.from(selectedItemIds),
        modifierGroupIds: Array.from(selectedGroupIds),
        mode: assignMode,
        overrides: Object.keys(overrides).length > 0 ? overrides as any : undefined,
      });

      toast.success(
        `Assigned ${selectedGroupIds.size} group(s) to ${selectedItemIds.size} item(s). ` +
        `${result.assignedCount} created, ${result.skippedCount} skipped.`
      );
      onSuccess?.();
      onClose();
    } catch {
      toast.error('Bulk assignment failed');
    }
  };

  if (!open) return null;

  // Lookup for selected items/groups by name
  const selectedItemNames = items.filter((i) => selectedItemIds.has(i.id)).map((i) => i.name);
  const selectedGroupNames = (groups ?? []).filter((g) => selectedGroupIds.has(g.id)).map((g) => g.name);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Bulk Assign Modifier Groups</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 border-b border-gray-100 px-6 py-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              {i > 0 && <ChevronRight className="mx-1 h-4 w-4 text-gray-300" />}
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  s === step
                    ? 'bg-indigo-100 text-indigo-700'
                    : i < stepIndex
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                }`}
              >
                {i < stepIndex && <Check className="mr-1 inline h-3 w-3" />}
                {STEP_LABELS[s]}
              </span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 'items' && (
            <ItemSelectionStep
              items={items}
              isLoading={itemsLoading}
              selectedIds={selectedItemIds}
              onToggle={toggleItem}
              onSelectAll={selectAllItems}
              onClearAll={clearAllItems}
              search={itemSearch}
              onSearchChange={setItemSearch}
              itemTypeFilter={itemTypeFilter}
              onItemTypeChange={setItemTypeFilter}
              deptFilter={deptFilter}
              onDeptChange={(v) => { setDeptFilter(v); setSubDeptFilter(''); setCatFilter(''); }}
              subDeptFilter={subDeptFilter}
              onSubDeptChange={(v) => { setSubDeptFilter(v); setCatFilter(''); }}
              catFilter={catFilter}
              onCatChange={setCatFilter}
              departments={departments}
              subDepartments={subDepartments}
              categories={categories}
            />
          )}

          {step === 'groups' && (
            <GroupSelectionStep
              groups={filteredGroups}
              isLoading={groupsLoading}
              selectedIds={selectedGroupIds}
              onToggle={toggleGroup}
              search={groupSearch}
              onSearchChange={setGroupSearch}
            />
          )}

          {step === 'overrides' && (
            <OverridesStep
              overrideRequired={overrideRequired}
              onRequiredChange={setOverrideRequired}
              overrideMin={overrideMin}
              onMinChange={setOverrideMin}
              overrideMax={overrideMax}
              onMaxChange={setOverrideMax}
              overrideInstructionMode={overrideInstructionMode}
              onInstructionModeChange={setOverrideInstructionMode}
              promptOrder={promptOrder}
              onPromptOrderChange={setPromptOrder}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep
              selectedItemCount={selectedItemIds.size}
              selectedGroupCount={selectedGroupIds.size}
              selectedItemNames={selectedItemNames}
              selectedGroupNames={selectedGroupNames}
              assignMode={assignMode}
              onModeChange={setAssignMode}
              overrideRequired={overrideRequired}
              overrideMin={overrideMin}
              overrideMax={overrideMax}
              overrideInstructionMode={overrideInstructionMode}
              promptOrder={promptOrder}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <div className="text-sm text-gray-500">
            {selectedItemIds.size} item(s), {selectedGroupIds.size} group(s) selected
          </div>
          <div className="flex gap-3">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                disabled={assigning}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
            {step !== 'confirm' ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canAdvance}
                className={`inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 ${
                  !canAdvance ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={assigning}
                className={`inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 ${
                  assigning ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                {assigning ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Assign
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Step 1: Item Selection ────────────────────────────────────────

interface CategoryOption {
  id: string;
  name: string;
}

function ItemSelectionStep({
  items,
  isLoading,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  search,
  onSearchChange,
  itemTypeFilter,
  onItemTypeChange,
  deptFilter,
  onDeptChange,
  subDeptFilter,
  onSubDeptChange,
  catFilter,
  onCatChange,
  departments,
  subDepartments,
  categories,
}: {
  items: CatalogItemRow[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  itemTypeFilter: string;
  onItemTypeChange: (v: string) => void;
  deptFilter: string;
  onDeptChange: (v: string) => void;
  subDeptFilter: string;
  onSubDeptChange: (v: string) => void;
  catFilter: string;
  onCatChange: (v: string) => void;
  departments: CategoryOption[];
  subDepartments: CategoryOption[];
  categories: CategoryOption[];
}) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search items..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <select
          value={itemTypeFilter}
          onChange={(e) => onItemTypeChange(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">All Types</option>
          <option value="food_item">Food</option>
          <option value="beverage">Beverage</option>
          <option value="retail_good">Retail</option>
          <option value="service">Service</option>
          <option value="package">Package</option>
        </select>
      </div>

      {/* Hierarchy filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={deptFilter}
          onChange={(e) => onDeptChange(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {deptFilter && subDepartments.length > 0 && (
          <select
            value={subDeptFilter}
            onChange={(e) => onSubDeptChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">All Sub-Depts</option>
            {subDepartments.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {subDeptFilter && categories.length > 0 && (
          <select
            value={catFilter}
            onChange={(e) => onCatChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Select all / clear */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {selectedIds.size} item(s) selected
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Select all visible ({items.length})
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Item list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="sm" label="Loading items..." />
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">No items found</p>
      ) : (
        <div className="max-h-[40vh] space-y-1 overflow-y-auto rounded-lg border border-gray-200">
          {items.map((item) => (
            <label
              key={item.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${
                selectedIds.has(item.id) ? 'bg-indigo-50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => onToggle(item.id)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">{item.name}</span>
                  {item.sku && (
                    <span className="shrink-0 font-mono text-xs text-gray-400">{item.sku}</span>
                  )}
                </div>
                <div className="flex gap-2 text-xs text-gray-500">
                  <span>{item.categoryName || item.departmentName || '-'}</span>
                  <span>${Number(item.defaultPrice).toFixed(2)}</span>
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Group Selection ───────────────────────────────────────

function GroupSelectionStep({
  groups,
  isLoading,
  selectedIds,
  onToggle,
  search,
  onSearchChange,
}: {
  groups: ModifierGroupRow[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search modifier groups..."
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      <span className="text-sm text-gray-500">{selectedIds.size} group(s) selected</span>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="sm" label="Loading groups..." />
        </div>
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">No modifier groups found</p>
      ) : (
        <div className="max-h-[40vh] space-y-1 overflow-y-auto rounded-lg border border-gray-200">
          {groups.map((group) => (
            <label
              key={group.id}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50 ${
                selectedIds.has(group.id) ? 'bg-indigo-50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(group.id)}
                onChange={() => onToggle(group.id)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">{group.name}</span>
                  <Badge variant={group.isRequired ? 'warning' : 'neutral'}>
                    {group.isRequired ? 'Required' : 'Optional'}
                  </Badge>
                  {group.instructionMode && group.instructionMode !== 'none' && (
                    <Badge variant="info">{group.instructionMode}</Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {group.modifiers?.length ?? 0} option(s)
                  {group.minSelections > 0 && ` · min ${group.minSelections}`}
                  {group.maxSelections > 0 && ` · max ${group.maxSelections}`}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 3: Overrides (optional) ──────────────────────────────────

function OverridesStep({
  overrideRequired,
  onRequiredChange,
  overrideMin,
  onMinChange,
  overrideMax,
  onMaxChange,
  overrideInstructionMode,
  onInstructionModeChange,
  promptOrder,
  onPromptOrderChange,
}: {
  overrideRequired: boolean | null;
  onRequiredChange: (v: boolean | null) => void;
  overrideMin: string;
  onMinChange: (v: string) => void;
  overrideMax: string;
  onMaxChange: (v: string) => void;
  overrideInstructionMode: string;
  onInstructionModeChange: (v: string) => void;
  promptOrder: string;
  onPromptOrderChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        These overrides are optional. They apply per-assignment and override the group defaults for the selected items.
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Required override */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Required Override</label>
          <select
            value={overrideRequired === null ? '' : overrideRequired ? 'true' : 'false'}
            onChange={(e) => {
              const v = e.target.value;
              onRequiredChange(v === '' ? null : v === 'true');
            }}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">Use group default</option>
            <option value="true">Required</option>
            <option value="false">Optional</option>
          </select>
        </div>

        {/* Instruction mode override */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Instruction Mode Override</label>
          <select
            value={overrideInstructionMode}
            onChange={(e) => onInstructionModeChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">Use group default</option>
            <option value="none">Off</option>
            <option value="all">All Options</option>
            <option value="per_option">Per Option</option>
          </select>
        </div>

        {/* Min selections override */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Min Selections Override</label>
          <input
            type="number"
            min={0}
            value={overrideMin}
            onChange={(e) => onMinChange(e.target.value)}
            placeholder="Use group default"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Max selections override */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Max Selections Override</label>
          <input
            type="number"
            min={0}
            value={overrideMax}
            onChange={(e) => onMaxChange(e.target.value)}
            placeholder="Use group default"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Prompt order */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Prompt Order</label>
          <input
            type="number"
            min={0}
            value={promptOrder}
            onChange={(e) => onPromptOrderChange(e.target.value)}
            placeholder="0 (default)"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">Controls the display order of groups in POS</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Confirm ───────────────────────────────────────────────

function ConfirmStep({
  selectedItemCount,
  selectedGroupCount,
  selectedItemNames,
  selectedGroupNames,
  assignMode,
  onModeChange,
  overrideRequired,
  overrideMin,
  overrideMax,
  overrideInstructionMode,
  promptOrder,
}: {
  selectedItemCount: number;
  selectedGroupCount: number;
  selectedItemNames: string[];
  selectedGroupNames: string[];
  assignMode: 'merge' | 'replace';
  onModeChange: (v: 'merge' | 'replace') => void;
  overrideRequired: boolean | null;
  overrideMin: string;
  overrideMax: string;
  overrideInstructionMode: string;
  promptOrder: string;
}) {
  const hasOverrides = overrideRequired !== null || overrideMin || overrideMax || overrideInstructionMode || promptOrder;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Assignment Summary</h3>
        <div className="space-y-2 text-sm text-gray-700">
          <p>
            Assigning <span className="font-semibold">{selectedGroupCount}</span> modifier group(s) to{' '}
            <span className="font-semibold">{selectedItemCount}</span> item(s)
          </p>
          <div>
            <span className="font-medium text-gray-500">Items:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedItemNames.slice(0, 10).map((name) => (
                <Badge key={name} variant="neutral">{name}</Badge>
              ))}
              {selectedItemNames.length > 10 && (
                <Badge variant="neutral">+{selectedItemNames.length - 10} more</Badge>
              )}
            </div>
          </div>
          <div>
            <span className="font-medium text-gray-500">Groups:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedGroupNames.map((name) => (
                <Badge key={name} variant="info">{name}</Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Assignment Mode</h3>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="mode"
              checked={assignMode === 'merge'}
              onChange={() => onModeChange('merge')}
              className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Merge</span>
              <p className="text-xs text-gray-500">
                Add groups to items. Existing assignments are preserved.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="mode"
              checked={assignMode === 'replace'}
              onChange={() => onModeChange('replace')}
              className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">Replace</span>
              <p className="text-xs text-gray-500">
                Remove all existing assignments, then add selected groups.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Overrides summary */}
      {hasOverrides && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Overrides Applied</h3>
          <div className="space-y-1 text-sm text-gray-700">
            {overrideRequired !== null && (
              <p>Required: <span className="font-medium">{overrideRequired ? 'Yes' : 'No'}</span></p>
            )}
            {overrideMin && <p>Min Selections: <span className="font-medium">{overrideMin}</span></p>}
            {overrideMax && <p>Max Selections: <span className="font-medium">{overrideMax}</span></p>}
            {overrideInstructionMode && (
              <p>Instruction Mode: <span className="font-medium">{overrideInstructionMode}</span></p>
            )}
            {promptOrder && <p>Prompt Order: <span className="font-medium">{promptOrder}</span></p>}
          </div>
        </div>
      )}

      {/* Replace mode warning */}
      {assignMode === 'replace' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          Replace mode will <strong>remove all existing modifier group assignments</strong> from the selected items before assigning the new groups.
        </div>
      )}
    </div>
  );
}
