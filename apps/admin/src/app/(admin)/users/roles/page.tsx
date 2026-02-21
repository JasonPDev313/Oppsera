'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Shield,
  Users,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Save,
  Copy,
  History,
  CheckSquare,
} from 'lucide-react';
import { useAdminRoles } from '@/hooks/use-staff';
import { adminFetch } from '@/lib/api-fetch';
import type { AdminRoleDetail, AdminPermissionEntry, AdminAuditEntry } from '@/types/users';

// ── Available permission catalog ──────────────────────────────────

interface PermOption {
  module: string;
  submodule: string | null;
  action: string;
  label: string;
}

const PERMISSION_CATALOG: { group: string; permissions: PermOption[] }[] = [
  {
    group: 'Tenants',
    permissions: [
      { module: 'tenants', submodule: null, action: 'view', label: 'View tenants' },
      { module: 'tenants', submodule: null, action: 'create', label: 'Create tenants' },
      { module: 'tenants', submodule: null, action: 'edit', label: 'Edit tenants' },
      { module: 'tenants', submodule: null, action: 'delete', label: 'Delete tenants' },
    ],
  },
  {
    group: 'Users — Staff',
    permissions: [
      { module: 'users', submodule: 'staff', action: 'view', label: 'View staff' },
      { module: 'users', submodule: 'staff', action: 'create', label: 'Create staff' },
      { module: 'users', submodule: 'staff', action: 'edit', label: 'Edit staff' },
      { module: 'users', submodule: 'staff', action: 'invite', label: 'Send invites' },
      { module: 'users', submodule: 'staff', action: 'reset_password', label: 'Reset passwords' },
      { module: 'users', submodule: 'staff', action: 'suspend', label: 'Suspend / unsuspend' },
      { module: 'users', submodule: 'staff', action: 'delete', label: 'Delete staff' },
    ],
  },
  {
    group: 'Users — Customers',
    permissions: [
      { module: 'users', submodule: 'customers', action: 'view', label: 'View customers' },
      { module: 'users', submodule: 'customers', action: 'create', label: 'Create customers' },
      { module: 'users', submodule: 'customers', action: 'edit', label: 'Edit customers' },
      { module: 'users', submodule: 'customers', action: 'invite', label: 'Send invites' },
      { module: 'users', submodule: 'customers', action: 'reset_password', label: 'Reset passwords' },
      { module: 'users', submodule: 'customers', action: 'suspend', label: 'Lock / unlock' },
    ],
  },
  {
    group: 'AI Train',
    permissions: [
      { module: 'ai_train', submodule: null, action: 'view', label: 'View AI training data' },
      { module: 'ai_train', submodule: 'examples', action: 'create', label: 'Create golden examples' },
      { module: 'ai_train', submodule: 'examples', action: 'edit', label: 'Edit golden examples' },
      { module: 'ai_train', submodule: 'examples', action: 'delete', label: 'Delete golden examples' },
    ],
  },
  {
    group: 'Evaluations',
    permissions: [
      { module: 'evaluations', submodule: null, action: 'view', label: 'View evaluations' },
      { module: 'evaluations', submodule: null, action: 'edit', label: 'Edit evaluations / review' },
    ],
  },
  {
    group: 'System',
    permissions: [
      { module: 'system', submodule: null, action: 'view', label: 'View system settings' },
      { module: 'system', submodule: 'roles', action: 'view', label: 'View roles' },
      { module: 'system', submodule: 'roles', action: 'edit', label: 'Manage roles' },
    ],
  },
];

const ALL_PERM_KEYS = new Set(
  PERMISSION_CATALOG.flatMap((g) => g.permissions.map(permKey)),
);

function permKey(p: { module: string; submodule: string | null; action: string }) {
  return `${p.module}.${p.submodule ?? ''}.${p.action}`;
}

// ── Main Page ─────────────────────────────────────────────────────

export default function RolesPage() {
  const { data: roles, isLoading, error, load } = useAdminRoles();
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [roleDetail, setRoleDetail] = useState<AdminRoleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create/Clone modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cloneSource, setCloneSource] = useState<{ name: string; description: string | null; permissions: Set<string> } | null>(null);

  // Edit mode
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [editDesc, setEditDesc] = useState('');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // History panel
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { load(); }, [load]);

  const toggleRole = async (roleId: string) => {
    if (expandedRole === roleId) {
      setExpandedRole(null);
      setRoleDetail(null);
      setEditingRoleId(null);
      setShowHistory(false);
      return;
    }
    setExpandedRole(roleId);
    setEditingRoleId(null);
    setShowHistory(false);
    setDetailLoading(true);
    try {
      const res = await adminFetch<{ data: AdminRoleDetail }>(`/api/v1/admin/roles/${roleId}`);
      setRoleDetail(res.data);
    } catch {
      setRoleDetail(null);
    }
    setDetailLoading(false);
  };

  const startEdit = (role: AdminRoleDetail) => {
    setEditingRoleId(role.id);
    setEditName(role.name);
    setEditDesc(role.description ?? '');
    setEditPerms(new Set(role.permissions.map(permKey)));
    setShowHistory(false);
  };

  const cancelEdit = () => {
    setEditingRoleId(null);
  };

  const toggleEditPerm = (p: PermOption) => {
    const key = permKey(p);
    setEditPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setEditPermsFromGroup = (group: typeof PERMISSION_CATALOG[number], select: boolean) => {
    setEditPerms((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        const key = permKey(p);
        if (select) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const saveEdit = async () => {
    if (!editingRoleId) return;
    setSaving(true);
    try {
      const permissions = Array.from(editPerms).map((k) => {
        const [mod, sub, action] = k.split('.');
        return { module: mod, submodule: sub || null, action, scope: 'global' as const };
      });
      const body: Record<string, unknown> = { permissions };
      if (roleDetail && !roleDetail.isSystem) {
        body.name = editName.trim();
      }
      body.description = editDesc.trim() || null;

      await adminFetch(`/api/v1/admin/roles/${editingRoleId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      // Re-fetch detail
      const res = await adminFetch<{ data: AdminRoleDetail }>(`/api/v1/admin/roles/${editingRoleId}`);
      setRoleDetail(res.data);
      setEditingRoleId(null);
      load(); // refresh list counts
    } catch {
      // error shown by adminFetch
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminFetch(`/api/v1/admin/roles/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setExpandedRole(null);
      setRoleDetail(null);
      load();
    } catch {
      // error shown
    }
    setDeleting(false);
  };

  const handleClone = (role: AdminRoleDetail) => {
    setCloneSource({
      name: `Copy of ${role.name}`,
      description: role.description,
      permissions: new Set(role.permissions.map(permKey)),
    });
    setShowCreateModal(true);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Roles & Permissions</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage admin roles and their granular permissions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { load(); setExpandedRole(null); setRoleDetail(null); }}
            disabled={isLoading}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => { setCloneSource(null); setShowCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} />
            Create Role
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Roles List */}
      <div className="space-y-3">
        {roles.map((role) => (
          <div key={role.id} className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
            <button
              onClick={() => toggleRole(role.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-800/80 transition-colors"
            >
              <Shield size={18} className={role.isSystem ? 'text-indigo-400' : 'text-slate-400'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{role.name}</span>
                  {role.isSystem && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/20 text-indigo-300 rounded">
                      System
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{role.description}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0">
                <span>{role.permissionCount} perms</span>
                <span className="flex items-center gap-1">
                  <Users size={10} />
                  {role.assigneeCount}
                </span>
                {expandedRole === role.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
            </button>

            {expandedRole === role.id && (
              <div className="border-t border-slate-700 px-5 py-4">
                {detailLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : roleDetail ? (
                  <div className="space-y-4">
                    {/* Action bar */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        {editingRoleId === role.id ? 'Editing Permissions' : 'Permissions'}
                      </h3>
                      <div className="flex items-center gap-2">
                        {editingRoleId === role.id ? (
                          <>
                            <button
                              onClick={cancelEdit}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                            >
                              <X size={12} /> Cancel
                            </button>
                            <button
                              onClick={saveEdit}
                              disabled={saving || editPerms.size === 0}
                              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50"
                            >
                              <Save size={12} /> {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(roleDetail)}
                              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              onClick={() => handleClone(roleDetail)}
                              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                            >
                              <Copy size={12} /> Clone
                            </button>
                            <button
                              onClick={() => setShowHistory((v) => !v)}
                              className={`flex items-center gap-1 text-xs transition-colors ${
                                showHistory ? 'text-amber-300 font-medium' : 'text-amber-400 hover:text-amber-300'
                              }`}
                            >
                              <History size={12} /> History
                            </button>
                            {!roleDetail.isSystem && (
                              <button
                                onClick={() => setDeleteTarget({ id: roleDetail.id, name: roleDetail.name })}
                                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Edit mode: name + description */}
                    {editingRoleId === role.id && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">
                            Name {roleDetail.isSystem && <span className="text-slate-600">(system — cannot rename)</span>}
                          </label>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            disabled={roleDetail.isSystem}
                            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Description</label>
                          <input
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Permission grid */}
                    {editingRoleId === role.id ? (
                      <PermissionEditor
                        selected={editPerms}
                        onToggle={toggleEditPerm}
                        onGroupToggle={setEditPermsFromGroup}
                        onSelectAll={(all) => setEditPerms(all ? new Set(ALL_PERM_KEYS) : new Set())}
                      />
                    ) : (
                      <PermissionDisplay permissions={roleDetail.permissions} />
                    )}

                    {/* History panel */}
                    {showHistory && (
                      <RoleHistoryPanel roleId={roleDetail.id} />
                    )}

                    {/* Assignees */}
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                        Assigned To ({roleDetail.assignees.length})
                      </h3>
                      {roleDetail.assignees.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {roleDetail.assignees.map((a) => (
                            <div key={a.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-800 rounded text-xs">
                              <span className="text-white">{a.name}</span>
                              <span className="text-slate-500">{a.email}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">No admins assigned</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Failed to load role details</p>
                )}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && roles.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Shield size={32} className="mx-auto mb-3 opacity-50" />
            <p>No roles found.</p>
            <p className="text-xs mt-1">Click &quot;Create Role&quot; to add your first role, or run the seed script.</p>
          </div>
        )}
      </div>

      {/* Create / Clone Role Modal */}
      {showCreateModal && (
        <CreateRoleModal
          onClose={() => { setShowCreateModal(false); setCloneSource(null); }}
          onCreated={() => { setShowCreateModal(false); setCloneSource(null); load(); }}
          cloneSource={cloneSource}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Role</h3>
            <p className="text-sm text-slate-400 mb-4">
              Are you sure you want to delete <strong className="text-white">{deleteTarget.name}</strong>?
              All admin assignments to this role will be removed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Permission Display (read-only) ───────────────────────────────

function PermissionDisplay({ permissions }: { permissions: AdminPermissionEntry[] }) {
  if (permissions.length === 0) {
    return <p className="text-xs text-slate-500 italic">No permissions defined</p>;
  }

  // Check for wildcard
  const isWildcard = permissions.some((p) => p.module === '*' && p.action === '*');
  if (isWildcard) {
    return (
      <div className="px-3 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-sm text-indigo-300">
        Full access — all modules and actions (wildcard <code className="font-mono">*.*</code>)
      </div>
    );
  }

  // Group by module
  const groups = new Map<string, AdminPermissionEntry[]>();
  for (const p of permissions) {
    const key = p.submodule ? `${p.module}.${p.submodule}` : p.module;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  return (
    <div className="space-y-2">
      {Array.from(groups.entries()).map(([group, perms]) => (
        <div key={group} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-300 w-36 shrink-0">{group}</span>
          {perms.map((p) => (
            <span key={p.id} className="px-2 py-0.5 bg-slate-800 rounded text-xs text-indigo-400 font-mono">
              {p.action}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Permission Editor (checkboxes with Select All) ────────────────

function PermissionEditor({
  selected,
  onToggle,
  onGroupToggle,
  onSelectAll,
}: {
  selected: Set<string>;
  onToggle: (p: PermOption) => void;
  onGroupToggle: (group: typeof PERMISSION_CATALOG[number], select: boolean) => void;
  onSelectAll: (selectAll: boolean) => void;
}) {
  const allSelected = ALL_PERM_KEYS.size > 0 && selected.size === ALL_PERM_KEYS.size;
  const noneSelected = selected.size === 0;

  return (
    <div className="space-y-4">
      {/* Global Select All / Deselect All */}
      <div className="flex items-center gap-3 pb-2 border-b border-slate-700">
        <button
          type="button"
          onClick={() => onSelectAll(!allSelected)}
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <CheckSquare size={13} />
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-xs text-slate-500">
          {selected.size} of {ALL_PERM_KEYS.size} permissions selected
        </span>
      </div>

      {PERMISSION_CATALOG.map((group) => {
        const groupKeys = group.permissions.map(permKey);
        const groupSelectedCount = groupKeys.filter((k) => selected.has(k)).length;
        const allGroupSelected = groupSelectedCount === group.permissions.length;

        return (
          <div key={group.group}>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-semibold text-slate-300">{group.group}</h4>
              <button
                type="button"
                onClick={() => onGroupToggle(group, !allGroupSelected)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {allGroupSelected ? 'Deselect group' : 'Select group'} ({groupSelectedCount}/{group.permissions.length})
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {group.permissions.map((p) => {
                const key = permKey(p);
                const checked = selected.has(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                      checked ? 'bg-indigo-500/10 text-indigo-300' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(p)}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-mono text-[10px] text-slate-500 w-32 shrink-0">
                      {p.module}{p.submodule ? `.${p.submodule}` : ''}.{p.action}
                    </span>
                    <span>{p.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Role History Panel ───────────────────────────────────────────

interface AuditListResponse {
  items: AdminAuditEntry[];
  cursor: string | null;
  hasMore: boolean;
}

function RoleHistoryPanel({ roleId }: { roleId: string }) {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const loadHistory = useCallback(async (nextCursor?: string) => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ entityType: 'role', entityId: roleId, limit: '20' });
      if (nextCursor) qs.set('cursor', nextCursor);
      const res = await adminFetch<{ data: AuditListResponse }>(`/api/v1/admin/audit?${qs}`);
      if (nextCursor) {
        setEntries((prev) => [...prev, ...res.data.items]);
      } else {
        setEntries(res.data.items);
      }
      setHasMore(res.data.hasMore);
      setCursor(res.data.cursor);
    } catch {
      // error handled
    }
    setIsLoading(false);
  }, [roleId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const formatAction = (action: string) => {
    switch (action) {
      case 'role.created': return 'Created';
      case 'role.updated': return 'Updated';
      case 'role.deleted': return 'Deleted';
      default: return action;
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const renderSnapshotDiff = (entry: AdminAuditEntry) => {
    const before = entry.beforeSnapshot;
    const after = entry.afterSnapshot;

    if (!before && !after) {
      return <p className="text-xs text-slate-500 italic">No snapshot data recorded</p>;
    }

    // For role.created — show the new permissions
    if (entry.action === 'role.created' && after) {
      const perms = after.permissions as Array<{ module: string; submodule?: string | null; action: string }> | undefined;
      return (
        <div className="space-y-1.5">
          {!!after.name && (
            <div className="text-xs">
              <span className="text-slate-500">Name:</span>{' '}
              <span className="text-emerald-400">{String(after.name)}</span>
            </div>
          )}
          {perms && perms.length > 0 && (
            <div>
              <span className="text-xs text-slate-500">Permissions added ({perms.length}):</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {perms.map((p, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[10px] font-mono">
                    {p.module}{p.submodule ? `.${p.submodule}` : ''}.{p.action}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // For role.updated — show before/after diff
    if (entry.action === 'role.updated') {
      const beforePerms = (before as Record<string, unknown> | null)?.name ? before : null;
      const afterPerms = after?.permissions as Array<{ module: string; submodule?: string | null; action: string }> | undefined;

      // Name change
      const nameChanged = before?.name && after?.name && before.name !== after.name;

      // Compute permission diff
      const beforePermSet = new Set<string>();
      const afterPermSet = new Set<string>();

      // before snapshot from the role.updated might just have { name }
      // after snapshot has { permissions: [...] }
      if (afterPerms) {
        for (const p of afterPerms) {
          afterPermSet.add(`${p.module}.${p.submodule ?? ''}.${p.action}`);
        }
      }

      return (
        <div className="space-y-1.5">
          {!!nameChanged && (
            <div className="text-xs">
              <span className="text-slate-500">Name:</span>{' '}
              <span className="text-red-400 line-through">{String(before!.name)}</span>
              {' → '}
              <span className="text-emerald-400">{String(after!.name)}</span>
            </div>
          )}
          {after?.description !== undefined && before?.description !== undefined && after.description !== before.description && (
            <div className="text-xs">
              <span className="text-slate-500">Description:</span>{' '}
              {before.description ? (
                <span className="text-red-400 line-through">{String(before.description)}</span>
              ) : (
                <span className="text-slate-600 italic">none</span>
              )}
              {' → '}
              {after.description ? (
                <span className="text-emerald-400">{String(after.description)}</span>
              ) : (
                <span className="text-slate-600 italic">none</span>
              )}
            </div>
          )}
          {afterPerms && afterPerms.length > 0 && (
            <div>
              <span className="text-xs text-slate-500">Permissions set to ({afterPerms.length}):</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {afterPerms.map((p, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-indigo-400 rounded text-[10px] font-mono">
                    {p.module}{p.submodule ? `.${p.submodule}` : ''}.{p.action}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // For role.deleted — show what was deleted
    if (entry.action === 'role.deleted' && before) {
      return (
        <div className="text-xs">
          <span className="text-slate-500">Deleted role:</span>{' '}
          <span className="text-red-400">{String(before.name)}</span>
          {before.isSystem !== undefined && (
            <span className="text-slate-500 ml-2">(system: {String(before.isSystem)})</span>
          )}
        </div>
      );
    }

    // Fallback: raw JSON
    return (
      <div className="space-y-1">
        {before && (
          <div>
            <span className="text-[10px] text-slate-500 uppercase">Before:</span>
            <pre className="text-[10px] text-slate-400 bg-slate-800 rounded px-2 py-1 mt-0.5 overflow-x-auto">
              {JSON.stringify(before, null, 2)}
            </pre>
          </div>
        )}
        {after && (
          <div>
            <span className="text-[10px] text-slate-500 uppercase">After:</span>
            <pre className="text-[10px] text-emerald-400/70 bg-slate-800 rounded px-2 py-1 mt-0.5 overflow-x-auto">
              {JSON.stringify(after, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
        <History size={12} /> Change History
      </h3>

      {isLoading && entries.length === 0 ? (
        <div className="flex justify-center py-4">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-2">No changes recorded for this role</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-800/80 transition-colors"
              >
                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                  entry.action === 'role.created' ? 'bg-emerald-500/20 text-emerald-400' :
                  entry.action === 'role.deleted' ? 'bg-red-500/20 text-red-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {formatAction(entry.action)}
                </span>
                <span className="text-xs text-slate-300 flex-1">
                  by <strong>{entry.actorAdminName}</strong>
                </span>
                <span className="text-[10px] text-slate-500 shrink-0">{formatDate(entry.createdAt)}</span>
                {expandedEntry === entry.id ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
              </button>

              {expandedEntry === entry.id && (
                <div className="px-3 pb-2 pt-1 border-t border-slate-700/50">
                  {renderSnapshotDiff(entry)}
                </div>
              )}
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => cursor && loadHistory(cursor)}
              disabled={isLoading}
              className="w-full text-xs text-indigo-400 hover:text-indigo-300 py-2 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create / Clone Role Modal ─────────────────────────────────────

function CreateRoleModal({
  onClose,
  onCreated,
  cloneSource,
}: {
  onClose: () => void;
  onCreated: () => void;
  cloneSource?: { name: string; description: string | null; permissions: Set<string> } | null;
}) {
  const [name, setName] = useState(cloneSource?.name ?? '');
  const [description, setDescription] = useState(cloneSource?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(cloneSource?.permissions ?? new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePerm = (p: PermOption) => {
    const key = permKey(p);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (group: typeof PERMISSION_CATALOG[number], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        const key = permKey(p);
        if (select) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const permissions = Array.from(selected).map((k) => {
        const [mod, sub, action] = k.split('.');
        return { module: mod, submodule: sub || null, action, scope: 'global' as const };
      });

      await adminFetch('/api/v1/admin/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          permissions,
        }),
      });

      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create role');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 overflow-y-auto py-8">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">
            {cloneSource ? 'Clone Role' : 'Create Role'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {cloneSource && (
            <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
              Cloning from an existing role. Permissions have been pre-filled. Adjust the name and permissions as needed.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Role Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g., Content Manager"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this role"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Permissions * <span className="text-slate-500 font-normal">({selected.size} selected)</span>
            </label>
            <PermissionEditor
              selected={selected}
              onToggle={togglePerm}
              onGroupToggle={toggleGroup}
              onSelectAll={(all) => setSelected(all ? new Set(ALL_PERM_KEYS) : new Set())}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || selected.size === 0}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : cloneSource ? (
                <Copy size={14} />
              ) : (
                <Check size={14} />
              )}
              {cloneSource ? 'Clone Role' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
