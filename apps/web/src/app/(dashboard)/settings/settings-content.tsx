'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Users, Plus, X, Loader2, Check, Blocks, ScrollText, LayoutDashboard, Grid3X3, List } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { usePermissions } from '@/hooks/use-permissions';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { AuditLogViewer } from '@/components/audit-log-viewer';

// ── Types ────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

interface RoleDetail extends Omit<Role, 'userCount'> {
  assignedUsers: Array<{
    id: string;
    email: string;
    name: string;
    locationId: string | null;
  }>;
}

interface TenantUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  status: string;
}

// ── Permission Groups ────────────────────────────────────────────

const PERMISSION_GROUPS: Record<string, string[]> = {
  'Inventory Items': ['catalog.view', 'catalog.create', 'catalog.update', 'catalog.delete'],
  Orders: ['orders.view', 'orders.create', 'orders.void'],
  Payments: ['tenders.view', 'tenders.create'],
  Inventory: ['inventory.view', 'inventory.receive', 'inventory.adjust', 'inventory.transfer'],
  Customers: ['customers.view', 'customers.create', 'customers.update', 'customers.merge'],
  Reports: ['reports.view', 'reports.export'],
  Settings: ['settings.view', 'settings.update'],
  Users: ['users.view', 'users.manage'],
};

// ── Settings Page ────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'modules' | 'audit' | 'dashboard'>('users');
  const { can } = usePermissions();

  const tabs = [
    { id: 'users' as const, label: 'Users', icon: Users },
    { id: 'roles' as const, label: 'Roles', icon: Shield },
    { id: 'modules' as const, label: 'Modules', icon: Blocks },
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'audit' as const, label: 'Audit Log', icon: ScrollText },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your team, permissions, and modules</p>

      {/* Tab navigation */}
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'users' && <UsersTab canManage={can('users.manage')} />}
        {activeTab === 'roles' && <RolesTab canManage={can('users.manage')} />}
        {activeTab === 'modules' && <ModulesTab />}
        {activeTab === 'dashboard' && <DashboardSettingsTab />}
        {activeTab === 'audit' && <AuditLogTab />}
      </div>
    </div>
  );
}

// ── Users Tab ────────────────────────────────────────────────────

function UsersTab({ canManage }: { canManage: boolean }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [userRoles, setUserRoles] = useState<Array<{
    id: string;
    name: string;
    scope: string;
    locationId: string | null;
    permissions: string[];
  }>>([]);

  const fetchUsers = useCallback(async () => {
    try {
      const rolesResp = await apiFetch<{ data: Role[] }>('/api/v1/roles');
      const allRoles = rolesResp.data;

      // Build users list from role assignments
      const userMap = new Map<string, TenantUser>();
      for (const role of allRoles) {
        const detail = await apiFetch<{ data: RoleDetail }>(`/api/v1/roles/${role.id}`);
        for (const u of detail.data.assignedUsers) {
          const existing = userMap.get(u.id);
          if (existing) {
            if (!existing.roles.includes(role.name)) {
              existing.roles.push(role.name);
            }
          } else {
            userMap.set(u.id, {
              id: u.id,
              email: u.email,
              name: u.name,
              roles: [role.name],
              status: 'active',
            });
          }
        }
      }
      setUsers(Array.from(userMap.values()));
    } catch {
      // Ignore errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSelectUser = useCallback(async (user: TenantUser) => {
    setSelectedUser(user);
    try {
      // Fetch all role details to find this user's assignments
      const rolesResp = await apiFetch<{ data: Role[] }>('/api/v1/roles');
      const assignments: typeof userRoles = [];
      for (const role of rolesResp.data) {
        const detail = await apiFetch<{ data: RoleDetail }>(`/api/v1/roles/${role.id}`);
        for (const u of detail.data.assignedUsers) {
          if (u.id === user.id) {
            assignments.push({
              id: role.id,
              name: role.name,
              scope: u.locationId ? 'location' : 'tenant',
              locationId: u.locationId,
              permissions: detail.data.permissions,
            });
          }
        }
      }
      setUserRoles(assignments);
    } catch {
      setUserRoles([]);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          {canManage && (
            <button
              type="button"
              onClick={() => alert('Coming in Milestone 4')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Invite User
            </button>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Roles
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface">
              {users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {user.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {user.email}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {user.roles.join(', ')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      {user.status}
                    </span>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User detail side panel */}
      {selectedUser && (
        <div className="w-80 shrink-0 rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{selectedUser.name}</h3>
            <button type="button" onClick={() => setSelectedUser(null)}>
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">{selectedUser.email}</p>

          <div className="mt-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase">Role Assignments</h4>
            <div className="mt-2 space-y-2">
              {userRoles.map((role, i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{role.name}</span>
                    <span className="text-xs text-gray-500">
                      {role.scope === 'tenant' ? 'Tenant-wide' : 'Location'}
                    </span>
                  </div>
                  {role.locationId && (
                    <p className="mt-1 text-xs text-gray-400">Location: {role.locationId}</p>
                  )}
                </div>
              ))}
              {userRoles.length === 0 && (
                <p className="text-xs text-gray-400">No roles assigned</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Roles Tab ────────────────────────────────────────────────────

function RolesTab({ canManage }: { canManage: boolean }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RoleDetail | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await apiFetch<{ data: Role[] }>('/api/v1/roles');
      setRoles(response.data);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleSelectRole = useCallback(async (roleId: string) => {
    try {
      const response = await apiFetch<{ data: RoleDetail }>(`/api/v1/roles/${roleId}`);
      setSelectedRole(response.data);
    } catch {
      // Ignore
    }
  }, []);

  const handleDeleteRole = useCallback(
    async (roleId: string) => {
      if (!confirm('Are you sure you want to delete this role?')) return;
      try {
        await apiFetch(`/api/v1/roles/${roleId}`, { method: 'DELETE' });
        setSelectedRole(null);
        fetchRoles();
      } catch (err) {
        if (err instanceof ApiError) {
          alert(err.message);
        }
      }
    },
    [fetchRoles],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Roles</h2>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Create Role
            </button>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Users
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                  Type
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface">
              {roles.map((role) => (
                <tr
                  key={role.id}
                  onClick={() => handleSelectRole(role.id)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {role.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {role.description || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {role.userCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {role.isSystem ? (
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        System
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                        Custom
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role detail side panel */}
      {selectedRole && (
        <div className="w-96 shrink-0 rounded-lg border border-gray-200 bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{selectedRole.name}</h3>
              {selectedRole.isSystem && (
                <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  System
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {canManage && (selectedRole.isSystem ? selectedRole.name !== 'owner' : true) && (
                <button
                  type="button"
                  onClick={() => setShowEditDialog(true)}
                  className="rounded px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  Edit
                </button>
              )}
              {canManage && !selectedRole.isSystem && (
                <button
                  type="button"
                  onClick={() => handleDeleteRole(selectedRole.id)}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              )}
              <button type="button" onClick={() => setSelectedRole(null)}>
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>
          {selectedRole.description && (
            <p className="mt-1 text-xs text-gray-500">{selectedRole.description}</p>
          )}

          <div className="mt-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase">Permissions</h4>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedRole.permissions.map((perm) => (
                <span
                  key={perm}
                  className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700"
                >
                  {perm}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase">
              Assigned Users ({selectedRole.assignedUsers.length})
            </h4>
            <div className="mt-2 space-y-1">
              {selectedRole.assignedUsers.map((user, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-gray-700">{user.name}</span>
                  <span className="text-xs text-gray-400">{user.email}</span>
                </div>
              ))}
              {selectedRole.assignedUsers.length === 0 && (
                <p className="text-xs text-gray-400">No users assigned</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Role Dialog */}
      {showCreateDialog && (
        <RoleFormDialog
          onClose={() => setShowCreateDialog(false)}
          onSaved={() => {
            setShowCreateDialog(false);
            fetchRoles();
          }}
        />
      )}

      {/* Edit Role Dialog */}
      {showEditDialog && selectedRole && (
        <RoleFormDialog
          role={selectedRole}
          onClose={() => setShowEditDialog(false)}
          onSaved={() => {
            setShowEditDialog(false);
            fetchRoles();
            handleSelectRole(selectedRole.id);
          }}
        />
      )}
    </div>
  );
}

// ── Role Form Dialog ─────────────────────────────────────────────

function RoleFormDialog({
  role,
  onClose,
  onSaved,
}: {
  role?: RoleDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!role;
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(
    new Set(role?.permissions ?? []),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePerm = (perm: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) {
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  };

  const toggleGroup = (perms: string[]) => {
    const allSelected = perms.every((p) => selectedPerms.has(p));
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (allSelected) {
          next.delete(p);
        } else {
          next.add(p);
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedPerms.size === 0) {
      setError('At least one permission is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (isEditing) {
        await apiFetch(`/api/v1/roles/${role.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: role.isSystem ? undefined : name,
            description,
            permissions: [...selectedPerms],
          }),
        });
      } else {
        await apiFetch('/api/v1/roles', {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: description || undefined,
            permissions: [...selectedPerms],
          }),
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An error occurred');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? `Edit ${role.name}` : 'Create Role'}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEditing && role.isSystem}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
              placeholder="e.g. Shift Lead"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="What can this role do?"
            />
          </div>

          {/* Permission checkboxes */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Permissions</label>
            <div className="mt-2 max-h-64 space-y-3 overflow-y-auto rounded-lg border border-gray-200 p-3">
              {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
                <div key={group}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={perms.every((p) => selectedPerms.has(p))}
                      onChange={() => toggleGroup(perms)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700">{group}</span>
                  </div>
                  <div className="ml-6 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {perms.map((perm) => (
                      <label key={perm} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selectedPerms.has(perm)}
                          onChange={() => togglePerm(perm)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-mono text-gray-600">{perm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || (!name.trim() && !isEditing)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isEditing ? 'Save Changes' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modules Tab ──────────────────────────────────────────────────

// Static module registry — matches packages/core/src/entitlements/registry.ts
// Inlined to avoid an API call for data that never changes at runtime.
const MODULES = [
  { key: 'platform_core', name: 'Platform Core', phase: 'v1', description: 'Identity, auth, RBAC, audit logging' },
  { key: 'catalog', name: 'Product Catalog', phase: 'v1', description: 'Items, categories, modifiers, pricing, tax categories' },
  { key: 'pos_retail', name: 'Retail POS', phase: 'v1', description: 'Orders, line items, discounts, tax calculation' },
  { key: 'pos_restaurant', name: 'Restaurant POS', phase: 'v1', description: 'Tables, seats, coursing, kitchen tickets' },
  { key: 'payments', name: 'Payments & Tenders', phase: 'v1', description: 'Cash (V1), card, split, refund (V2)' },
  { key: 'inventory', name: 'Inventory Management', phase: 'v1', description: 'Stock movements, receiving, adjustments, transfers' },
  { key: 'customers', name: 'Customer Management', phase: 'v1', description: 'Profiles, search, visit/spend tracking' },
  { key: 'marketing', name: 'Marketing Automation', phase: 'v2', description: 'Segments, campaigns, triggered journeys' },
  { key: 'kds', name: 'Kitchen Display', phase: 'v2', description: 'Kitchen order tickets, bump screen' },
  { key: 'golf_ops', name: 'Golf Operations', phase: 'v1', description: 'Tee sheet, starter sheet, pace-of-play' },
  { key: 'room_layouts', name: 'Room Layouts', phase: 'v1', description: 'Floor plan editor, templates, version management' },
  { key: 'reporting', name: 'Reports & Exports', phase: 'v1', description: 'Read models, daily sales, CSV/PDF export' },
  { key: 'semantic', name: 'OppsEra AI Assistant', phase: 'v1', description: 'Ask questions in plain English, get instant analytics, charts, and insights powered by AI' },
  { key: 'api_access', name: 'API Access', phase: 'v3', description: 'Public API with OAuth2 client credentials' },
];

function ModuleStatusBadge({ mod, enabled, hasEntitlement }: { mod: typeof MODULES[number]; enabled: boolean; hasEntitlement: boolean }) {
  const isComingSoon = mod.phase !== 'v1';
  if (isComingSoon) {
    return (
      <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700">
        Coming Soon
      </span>
    );
  }
  if (enabled) {
    return (
      <span className="inline-flex rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700">
        Active
      </span>
    );
  }
  if (hasEntitlement) {
    return (
      <span className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-600">
        Disabled
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-gray-500/15 px-2 py-0.5 text-xs font-medium text-gray-500">
      Not Enabled
    </span>
  );
}

function ModuleActions({
  mod,
  enabled: _enabled,
  hasEntitlement,
  enablingModule,
  togglingModule,
  canEnable,
  canDisable,
  onEnable,
  onToggle,
}: {
  mod: typeof MODULES[number];
  enabled?: boolean;
  hasEntitlement: boolean;
  enablingModule: string | null;
  togglingModule: string | null;
  canEnable: boolean;
  canDisable: boolean;
  onEnable: (key: string) => void;
  onToggle: (key: string, enable: boolean) => void;
}) {
  if (canEnable && !hasEntitlement) {
    return (
      <button
        type="button"
        onClick={() => onEnable(mod.key)}
        disabled={enablingModule === mod.key}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {enablingModule === mod.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Enable
      </button>
    );
  }
  if (canEnable && hasEntitlement) {
    return (
      <button
        type="button"
        onClick={() => onToggle(mod.key, true)}
        disabled={togglingModule === mod.key}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {togglingModule === mod.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Enable
      </button>
    );
  }
  if (canDisable) {
    return (
      <button
        type="button"
        onClick={() => onToggle(mod.key, false)}
        disabled={togglingModule === mod.key}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-surface px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
      >
        {togglingModule === mod.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        Disable
      </button>
    );
  }
  return null;
}

function ModulesTab() {
  const [enablingModule, setEnablingModule] = useState<string | null>(null);
  const [togglingModule, setTogglingModule] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { entitlements, isModuleEnabled, refetch: refetchEntitlements } = useEntitlementsContext();
  const { can } = usePermissions();

  const handleEnableModule = useCallback(async (moduleKey: string) => {
    setEnablingModule(moduleKey);
    try {
      await apiFetch('/api/v1/entitlements', {
        method: 'POST',
        body: JSON.stringify({ moduleKey }),
      });
      await refetchEntitlements();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    } finally {
      setEnablingModule(null);
    }
  }, [refetchEntitlements]);

  const handleToggleModule = useCallback(async (moduleKey: string, enable: boolean) => {
    setTogglingModule(moduleKey);
    try {
      await apiFetch('/api/v1/entitlements', {
        method: 'PATCH',
        body: JSON.stringify({ moduleKey, isEnabled: enable }),
      });
      await refetchEntitlements();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    } finally {
      setTogglingModule(null);
    }
  }, [refetchEntitlements]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Modules</h2>
          <p className="mt-1 text-sm text-gray-500">
            Modules enabled for your account. Enable available modules or contact support for upgrades.
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-gray-200 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-gray-200/70 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            title="Grid view"
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-gray-200/70 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => {
            const ent = entitlements.get(mod.key);
            const enabled = isModuleEnabled(mod.key);
            const isComingSoon = mod.phase !== 'v1';
            const isCore = mod.key === 'platform_core';
            const hasEntitlement = !!ent;
            const canEnable = !isComingSoon && !enabled && !isCore && can('settings.update');
            const canDisable = enabled && !isCore && can('settings.update');

            return (
              <div
                key={mod.key}
                className={`rounded-lg border p-4 ${
                  enabled
                    ? 'border-gray-200 bg-surface'
                    : 'border-gray-200/60 bg-gray-500/5'
                }`}
              >
                <div className="flex items-start justify-between">
                  <h3 className={`text-sm font-semibold ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {mod.name}
                  </h3>
                  <ModuleStatusBadge mod={mod} enabled={enabled} hasEntitlement={hasEntitlement} />
                </div>
                <p className={`mt-1.5 text-xs ${enabled ? 'text-gray-500' : 'text-gray-400'}`}>
                  {mod.description}
                </p>
                {ent && enabled && Object.keys(ent.limits).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(ent.limits).map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex rounded bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-700"
                      >
                        {value} {key.replace('max_', '').replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                )}
                {ent && (
                  <p className="mt-2 text-xs text-gray-400">
                    Plan: {ent.planTier}
                  </p>
                )}
                <div className="mt-3">
                  <ModuleActions
                    mod={mod}
                    enabled={enabled}
                    hasEntitlement={hasEntitlement}
                    enablingModule={enablingModule}
                    togglingModule={togglingModule}
                    canEnable={canEnable}
                    canDisable={canDisable}
                    onEnable={handleEnableModule}
                    onToggle={handleToggleModule}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-500/5">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Module</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 sm:table-cell">Plan</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 md:table-cell">Limits</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {MODULES.map((mod) => {
                const ent = entitlements.get(mod.key);
                const enabled = isModuleEnabled(mod.key);
                const isComingSoon = mod.phase !== 'v1';
                const isCore = mod.key === 'platform_core';
                const hasEntitlement = !!ent;
                const canEnable = !isComingSoon && !enabled && !isCore && can('settings.update');
                const canDisable = enabled && !isCore && can('settings.update');

                return (
                  <tr key={mod.key} className="hover:bg-gray-200/30">
                    <td className="px-4 py-3">
                      <p className={`text-sm font-medium ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>{mod.name}</p>
                      <p className={`mt-0.5 text-xs ${enabled ? 'text-gray-500' : 'text-gray-400'}`}>{mod.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ModuleStatusBadge mod={mod} enabled={enabled} hasEntitlement={hasEntitlement} />
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {ent ? (
                        <span className="text-xs text-gray-500">{ent.planTier}</span>
                      ) : (
                        <span className="text-xs text-gray-400">&mdash;</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {ent && enabled && Object.keys(ent.limits).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(ent.limits).map(([key, value]) => (
                            <span
                              key={key}
                              className="inline-flex rounded bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-700"
                            >
                              {value} {key.replace('max_', '').replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ModuleActions
                        mod={mod}
                        enabled={enabled}
                        hasEntitlement={hasEntitlement}
                        enablingModule={enablingModule}
                        togglingModule={togglingModule}
                        canEnable={canEnable}
                        canDisable={canDisable}
                        onEnable={handleEnableModule}
                        onToggle={handleToggleModule}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Dashboard Settings Tab ─────────────────────────────────────────

const DASHBOARD_PREFS_KEY = 'dashboard_prefs';
const DASHBOARD_NOTES_KEY = 'dashboard_notes';

interface DashboardPrefs {
  showSales: boolean;
  showOrders: boolean;
  showLowStock: boolean;
  showNotes: boolean;
  showRecentOrders: boolean;
}

const DEFAULT_DASHBOARD_PREFS: DashboardPrefs = {
  showSales: true,
  showOrders: true,
  showLowStock: true,
  showNotes: true,
  showRecentOrders: true,
};

function DashboardSettingsTab() {
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD_PREFS);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DASHBOARD_PREFS_KEY);
      if (raw) setPrefs({ ...DEFAULT_DASHBOARD_PREFS, ...JSON.parse(raw) });
      setNotes(localStorage.getItem(DASHBOARD_NOTES_KEY) ?? '');
    } catch { /* ignore */ }
  }, []);

  const handleToggle = useCallback((key: keyof DashboardPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    flashSaved();
  }, []);

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    try { localStorage.setItem(DASHBOARD_NOTES_KEY, value); } catch { /* ignore */ }
  }, []);

  const flashSaved = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, []);

  const widgets = [
    { key: 'showSales' as const, label: 'Total Sales Today', description: 'Sum of all paid/placed orders for the current business day' },
    { key: 'showOrders' as const, label: 'Orders Today', description: 'Count of non-voided orders for today' },
    { key: 'showLowStock' as const, label: 'Low Stock Alerts', description: 'Items below their reorder point' },
    { key: 'showRecentOrders' as const, label: 'Recent Orders', description: 'Last 5 orders with status and totals' },
    { key: 'showNotes' as const, label: 'Notes Widget', description: 'Quick notes and reminders on the dashboard' },
  ];

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
      <p className="mt-1 text-sm text-gray-500">
        Choose which widgets appear on your dashboard home page.
      </p>

      {saved && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-sm text-green-700">
          <Check className="h-4 w-4" /> Saved
        </div>
      )}

      {/* Widget Toggles */}
      <div className="mt-6 space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Widgets</h3>
        <div className="space-y-3">
          {widgets.map((w) => (
            <label key={w.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50/50">
              <input
                type="checkbox"
                checked={prefs[w.key]}
                onChange={() => handleToggle(w.key)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{w.label}</p>
                <p className="text-xs text-gray-500">{w.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Notes Editor */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-gray-700">Dashboard Notes</h3>
        <p className="mt-1 text-xs text-gray-500">
          These notes appear on your dashboard. Great for daily specials, shift reminders, or team messages.
        </p>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Quick notes, reminders, daily specials..."
          className="mt-3 w-full resize-y rounded-lg border border-gray-300 bg-transparent p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          rows={6}
        />
        <p className="mt-1 text-xs text-gray-400">Saved to this browser (localStorage)</p>
      </div>
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────

function AuditLogTab() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Audit Log</h2>
      <p className="mt-1 text-sm text-gray-500">
        View all activity and changes across your organization.
      </p>
      <div className="mt-6">
        <AuditLogViewer showActor pageSize={50} />
      </div>
    </div>
  );
}
