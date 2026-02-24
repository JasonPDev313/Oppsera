'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, GripVertical, Trash2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';
import { useModifierGroups } from '@/hooks/use-catalog';
import { apiFetch } from '@/lib/api-client';
import type { ModifierGroupRow } from '@/types/catalog';

// ── Types ────────────────────────────────────────────────────────

interface ModifierInput {
  id?: string;
  name: string;
  priceAdjustment: string; // dollars, e.g. "1.50"
  sortOrder: number;
}

interface GroupFormData {
  name: string;
  selectionType: 'single' | 'multiple';
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: ModifierInput[];
}

const EMPTY_FORM: GroupFormData = {
  name: '',
  selectionType: 'single',
  isRequired: false,
  minSelections: 0,
  maxSelections: 1,
  modifiers: [{ name: '', priceAdjustment: '0.00', sortOrder: 0 }],
};

// ── Main Content ─────────────────────────────────────────────────

export default function ModifiersContent() {
  const { data: groups, isLoading, error, mutate } = useModifierGroups();
  const [editingGroup, setEditingGroup] = useState<ModifierGroupRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingGroup(null);
    setFormOpen(true);
  };

  const handleEdit = (group: ModifierGroupRow) => {
    setEditingGroup(group);
    setFormOpen(true);
  };

  const handleSaved = () => {
    setFormOpen(false);
    setEditingGroup(null);
    mutate();
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 rounded bg-gray-200 animate-pulse mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-500">Failed to load modifier groups</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Modifier Groups</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Create and manage modifier groups for F&B menu items (e.g., Toppings, Temperatures, Sides).
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Group
        </button>
      </div>

      {/* Groups list */}
      {(!groups || groups.length === 0) ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm font-medium text-gray-600 mb-1">No modifier groups yet</p>
          <p className="text-xs text-gray-400 mb-4">
            Create modifier groups like &quot;Cooking Temperature&quot;, &quot;Extra Toppings&quot;, or &quot;Sides&quot;.
          </p>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create First Group
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const isExpanded = expandedId === group.id;
            const modCount = group.modifiers?.filter((m) => m.isActive).length ?? 0;

            return (
              <div
                key={group.id}
                className="rounded-lg border border-gray-200 bg-white overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : group.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">{group.name}</span>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600">
                        {group.selectionType === 'single' ? 'Single' : 'Multi'}
                      </span>
                      {group.isRequired && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-600">
                          Required
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {modCount} option{modCount !== 1 ? 's' : ''}
                      {group.minSelections > 0 && ` · Min ${group.minSelections}`}
                      {group.maxSelections > 0 && ` · Max ${group.maxSelections}`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleEdit(group); }}
                    className="rounded px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    Edit
                  </button>
                </button>

                {/* Expanded: show modifier options */}
                {isExpanded && group.modifiers && (
                  <div className="px-4 pb-3 border-t border-gray-100">
                    <div className="mt-2 space-y-1">
                      {group.modifiers.filter((m) => m.isActive).map((mod) => (
                        <div
                          key={mod.id}
                          className="flex items-center justify-between rounded px-3 py-1.5 text-sm bg-gray-50"
                        >
                          <span className="text-gray-700">{mod.name}</span>
                          <span className="text-xs font-mono text-gray-500">
                            {Number(mod.priceAdjustment) > 0
                              ? `+$${Number(mod.priceAdjustment).toFixed(2)}`
                              : 'No charge'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {formOpen && (
        <ModifierGroupModal
          editingGroup={editingGroup}
          onClose={() => { setFormOpen(false); setEditingGroup(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ── Create/Edit Modal ────────────────────────────────────────────

function ModifierGroupModal({
  editingGroup,
  onClose,
  onSaved,
}: {
  editingGroup: ModifierGroupRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!editingGroup;

  const [form, setForm] = useState<GroupFormData>(() => {
    if (!editingGroup) return { ...EMPTY_FORM };
    return {
      name: editingGroup.name,
      selectionType: editingGroup.selectionType as 'single' | 'multiple',
      isRequired: editingGroup.isRequired,
      minSelections: editingGroup.minSelections,
      maxSelections: editingGroup.maxSelections,
      modifiers: (editingGroup.modifiers ?? [])
        .filter((m) => m.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => ({
          id: m.id,
          name: m.name,
          priceAdjustment: Number(m.priceAdjustment).toFixed(2),
          sortOrder: m.sortOrder,
        })),
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = <K extends keyof GroupFormData>(field: K, value: GroupFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addModifier = () => {
    setForm((prev) => ({
      ...prev,
      modifiers: [...prev.modifiers, { name: '', priceAdjustment: '0.00', sortOrder: prev.modifiers.length }],
    }));
  };

  const removeModifier = (index: number) => {
    setForm((prev) => ({
      ...prev,
      modifiers: prev.modifiers.filter((_, i) => i !== index),
    }));
  };

  const updateModifier = (index: number, field: keyof ModifierInput, value: string) => {
    setForm((prev) => {
      const mods = [...prev.modifiers];
      mods[index] = { ...mods[index]!, [field]: value };
      return { ...prev, modifiers: mods };
    });
  };

  const moveModifier = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.modifiers.length) return;
    setForm((prev) => {
      const mods = [...prev.modifiers];
      const temp = mods[index]!;
      mods[index] = mods[target]!;
      mods[target] = temp;
      return { ...prev, modifiers: mods };
    });
  };

  const handleSave = async () => {
    setError(null);

    // Validation
    if (!form.name.trim()) { setError('Group name is required'); return; }
    const activeModifiers = form.modifiers.filter((m) => m.name.trim());
    if (activeModifiers.length === 0) { setError('At least one modifier option is required'); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        selectionType: form.selectionType,
        isRequired: form.isRequired,
        minSelections: form.isRequired ? Math.max(1, form.minSelections) : form.minSelections,
        maxSelections: form.selectionType === 'single' ? 1 : form.maxSelections,
        modifiers: activeModifiers.map((m, i) => ({
          ...(m.id ? { id: m.id } : {}),
          name: m.name.trim(),
          priceAdjustment: parseFloat(m.priceAdjustment) || 0,
          sortOrder: i,
        })),
      };

      if (isEditing) {
        await apiFetch(`/api/v1/catalog/modifier-groups/${editingGroup!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/v1/catalog/modifier-groups', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900">
            {isEditing ? 'Edit Modifier Group' : 'New Modifier Group'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Group name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Group Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Cooking Temperature, Extra Toppings"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Selection type + required */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Selection Type</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button
                  type="button"
                  onClick={() => { updateField('selectionType', 'single'); updateField('maxSelections', 1); }}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    form.selectionType === 'single' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Single Choice
                </button>
                <button
                  type="button"
                  onClick={() => { updateField('selectionType', 'multiple'); updateField('maxSelections', 3); }}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    form.selectionType === 'multiple' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Multiple Choice
                </button>
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Required?</label>
              <button
                type="button"
                onClick={() => {
                  const next = !form.isRequired;
                  updateField('isRequired', next);
                  if (next && form.minSelections < 1) updateField('minSelections', 1);
                }}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 w-full"
              >
                {form.isRequired ? (
                  <ToggleRight className="h-5 w-5 text-indigo-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-gray-400" />
                )}
                <span className="text-xs font-medium text-gray-700">
                  {form.isRequired ? 'Required' : 'Optional'}
                </span>
              </button>
            </div>
          </div>

          {/* Min/Max (only for multi-select) */}
          {form.selectionType === 'multiple' && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Min Selections</label>
                <input
                  type="number"
                  min={0}
                  value={form.minSelections}
                  onChange={(e) => updateField('minSelections', parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Max Selections</label>
                <input
                  type="number"
                  min={1}
                  value={form.maxSelections}
                  onChange={(e) => updateField('maxSelections', parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Modifier options */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700">Options</label>
              <button
                type="button"
                onClick={addModifier}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                <Plus className="h-3 w-3" />
                Add Option
              </button>
            </div>

            <div className="space-y-1.5">
              {form.modifiers.map((mod, index) => (
                <div key={index} className="flex items-center gap-2">
                  {/* Drag handle (reorder via buttons) */}
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      onClick={() => moveModifier(index, -1)}
                      disabled={index === 0}
                      className="text-gray-300 hover:text-gray-500 disabled:opacity-30"
                      title="Move up"
                    >
                      <GripVertical className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Name */}
                  <input
                    type="text"
                    value={mod.name}
                    onChange={(e) => updateModifier(index, 'name', e.target.value)}
                    placeholder="Option name"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />

                  {/* Price adjustment */}
                  <div className="relative w-24 shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">+$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={mod.priceAdjustment}
                      onChange={(e) => updateModifier(index, 'priceAdjustment', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 pl-7 pr-2 py-2 text-sm text-right focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeModifier(index)}
                    disabled={form.modifiers.length <= 1}
                    className="shrink-0 rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
