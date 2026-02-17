'use client';

import React, { useState, useCallback } from 'react';
import { MoreVertical, Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useDepartments, useSubDepartments, useCategories } from '@/hooks/use-catalog';
import { apiFetch } from '@/lib/api-client';

interface HierarchyItem {
  id: string;
  name: string;
  isActive: boolean;
}

function HierarchyPane({
  title,
  items,
  selectedId,
  onSelect,
  onAdd,
  onRename,
  onDeactivate,
}: {
  title: string;
  items: HierarchyItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDeactivate: (id: string) => void;
}) {
  const [addMode, setAddMode] = useState(false);
  const [addName, setAddName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const handleAdd = () => {
    if (addName.trim()) {
      onAdd(addName.trim());
      setAddName('');
      setAddMode(false);
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      onRename(id, editName.trim());
      setEditingId(null);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-surface">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`relative flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 ${
              selectedId === item.id ? 'bg-indigo-50' : ''
            }`}
          >
            {editingId === item.id ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => handleRename(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(item.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="mr-2 flex-1 rounded border border-indigo-300 px-2 py-0.5 text-sm focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={`flex-1 ${!item.isActive ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {item.name}
              </span>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(menuOpen === item.id ? null : item.id);
                }}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen === item.id && (
                <div className="absolute right-0 top-full z-10 w-32 rounded-lg border border-gray-200 bg-surface py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(item.id);
                      setEditName(item.name);
                      setMenuOpen(null);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeactivateId(item.id);
                      setMenuOpen(null);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-gray-50"
                  >
                    Deactivate
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-gray-400">None yet</p>
        )}
      </div>
      <div className="border-t border-gray-200 p-3">
        {addMode ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') setAddMode(false);
              }}
              placeholder="Name..."
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAdd}
              className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddMode(true)}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600"
          >
            <Plus className="h-4 w-4" /> Add {title.replace(/s$/, '')}
          </button>
        )}
      </div>
      <ConfirmDialog
        open={!!deactivateId}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => {
          if (deactivateId) onDeactivate(deactivateId);
          setDeactivateId(null);
        }}
        title="Deactivate?"
        description="This will hide it from new selections. Existing items will not be affected."
        confirmLabel="Deactivate"
        destructive
      />
    </div>
  );
}

export default function HierarchyPage() {
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  toastRef.current = toast;
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedSubDeptId, setSelectedSubDeptId] = useState<string | null>(null);

  const { data: departments, mutate: refreshDepts } = useDepartments();
  const { data: subDepartments, mutate: refreshSubDepts } = useSubDepartments(selectedDeptId || undefined);
  const { data: categories, mutate: refreshCats } = useCategories(selectedSubDeptId || undefined);

  const createCategory = useCallback(
    async (name: string, parentId: string | null) => {
      try {
        await apiFetch('/api/v1/catalog/categories', {
          method: 'POST',
          body: JSON.stringify({ name, ...(parentId ? { parentId } : {}), sortOrder: 0 }),
        });
        toastRef.current.success(`"${name}" created`);
        refreshDepts();
        refreshSubDepts();
        refreshCats();
      } catch (err) {
        toastRef.current.error(err instanceof Error ? err.message : 'Failed to create');
      }
    },
    [refreshDepts, refreshSubDepts, refreshCats],
  );

  const renameCategory = useCallback(
    async (id: string, name: string) => {
      try {
        await apiFetch(`/api/v1/catalog/categories/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        });
        toastRef.current.success('Renamed');
        refreshDepts();
        refreshSubDepts();
        refreshCats();
      } catch (err) {
        toastRef.current.error(err instanceof Error ? err.message : 'Failed to rename');
      }
    },
    [refreshDepts, refreshSubDepts, refreshCats],
  );

  const deactivateCategory = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/v1/catalog/categories/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
        });
        toastRef.current.success('Deactivated');
        refreshDepts();
        refreshSubDepts();
        refreshCats();
      } catch (err) {
        toastRef.current.error(err instanceof Error ? err.message : 'Failed to deactivate');
      }
    },
    [refreshDepts, refreshSubDepts, refreshCats],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Catalog Hierarchy</h1>
      {/* TODO: Update backend validation in Session 8 to allow 3-level category nesting */}
      <div className="grid min-h-[500px] grid-cols-1 gap-4 md:grid-cols-3">
        <HierarchyPane
          title="Departments"
          items={departments}
          selectedId={selectedDeptId}
          onSelect={(id) => {
            setSelectedDeptId(id);
            setSelectedSubDeptId(null);
          }}
          onAdd={(name) => createCategory(name, null)}
          onRename={renameCategory}
          onDeactivate={deactivateCategory}
        />
        <HierarchyPane
          title="Sub-Departments"
          items={subDepartments}
          selectedId={selectedSubDeptId}
          onSelect={setSelectedSubDeptId}
          onAdd={(name) => {
            if (!selectedDeptId) {
              toastRef.current.error('Select a department first');
              return;
            }
            createCategory(name, selectedDeptId);
          }}
          onRename={renameCategory}
          onDeactivate={deactivateCategory}
        />
        <HierarchyPane
          title="Categories"
          items={categories}
          selectedId={null}
          onSelect={() => {}}
          onAdd={(name) => {
            if (!selectedSubDeptId) {
              toastRef.current.error('Select a sub-department first');
              return;
            }
            createCategory(name, selectedSubDeptId);
          }}
          onRename={renameCategory}
          onDeactivate={deactivateCategory}
        />
      </div>
    </div>
  );
}
