'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit3, Loader2, Plus, Trash2, X } from 'lucide-react';
import { adminFetch, AdminApiError } from '@/lib/api-fetch';

interface RoleListItem {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

interface RoleForm {
  name: string;
  description: string;
  permissions: string[];
}

const emptyForm: RoleForm = { name: '', description: '', permissions: [] };

// Permission groups for the permission picker
const PERMISSION_GROUPS: Record<string, { label: string; permissions: string[] }> = {
  platform: {
    label: 'Platform',
    permissions: ['settings.view', 'settings.update', 'users.view', 'users.manage'],
  },
  catalog: {
    label: 'Catalog',
    permissions: ['catalog.view', 'catalog.manage'],
  },
  pos: {
    label: 'POS / Orders',
    permissions: ['orders.view', 'orders.create', 'orders.manage', 'orders.void', 'returns.create', 'price.override', 'discounts.apply', 'charges.manage'],
  },
  payments: {
    label: 'Payments',
    permissions: ['tenders.view', 'tenders.create', 'tenders.adjust', 'tenders.refund'],
  },
  inventory: {
    label: 'Inventory',
    permissions: ['inventory.view', 'inventory.manage', 'inventory.receive'],
  },
  customers: {
    label: 'Customers',
    permissions: ['customers.view', 'customers.create', 'customers.manage'],
  },
  reports: {
    label: 'Reports',
    permissions: ['reports.view', 'reports.export', 'reports.custom.view', 'reports.custom.manage'],
  },
  accounting: {
    label: 'Accounting',
    permissions: ['accounting.view', 'accounting.manage', 'accounting.mappings.manage', 'accounting.period.close'],
  },
  shifts: {
    label: 'Shifts & Cash',
    permissions: ['cash.drawer', 'shift.manage'],
  },
};

export function TenantRolesTab({ tenantId }: { tenantId: string }) {
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<RoleForm>(emptyForm);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<RoleForm>(emptyForm);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [editIsSystem, setEditIsSystem] = useState(false);

  // Expanded role detail
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch<{ data: RoleListItem[] }>(`/api/v1/tenants/${tenantId}/roles`);
      setRoles(res.data);
    } catch (err) {
      console.error('[TenantRolesTab] load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const canSubmitAdd = useMemo(() => {
    return !!(addForm.name.trim() && addForm.permissions.length > 0);
  }, [addForm]);

  const canSubmitEdit = useMemo(() => {
    return !!(editForm.name.trim() && editForm.permissions.length > 0);
  }, [editForm]);

  const submitAdd = useCallback(async () => {
    if (!canSubmitAdd) return;
    setIsSaving(true);
    try {
      await adminFetch(`/api/v1/tenants/${tenantId}/roles`, {
        method: 'POST',
        body: JSON.stringify({
          name: addForm.name.trim(),
          description: addForm.description.trim() || undefined,
          permissions: addForm.permissions,
        }),
      });
      setShowAddModal(false);
      setAddForm(emptyForm);
      await loadRoles();
    } catch (err) {
      if (err instanceof AdminApiError) alert(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [addForm, canSubmitAdd, tenantId, loadRoles]);

  const openEditModal = useCallback((role: RoleListItem) => {
    setEditRoleId(role.id);
    setEditIsSystem(role.isSystem);
    setEditForm({
      name: role.name,
      description: role.description ?? '',
      permissions: [...role.permissions],
    });
    setShowEditModal(true);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!canSubmitEdit || !editRoleId) return;
    setIsSaving(true);
    try {
      await adminFetch(`/api/v1/tenants/${tenantId}/roles/${editRoleId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editIsSystem ? undefined : editForm.name.trim(),
          description: editForm.description.trim() || undefined,
          permissions: editIsSystem && (editForm.name === 'Owner' || editForm.name === 'Super Admin') ? undefined : editForm.permissions,
        }),
      });
      setShowEditModal(false);
      setEditRoleId(null);
      setEditForm(emptyForm);
      await loadRoles();
    } catch (err) {
      if (err instanceof AdminApiError) alert(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [editForm, canSubmitEdit, editRoleId, editIsSystem, tenantId, loadRoles]);

  const handleDelete = useCallback(async (role: RoleListItem) => {
    if (role.isSystem) return;
    if (!confirm(`Delete role "${role.name}"? This will remove it from all assigned users.`)) return;
    try {
      await adminFetch(`/api/v1/tenants/${tenantId}/roles/${role.id}`, { method: 'DELETE' });
      await loadRoles();
    } catch (err) {
      if (err instanceof AdminApiError) alert(err.message);
    }
  }, [tenantId, loadRoles]);

  const inputCls = 'w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">
          {roles.length} role{roles.length !== 1 ? 's' : ''}
        </h3>
        <button
          type="button"
          onClick={() => { setAddForm(emptyForm); setShowAddModal(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Role
        </button>
      </div>

      {/* Roles List */}
      <div className="space-y-2">
        {roles.map((role) => {
          const isExpanded = expandedRoleId === role.id;
          const isWildcard = role.permissions.includes('*');
          return (
            <div key={role.id} className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800"
                onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{role.name}</span>
                    {role.isSystem && (
                      <span className="rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
                        System
                      </span>
                    )}
                    {isWildcard && (
                      <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                        All Permissions
                      </span>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{role.description}</p>
                  )}
                </div>
                <span className="text-xs text-slate-400 tabular-nums shrink-0">{role.userCount} user{role.userCount !== 1 ? 's' : ''}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEditModal(role); }}
                    className="rounded p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-700"
                    title="Edit role"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  {!role.isSystem && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(role); }}
                      className="rounded p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700"
                      title="Delete role"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-slate-700 px-4 py-3">
                  <p className="text-xs font-medium text-slate-400 mb-2">
                    Permissions ({isWildcard ? 'All' : role.permissions.length})
                  </p>
                  {isWildcard ? (
                    <p className="text-xs text-amber-400">Wildcard (*) — this role has access to all current and future permissions.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {role.permissions.map((p) => (
                        <span key={p} className="rounded bg-slate-700 px-2 py-0.5 text-[11px] text-slate-300 font-mono">{p}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {roles.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-8">No roles found for this tenant</p>
        )}
      </div>

      {/* ── Add Role Modal ────────────────────────────────────── */}
      {showAddModal && (
        <RoleFormModal
          title="Add New Role"
          form={addForm}
          setForm={setAddForm}
          canSubmit={canSubmitAdd}
          isSaving={isSaving}
          isSystem={false}
          onSubmit={submitAdd}
          onClose={() => setShowAddModal(false)}
          submitLabel="Create Role"
          inputCls={inputCls}
        />
      )}

      {/* ── Edit Role Modal ───────────────────────────────────── */}
      {showEditModal && (
        <RoleFormModal
          title={`Edit Role: ${editForm.name}`}
          form={editForm}
          setForm={setEditForm}
          canSubmit={canSubmitEdit}
          isSaving={isSaving}
          isSystem={editIsSystem}
          onSubmit={submitEdit}
          onClose={() => { setShowEditModal(false); setEditRoleId(null); setEditForm(emptyForm); }}
          submitLabel="Save Changes"
          inputCls={inputCls}
        />
      )}
    </div>
  );
}

// ── Role Form Modal ───────────────────────────────────────────────

function RoleFormModal({
  title,
  form,
  setForm,
  canSubmit,
  isSaving,
  isSystem,
  onSubmit,
  onClose,
  submitLabel,
  inputCls,
}: {
  title: string;
  form: RoleForm;
  setForm: React.Dispatch<React.SetStateAction<RoleForm>>;
  canSubmit: boolean;
  isSaving: boolean;
  isSystem: boolean;
  onSubmit: () => void;
  onClose: () => void;
  submitLabel: string;
  inputCls: string;
}) {
  const isWildcard = form.permissions.includes('*');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const togglePermission = (perm: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const toggleGroupAll = (groupPerms: string[]) => {
    const allSelected = groupPerms.every((p) => form.permissions.includes(p));
    setForm((prev) => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter((p) => !groupPerms.includes(p))
        : [...new Set([...prev.permissions, ...groupPerms])],
    }));
  };

  const isOwnerOrSuperAdmin = isSystem && (form.name === 'Owner' || form.name === 'Super Admin');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Role Name *</label>
            <input
              placeholder="e.g. Floor Manager"
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              disabled={isSystem}
            />
            {isSystem && <p className="mt-1 text-xs text-slate-500">System roles cannot be renamed</p>}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Description</label>
            <input
              placeholder="Brief description of this role"
              className={inputCls}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>

          {/* Permissions */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Permissions * ({isWildcard ? 'All' : form.permissions.length} selected)
            </label>

            {isOwnerOrSuperAdmin ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
                This role uses wildcard (*) permissions — it automatically includes all current and future permissions. Cannot be modified.
              </div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(PERMISSION_GROUPS).map(([key, group]) => {
                  const isOpen = expandedGroup === key;
                  const selectedCount = group.permissions.filter((p) => form.permissions.includes(p)).length;
                  const allSelected = selectedCount === group.permissions.length;

                  return (
                    <div key={key} className="rounded-lg border border-slate-600 bg-slate-700/50 overflow-hidden">
                      <div
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-700"
                        onClick={() => setExpandedGroup(isOpen ? null : key)}
                      >
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                        <span className="text-sm text-slate-200 flex-1">{group.label}</span>
                        <span className="text-xs text-slate-400 tabular-nums">{selectedCount}/{group.permissions.length}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleGroupAll(group.permissions); }}
                          className="text-[10px] text-blue-400 hover:underline px-1"
                        >
                          {allSelected ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="border-t border-slate-600 px-3 py-2 grid grid-cols-2 gap-1.5">
                          {group.permissions.map((perm) => (
                            <label key={perm} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.permissions.includes(perm)}
                                onChange={() => togglePermission(perm)}
                                className="h-3.5 w-3.5 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="font-mono">{perm}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">Cancel</button>
          <button
            type="button"
            disabled={!canSubmit || isSaving || isOwnerOrSuperAdmin}
            onClick={onSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
