'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  X,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Search,
  FolderTree,
  Copy,
  MoreVertical,
} from 'lucide-react';
import { useModifierGroups, useModifierGroupCategories } from '@/hooks/use-catalog';
import { BulkAssignModifiersDialog } from '@/components/catalog/BulkAssignModifiersDialog';
import { apiFetch } from '@/lib/api-client';
import type { ModifierGroupRow } from '@/types/catalog';

// ── Types ────────────────────────────────────────────────────────

interface ModifierInput {
  id?: string;
  name: string;
  priceAdjustment: string;
  extraPriceDelta: string;
  kitchenLabel: string;
  allowNone: boolean;
  allowExtra: boolean;
  allowOnSide: boolean;
  isDefaultOption: boolean;
  sortOrder: number;
}

interface GroupFormData {
  name: string;
  selectionType: 'single' | 'multiple';
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  categoryId: string;
  instructionMode: 'none' | 'all' | 'per_option';
  defaultBehavior: 'none' | 'auto_select_defaults';
  channelVisibility: string[];
  sortOrder: number;
  modifiers: ModifierInput[];
}

const ALL_CHANNELS = ['pos', 'online', 'qr', 'kiosk'] as const;

const EMPTY_MODIFIER: ModifierInput = {
  name: '',
  priceAdjustment: '0.00',
  extraPriceDelta: '',
  kitchenLabel: '',
  allowNone: true,
  allowExtra: true,
  allowOnSide: true,
  isDefaultOption: false,
  sortOrder: 0,
};

const EMPTY_FORM: GroupFormData = {
  name: '',
  selectionType: 'single',
  isRequired: false,
  minSelections: 0,
  maxSelections: 1,
  categoryId: '',
  instructionMode: 'none',
  defaultBehavior: 'none',
  channelVisibility: [...ALL_CHANNELS],
  sortOrder: 0,
  modifiers: [{ ...EMPTY_MODIFIER }],
};

// ── Main Content ─────────────────────────────────────────────────

export default function ModifiersContent() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: categories, mutate: refreshCategories } = useModifierGroupCategories();
  const { data: groups, isLoading, error, mutate } = useModifierGroups(
    selectedCategoryId ? { categoryId: selectedCategoryId } : undefined,
  );

  const [editingGroup, setEditingGroup] = useState<ModifierGroupRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  // Filter groups by search term
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!searchTerm.trim()) return groups;
    const lower = searchTerm.toLowerCase();
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(lower) ||
        g.modifiers?.some((m) => m.name.toLowerCase().includes(lower)),
    );
  }, [groups, searchTerm]);

  // Build category tree (max depth 2)
  const categoryTree = useMemo(() => {
    if (!categories) return [];
    const roots = categories.filter((c) => !c.parentId);
    return roots.map((root) => ({
      ...root,
      children: categories.filter((c) => c.parentId === root.id),
    }));
  }, [categories]);

  const handleCreate = () => {
    setEditingGroup(null);
    setFormOpen(true);
  };

  const handleEdit = (group: ModifierGroupRow) => {
    setEditingGroup(group);
    setFormOpen(true);
    setMenuOpenId(null);
  };

  const handleDuplicate = async (group: ModifierGroupRow) => {
    setMenuOpenId(null);
    try {
      const payload = {
        name: `${group.name} (Copy)`,
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        categoryId: group.categoryId ?? undefined,
        instructionMode: group.instructionMode ?? 'none',
        defaultBehavior: group.defaultBehavior ?? 'none',
        channelVisibility: group.channelVisibility ?? ALL_CHANNELS,
        modifiers: (group.modifiers ?? [])
          .filter((m) => m.isActive)
          .map((m, i) => ({
            name: m.name,
            priceAdjustment: Number(m.priceAdjustment) || 0,
            extraPriceDelta: m.extraPriceDelta != null ? Number(m.extraPriceDelta) : undefined,
            kitchenLabel: m.kitchenLabel ?? undefined,
            allowNone: m.allowNone ?? true,
            allowExtra: m.allowExtra ?? true,
            allowOnSide: m.allowOnSide ?? true,
            isDefaultOption: m.isDefaultOption ?? false,
            sortOrder: i,
          })),
      };
      await apiFetch('/api/v1/catalog/modifier-groups', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      mutate();
    } catch {
      // Silently fail — user can retry
    }
  };

  const handleSaved = () => {
    setFormOpen(false);
    setEditingGroup(null);
    mutate();
  };

  // Category CRUD helpers
  const handleSaveCategory = async (name: string, parentId?: string) => {
    if (editingCategory) {
      await apiFetch(`/api/v1/catalog/modifier-group-categories/${editingCategory.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    } else {
      await apiFetch('/api/v1/catalog/modifier-group-categories', {
        method: 'POST',
        body: JSON.stringify({ name, parentId }),
      });
    }
    refreshCategories();
    setCategoryFormOpen(false);
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await apiFetch(`/api/v1/catalog/modifier-group-categories/${id}`, { method: 'DELETE' });
      refreshCategories();
      if (selectedCategoryId === id) setSelectedCategoryId(null);
    } catch {
      // Category in use — silently fail
    }
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
    <div className="flex h-full">
      {/* Left panel: Category tree */}
      <div className="w-56 shrink-0 border-r border-gray-200 overflow-y-auto p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Categories</h3>
          <button
            type="button"
            onClick={() => {
              setEditingCategory(null);
              setCategoryFormOpen(true);
            }}
            className="rounded p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Add category"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* "All" option */}
        <button
          type="button"
          onClick={() => setSelectedCategoryId(null)}
          className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-1 ${
            selectedCategoryId === null
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All Groups
        </button>

        {/* Category tree */}
        {categoryTree.map((root) => (
          <div key={root.id} className="mb-1">
            <div className="flex items-center group">
              <button
                type="button"
                onClick={() => setSelectedCategoryId(root.id)}
                className={`flex-1 text-left rounded-lg px-3 py-1.5 text-sm font-medium transition-colors truncate ${
                  selectedCategoryId === root.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FolderTree className="h-3.5 w-3.5 inline mr-1.5 opacity-50" />
                {root.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingCategory({ id: root.id, name: root.name });
                  setCategoryFormOpen(true);
                }}
                className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-400 hover:text-gray-600 transition-opacity"
                title="Edit"
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </div>

            {/* Children */}
            {root.children.map((child) => (
              <div key={child.id} className="flex items-center group pl-4">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId(child.id)}
                  className={`flex-1 text-left rounded-lg px-3 py-1 text-xs font-medium transition-colors truncate ${
                    selectedCategoryId === child.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {child.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(child.id)}
                  className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-gray-400 hover:text-red-500 transition-opacity"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 p-6 overflow-y-auto max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Modifier Groups</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage modifier groups for menu items (e.g., Toppings, Temperatures, Sides).
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBulkAssignOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Bulk Assign
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Group
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search groups or options..."
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>

        {/* Groups list */}
        {filteredGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
            <p className="text-sm font-medium text-gray-600 mb-1">
              {searchTerm ? 'No matching groups found' : 'No modifier groups yet'}
            </p>
            {!searchTerm && (
              <>
                <p className="text-xs text-gray-400 mb-4">
                  Create modifier groups like &quot;Cooking Temperature&quot;, &quot;Extra
                  Toppings&quot;, or &quot;Sides&quot;.
                </p>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create First Group
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredGroups.map((group) => {
              const isExpanded = expandedId === group.id;
              const modCount = group.modifiers?.filter((m) => m.isActive).length ?? 0;
              const instrMode = group.instructionMode;

              return (
                <div
                  key={group.id}
                  className="rounded-lg border border-gray-200 bg-white overflow-hidden transition-shadow hover:shadow-sm"
                >
                  {/* Group header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : group.id)}
                      className="shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : group.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900">{group.name}</span>
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600">
                          {group.selectionType === 'single' ? 'Single' : 'Multi'}
                        </span>
                        {group.isRequired && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-600">
                            Required
                          </span>
                        )}
                        {instrMode && instrMode !== 'none' && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600">
                            {instrMode === 'all' ? 'Instructions' : 'Per-Option'}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {modCount} option{modCount !== 1 ? 's' : ''}
                        {group.minSelections > 0 && ` · Min ${group.minSelections}`}
                        {group.maxSelections > 0 && ` · Max ${group.maxSelections}`}
                      </span>
                    </button>

                    {/* Actions menu */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setMenuOpenId(menuOpenId === group.id ? null : group.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {menuOpenId === group.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpenId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => handleEdit(group)}
                              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicate(group)}
                              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Duplicate
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded: show modifier options */}
                  {isExpanded && group.modifiers && (
                    <div className="px-4 pb-3 border-t border-gray-100">
                      <div className="mt-2 space-y-1">
                        {group.modifiers
                          .filter((m) => m.isActive)
                          .map((mod) => (
                            <div
                              key={mod.id}
                              className="flex items-center justify-between rounded px-3 py-1.5 text-sm bg-gray-50"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-gray-700">{mod.name}</span>
                                {mod.kitchenLabel && (
                                  <span className="text-[10px] text-gray-400">
                                    KDS: {mod.kitchenLabel}
                                  </span>
                                )}
                                {mod.isDefaultOption && (
                                  <span className="rounded px-1 py-0.5 text-[9px] font-medium bg-green-50 text-green-600">
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {mod.extraPriceDelta != null &&
                                  Number(mod.extraPriceDelta) > 0 && (
                                    <span className="text-[10px] text-blue-500">
                                      Extra +${Number(mod.extraPriceDelta).toFixed(2)}
                                    </span>
                                  )}
                                <span className="text-xs font-mono text-gray-500">
                                  {Number(mod.priceAdjustment) > 0
                                    ? `+$${Number(mod.priceAdjustment).toFixed(2)}`
                                    : 'No charge'}
                                </span>
                              </div>
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
      </div>

      {/* Create/Edit Modal */}
      {formOpen && (
        <ModifierGroupModal
          editingGroup={editingGroup}
          categories={categories ?? []}
          onClose={() => {
            setFormOpen(false);
            setEditingGroup(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {/* Category inline form modal */}
      {categoryFormOpen && (
        <CategoryFormModal
          editing={editingCategory}
          onSave={handleSaveCategory}
          onDelete={editingCategory ? () => handleDeleteCategory(editingCategory.id) : undefined}
          onClose={() => {
            setCategoryFormOpen(false);
            setEditingCategory(null);
          }}
        />
      )}

      {/* Bulk Assign dialog */}
      <BulkAssignModifiersDialog
        open={bulkAssignOpen}
        onClose={() => setBulkAssignOpen(false)}
        onSuccess={() => mutate()}
      />
    </div>
  );
}

// ── Category Form Modal ─────────────────────────────────────────

function CategoryFormModal({
  editing,
  onSave,
  onDelete,
  onClose,
}: {
  editing: { id: string; name: string } | null;
  onSave: (name: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          {editing ? 'Edit Category' : 'New Category'}
        </h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none mb-3"
        />
        <div className="flex gap-2">
          {editing && onDelete && (
            <button
              type="button"
              onClick={async () => {
                await onDelete();
                onClose();
              }}
              className="rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="rounded-lg px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Create/Edit Modal ────────────────────────────────────────────

function ModifierGroupModal({
  editingGroup,
  categories,
  onClose,
  onSaved,
}: {
  editingGroup: ModifierGroupRow | null;
  categories: Array<{ id: string; name: string; parentId: string | null }>;
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
      categoryId: editingGroup.categoryId ?? '',
      instructionMode: (editingGroup.instructionMode as GroupFormData['instructionMode']) ?? 'none',
      defaultBehavior:
        (editingGroup.defaultBehavior as GroupFormData['defaultBehavior']) ?? 'none',
      channelVisibility: editingGroup.channelVisibility ?? [...ALL_CHANNELS],
      sortOrder: editingGroup.sortOrder ?? 0,
      modifiers: (editingGroup.modifiers ?? [])
        .filter((m) => m.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => ({
          id: m.id,
          name: m.name,
          priceAdjustment: Number(m.priceAdjustment).toFixed(2),
          extraPriceDelta: m.extraPriceDelta != null ? Number(m.extraPriceDelta).toFixed(2) : '',
          kitchenLabel: m.kitchenLabel ?? '',
          allowNone: m.allowNone ?? true,
          allowExtra: m.allowExtra ?? true,
          allowOnSide: m.allowOnSide ?? true,
          isDefaultOption: m.isDefaultOption ?? false,
          sortOrder: m.sortOrder,
        })),
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(
    form.instructionMode !== 'none' ||
      form.defaultBehavior !== 'none' ||
      form.channelVisibility.length !== ALL_CHANNELS.length,
  );

  const updateField = <K extends keyof GroupFormData>(field: K, value: GroupFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addModifier = () => {
    setForm((prev) => ({
      ...prev,
      modifiers: [
        ...prev.modifiers,
        { ...EMPTY_MODIFIER, sortOrder: prev.modifiers.length },
      ],
    }));
  };

  const removeModifier = (index: number) => {
    setForm((prev) => ({
      ...prev,
      modifiers: prev.modifiers.filter((_, i) => i !== index),
    }));
  };

  const updateModifier = (index: number, updates: Partial<ModifierInput>) => {
    setForm((prev) => {
      const mods = [...prev.modifiers];
      mods[index] = { ...mods[index]!, ...updates };
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

  const toggleChannel = (channel: string) => {
    setForm((prev) => {
      const vis = prev.channelVisibility.includes(channel)
        ? prev.channelVisibility.filter((c) => c !== channel)
        : [...prev.channelVisibility, channel];
      return { ...prev, channelVisibility: vis };
    });
  };

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError('Group name is required');
      return;
    }
    const activeModifiers = form.modifiers.filter((m) => m.name.trim());
    if (activeModifiers.length === 0) {
      setError('At least one modifier option is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        selectionType: form.selectionType,
        isRequired: form.isRequired,
        minSelections: form.isRequired ? Math.max(1, form.minSelections) : form.minSelections,
        maxSelections: form.selectionType === 'single' ? 1 : form.maxSelections,
        categoryId: form.categoryId || undefined,
        instructionMode: form.instructionMode,
        defaultBehavior: form.defaultBehavior,
        channelVisibility: form.channelVisibility,
        sortOrder: form.sortOrder,
        modifiers: activeModifiers.map((m, i) => ({
          ...(m.id ? { id: m.id } : {}),
          name: m.name.trim(),
          priceAdjustment: parseFloat(m.priceAdjustment) || 0,
          extraPriceDelta: m.extraPriceDelta ? parseFloat(m.extraPriceDelta) : undefined,
          kitchenLabel: m.kitchenLabel.trim() || undefined,
          allowNone: m.allowNone,
          allowExtra: m.allowExtra,
          allowOnSide: m.allowOnSide,
          isDefaultOption: m.isDefaultOption,
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

  const showInstructionFields =
    form.instructionMode === 'all' || form.instructionMode === 'per_option';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
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
          {/* Row 1: Group name + Category */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Group Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g., Cooking Temperature, Extra Toppings"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="w-48">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <select
                value={form.categoryId}
                onChange={(e) => updateField('categoryId', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? '  ' : ''}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Selection type + Required */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Selection Type
              </label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button
                  type="button"
                  onClick={() => {
                    updateField('selectionType', 'single');
                    updateField('maxSelections', 1);
                  }}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    form.selectionType === 'single'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Single Choice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateField('selectionType', 'multiple');
                    updateField('maxSelections', 3);
                  }}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    form.selectionType === 'multiple'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
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

          {/* Row 3: Min/Max (multi-select only) */}
          {form.selectionType === 'multiple' && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Min Selections
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.minSelections}
                  onChange={(e) => updateField('minSelections', parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Max Selections
                </label>
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

          {/* Advanced settings toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            {showAdvanced ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-lg border border-gray-200 p-4 bg-gray-50/50">
              {/* Instruction mode */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Instruction Mode
                </label>
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  {(['none', 'all', 'per_option'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateField('instructionMode', mode)}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${
                        form.instructionMode === mode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {mode === 'none'
                        ? 'Off'
                        : mode === 'all'
                          ? 'All Options'
                          : 'Per Option'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Enable None/Extra/On Side instruction buttons in POS
                </p>
              </div>

              {/* Default behavior */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Default Behavior
                </label>
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  <button
                    type="button"
                    onClick={() => updateField('defaultBehavior', 'none')}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      form.defaultBehavior === 'none'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    None
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField('defaultBehavior', 'auto_select_defaults')}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      form.defaultBehavior === 'auto_select_defaults'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Auto-Select Defaults
                  </button>
                </div>
              </div>

              {/* Channel visibility */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Channel Visibility
                </label>
                <div className="flex gap-2">
                  {ALL_CHANNELS.map((ch) => (
                    <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.channelVisibility.includes(ch)}
                        onChange={() => toggleChannel(ch)}
                        className="h-3.5 w-3.5 rounded text-indigo-600"
                      />
                      <span className="text-xs text-gray-700 capitalize">{ch}</span>
                    </label>
                  ))}
                </div>
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

            <div className="space-y-2">
              {form.modifiers.map((mod, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-gray-200 p-3 bg-white space-y-2"
                >
                  {/* Row 1: Name + Price + Reorder + Delete */}
                  <div className="flex items-center gap-2">
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

                    <input
                      type="text"
                      value={mod.name}
                      onChange={(e) => updateModifier(index, { name: e.target.value })}
                      placeholder="Option name"
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />

                    <div className="relative w-24 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                        +$
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={mod.priceAdjustment}
                        onChange={(e) =>
                          updateModifier(index, { priceAdjustment: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 pl-7 pr-2 py-2 text-sm text-right focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    {form.defaultBehavior === 'auto_select_defaults' && (
                      <label className="flex items-center gap-1 shrink-0 cursor-pointer" title="Default option">
                        <input
                          type="checkbox"
                          checked={mod.isDefaultOption}
                          onChange={(e) =>
                            updateModifier(index, { isDefaultOption: e.target.checked })
                          }
                          className="h-3.5 w-3.5 rounded text-indigo-600"
                        />
                        <span className="text-[10px] text-gray-500">Def</span>
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={() => removeModifier(index)}
                      disabled={form.modifiers.length <= 1}
                      className="shrink-0 rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Row 2: Extra fields (only when instruction mode is active) */}
                  {showInstructionFields && (
                    <div className="flex items-center gap-3 ml-5">
                      {/* Extra price delta */}
                      <div className="relative w-24">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                          Extra$
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={mod.extraPriceDelta}
                          onChange={(e) =>
                            updateModifier(index, { extraPriceDelta: e.target.value })
                          }
                          placeholder="—"
                          className="w-full rounded border border-gray-200 pl-12 pr-1 py-1 text-xs text-right focus:border-indigo-500 outline-none"
                        />
                      </div>

                      {/* Kitchen label */}
                      <input
                        type="text"
                        value={mod.kitchenLabel}
                        onChange={(e) =>
                          updateModifier(index, { kitchenLabel: e.target.value })
                        }
                        placeholder="Kitchen label"
                        className="w-28 rounded border border-gray-200 px-2 py-1 text-xs focus:border-indigo-500 outline-none"
                      />

                      {/* Per-option instruction flags */}
                      {form.instructionMode === 'per_option' && (
                        <div className="flex items-center gap-2">
                          {(['allowNone', 'allowExtra', 'allowOnSide'] as const).map((flag) => (
                            <label key={flag} className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={mod[flag]}
                                onChange={(e) =>
                                  updateModifier(index, { [flag]: e.target.checked })
                                }
                                className="h-3 w-3 rounded text-indigo-600"
                              />
                              <span className="text-[10px] text-gray-500">
                                {flag === 'allowNone'
                                  ? 'None'
                                  : flag === 'allowExtra'
                                    ? 'Extra'
                                    : 'Side'}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
