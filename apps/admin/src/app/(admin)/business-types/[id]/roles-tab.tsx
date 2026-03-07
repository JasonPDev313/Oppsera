'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
} from 'lucide-react';
import { useRoleTemplates } from '@/hooks/use-business-type-detail';
import type { RoleTemplateWithPermissions, PermissionGroup } from '@/hooks/use-business-type-detail';

function toKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function RolesTab({
  versionId,
  isReadOnly,
}: {
  versionId: string;
  isReadOnly: boolean;
}) {
  const { roles, availablePermissions, isLoading, isSaving, error, load, addRole, updateRole, deleteRole } =
    useRoleTemplates(versionId);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading && roles.length === 0) {
    return <div className="text-center text-slate-400 py-12">Loading role templates...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-500/20 text-indigo-400">
            {roles.length} role{roles.length !== 1 ? 's' : ''}
          </span>
          {isReadOnly && (
            <span className="text-xs text-amber-400">Read-only — create a new draft to edit</span>
          )}
        </div>
        {!isReadOnly && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Add Role
          </button>
        )}
      </div>

      {/* Add Role Form */}
      {showAddForm && !isReadOnly && (
        <AddRoleForm
          onAdd={async (input) => {
            await addRole(input);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
          isSaving={isSaving}
        />
      )}

      {/* Role Cards */}
      {roles.length === 0 && !showAddForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 px-6 py-12 text-center">
          <p className="text-slate-400 text-sm">
            No roles configured. Add default staff roles for this business type.
          </p>
        </div>
      )}

      {roles.map((role) => (
        <RoleCard
          key={role.id}
          role={role}
          availablePermissions={availablePermissions}
          isReadOnly={isReadOnly}
          isSaving={isSaving}
          onUpdate={updateRole}
          onDelete={deleteRole}
        />
      ))}
    </div>
  );
}

function AddRoleForm({
  onAdd,
  onCancel,
  isSaving,
}: {
  onAdd: (input: { roleName: string; roleKey: string; description?: string; permissions: string[] }) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyManual, setKeyManual] = useState(false);
  const [description, setDescription] = useState('');

  const handleNameChange = (v: string) => {
    setName(v);
    if (!keyManual) setKey(toKey(v));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !key.trim()) return;
    await onAdd({
      roleName: name.trim(),
      roleKey: key.trim(),
      description: description.trim() || undefined,
      permissions: [],
    });
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-indigo-500/50 p-5 space-y-3">
      <h4 className="text-sm font-semibold text-white">New Role</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="new-role-name" className="block text-xs text-slate-400 mb-1">Name</label>
          <input
            id="new-role-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Spa Manager"
          />
        </div>
        <div>
          <label htmlFor="new-role-key" className="block text-xs text-slate-400 mb-1">Key</label>
          <input
            id="new-role-key"
            type="text"
            value={key}
            onChange={(e) => { setKeyManual(true); setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); }}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="spa_manager"
          />
        </div>
      </div>
      <div>
        <label htmlFor="new-role-desc" className="block text-xs text-slate-400 mb-1">Description</label>
        <input
          id="new-role-desc"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Optional description"
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={isSaving || !name.trim() || !key.trim()}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {isSaving && <Loader2 size={12} className="animate-spin" />}
          Create Role
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-white px-3 py-1.5 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RoleCard({
  role,
  availablePermissions,
  isReadOnly,
  isSaving,
  onUpdate,
  onDelete,
}: {
  role: RoleTemplateWithPermissions;
  availablePermissions: PermissionGroup[];
  isReadOnly: boolean;
  isSaving: boolean;
  onUpdate: (roleId: string, input: { roleName: string; roleKey: string; description?: string | null; permissions: string[]; isActive?: boolean }) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [permSearch, setPermSearch] = useState('');
  const permSet = useMemo(() => new Set(role.permissions), [role.permissions]);

  const filteredGroups = useMemo(() => {
    if (!permSearch) return availablePermissions;
    const q = permSearch.toLowerCase();
    return availablePermissions
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter((p) => p.toLowerCase().includes(q)),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [availablePermissions, permSearch]);

  const togglePermission = async (perm: string) => {
    if (isReadOnly) return;
    const newPerms = permSet.has(perm)
      ? role.permissions.filter((p) => p !== perm)
      : [...role.permissions, perm];
    await onUpdate(role.id, {
      roleName: role.roleName,
      roleKey: role.roleKey,
      description: role.description,
      permissions: newPerms,
      isActive: role.isActive,
    });
  };

  const toggleModuleAll = async (group: PermissionGroup) => {
    if (isReadOnly) return;
    const allSelected = group.permissions.every((p) => permSet.has(p));
    let newPerms: string[];
    if (allSelected) {
      const removeSet = new Set(group.permissions);
      newPerms = role.permissions.filter((p) => !removeSet.has(p));
    } else {
      const addSet = new Set(group.permissions);
      newPerms = [...role.permissions.filter((p) => !addSet.has(p)), ...group.permissions];
    }
    await onUpdate(role.id, {
      roleName: role.roleName,
      roleKey: role.roleKey,
      description: role.description,
      permissions: newPerms,
      isActive: role.isActive,
    });
  };

  const handleDelete = async () => {
    if (isReadOnly) return;
    if (!confirm(`Delete role "${role.roleName}"?`)) return;
    await onDelete(role.id);
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      {/* Card Header */}
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-400 hover:text-white transition-colors"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse permissions' : 'Expand permissions'}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{role.roleName}</span>
            <span className="text-xs text-slate-500 font-mono">{role.roleKey}</span>
            {!role.isActive && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-400">
                Inactive
              </span>
            )}
          </div>
          {role.description && (
            <p className="text-xs text-slate-500 mt-0.5">{role.description}</p>
          )}
        </div>

        <span className="text-xs text-slate-400">
          {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
        </span>

        {!isReadOnly && (
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className="text-slate-500 hover:text-red-400 transition-colors p-1"
            aria-label={`Delete ${role.roleName}`}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Permissions Section */}
      {expanded && (
        <div className="border-t border-slate-700 px-5 py-4">
          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filter permissions..."
              value={permSearch}
              onChange={(e) => setPermSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Permission Groups */}
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {filteredGroups.map((group) => {
              const allSelected = group.permissions.every((p) => permSet.has(p));
              const someSelected = group.permissions.some((p) => permSet.has(p));

              return (
                <div key={group.moduleKey}>
                  <label className="flex items-center gap-2 mb-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={() => toggleModuleAll(group)}
                      disabled={isReadOnly}
                      className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      {group.moduleLabel}
                    </span>
                  </label>
                  <div className="ml-5 space-y-0.5">
                    {group.permissions.map((perm) => (
                      <label key={perm} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={permSet.has(perm)}
                          onChange={() => togglePermission(perm)}
                          disabled={isReadOnly}
                          className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                        />
                        <span className="text-xs text-slate-400 font-mono">{perm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
