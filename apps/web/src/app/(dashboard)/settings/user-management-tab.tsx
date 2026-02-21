'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, Shield, UserPlus, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';

interface RoleOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
}

interface ManagedUser {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  status: 'invited' | 'active' | 'inactive' | 'locked';
  lastLoginAt: string | null;
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
}

interface AddUserForm {
  firstName: string;
  lastName: string;
  emailAddress: string;
  userName: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  userRole: string;
  userStatus: 'active' | 'inactive';
  posOverridePin: string;
  uniqueIdentificationPin: string;
  userTabColor: string;
  externalPayrollEmployeeId: string;
  forcePasswordReset: boolean;
  locationIds: string[];
}

const emptyAddForm: AddUserForm = {
  firstName: '',
  lastName: '',
  emailAddress: '',
  userName: '',
  password: '',
  confirmPassword: '',
  phoneNumber: '',
  userRole: '',
  userStatus: 'active',
  posOverridePin: '',
  uniqueIdentificationPin: '',
  userTabColor: '#4f46e5',
  externalPayrollEmployeeId: '',
  forcePasswordReset: false,
  locationIds: [],
};

export function UserManagementTab({ canManage }: { canManage: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [addForm, setAddForm] = useState<AddUserForm>(emptyAddForm);
  const [showPasswords, setShowPasswords] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    emailAddress: '',
    roleId: '',
    locationIds: [] as string[],
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersResp, rolesResp, meResp] = await Promise.all([
        apiFetch<{ data: ManagedUser[] }>('/api/v1/users'),
        apiFetch<{ data: RoleOption[] }>('/api/v1/roles'),
        apiFetch<{ data: { locations: Array<{ id: string; name: string }> } }>('/api/v1/me'),
      ]);
      setUsers(usersResp.data);
      setRoles(rolesResp.data.map((r) => ({ id: r.id, name: r.name })));
      setLocations(meResp.data.locations.map((l) => ({ id: l.id, name: l.name })));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canSubmitAdd = useMemo(() => {
    if (!addForm.firstName || !addForm.lastName || !addForm.emailAddress || !addForm.userName || !addForm.userRole) {
      return false;
    }
    if (addForm.password && addForm.password !== addForm.confirmPassword) {
      return false;
    }
    return true;
  }, [addForm]);

  const submitAddUser = useCallback(async () => {
    if (!canSubmitAdd) return;
    setIsSaving(true);
    try {
      await apiFetch('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          ...addForm,
          password: addForm.password || undefined,
          posOverridePin: addForm.posOverridePin || undefined,
          uniqueIdentificationPin: addForm.uniqueIdentificationPin || undefined,
          externalPayrollEmployeeId: addForm.externalPayrollEmployeeId || undefined,
        }),
      });
      setShowAddModal(false);
      setAddForm(emptyAddForm);
      await loadData();
    } catch (error) {
      if (error instanceof ApiError) alert(error.message);
    } finally {
      setIsSaving(false);
    }
  }, [addForm, canSubmitAdd, loadData]);

  const submitInvite = useCallback(async () => {
    if (!inviteForm.emailAddress || !inviteForm.roleId) return;
    setIsSaving(true);
    try {
      await apiFetch('/api/v1/users/invite', {
        method: 'POST',
        body: JSON.stringify(inviteForm),
      });
      setShowInviteModal(false);
      setInviteForm({ emailAddress: '', roleId: '', locationIds: [] });
      await loadData();
    } catch (error) {
      if (error instanceof ApiError) alert(error.message);
    } finally {
      setIsSaving(false);
    }
  }, [inviteForm, loadData]);

  const deactivateUser = useCallback(async (userId: string) => {
    await apiFetch(`/api/v1/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ userStatus: 'inactive' }),
    });
    await loadData();
  }, [loadData]);

  const resendInvite = useCallback(async (user: ManagedUser) => {
    const fallbackRoleId = user.roles[0]?.id;
    if (!fallbackRoleId) return;
    await apiFetch('/api/v1/users/invite', {
      method: 'POST',
      body: JSON.stringify({ emailAddress: user.email, roleId: fallbackRoleId }),
    });
  }, []);

  const resetPassword = useCallback(async (userId: string) => {
    await apiFetch(`/api/v1/users/${userId}/reset-password`, { method: 'POST' });
    alert('Password reset email sent');
  }, []);

  const resetPins = useCallback(async (userId: string) => {
    await apiFetch(`/api/v1/users/${userId}/reset-pin`, { method: 'POST', body: JSON.stringify({}) });
    alert('PINs reset');
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <UserPlus className="h-4 w-4" />
              Invite User
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add New User
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Last Login</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Locations</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-surface">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {user.displayName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{user.email}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {user.roles.map((r) => r.name).join(', ') || 'None'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{user.status}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {user.locations.map((l) => l.name).join(', ') || 'All / Unscoped'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage && user.status !== 'inactive' && (
                      <button type="button" onClick={() => deactivateUser(user.id)} className="text-xs text-red-600 hover:underline">
                        Deactivate
                      </button>
                    )}
                    {canManage && user.status === 'invited' && (
                      <button type="button" onClick={() => resendInvite(user)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                        <RefreshCw className="h-3 w-3" />
                        Resend Invite
                      </button>
                    )}
                    {canManage && (
                      <button type="button" onClick={() => resetPassword(user.id)} className="text-xs text-gray-700 hover:underline">
                        Reset Password
                      </button>
                    )}
                    {canManage && (
                      <button type="button" onClick={() => resetPins(user.id)} className="text-xs text-gray-700 hover:underline">
                        Reset PINs
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Add New User</h3>
              <button type="button" onClick={() => setShowAddModal(false)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input placeholder="First Name" className="rounded border px-3 py-2 text-sm" value={addForm.firstName} onChange={(e) => setAddForm((p) => ({ ...p, firstName: e.target.value }))} />
              <input placeholder="Last Name" className="rounded border px-3 py-2 text-sm" value={addForm.lastName} onChange={(e) => setAddForm((p) => ({ ...p, lastName: e.target.value }))} />
              <input placeholder="Email Address" className="rounded border px-3 py-2 text-sm" value={addForm.emailAddress} onChange={(e) => setAddForm((p) => ({ ...p, emailAddress: e.target.value }))} />
              <input placeholder="User Name" className="rounded border px-3 py-2 text-sm" value={addForm.userName} onChange={(e) => setAddForm((p) => ({ ...p, userName: e.target.value }))} />
              <input type={showPasswords ? 'text' : 'password'} placeholder="Password (optional)" className="rounded border px-3 py-2 text-sm" value={addForm.password} onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))} />
              <input type={showPasswords ? 'text' : 'password'} placeholder="Confirm Password" className="rounded border px-3 py-2 text-sm" value={addForm.confirmPassword} onChange={(e) => setAddForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
              <input placeholder="Phone Number" className="rounded border px-3 py-2 text-sm" value={addForm.phoneNumber} onChange={(e) => setAddForm((p) => ({ ...p, phoneNumber: e.target.value }))} />
              <select className="rounded border px-3 py-2 text-sm" value={addForm.userRole} onChange={(e) => setAddForm((p) => ({ ...p, userRole: e.target.value }))}>
                <option value="">Select Role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className="rounded border px-3 py-2 text-sm" value={addForm.userStatus} onChange={(e) => setAddForm((p) => ({ ...p, userStatus: e.target.value as 'active' | 'inactive' }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <input placeholder="POS Override PIN" className="rounded border px-3 py-2 text-sm" value={addForm.posOverridePin} onChange={(e) => setAddForm((p) => ({ ...p, posOverridePin: e.target.value }))} />
              <input placeholder="Unique Identification PIN" className="rounded border px-3 py-2 text-sm" value={addForm.uniqueIdentificationPin} onChange={(e) => setAddForm((p) => ({ ...p, uniqueIdentificationPin: e.target.value }))} />
              <div className="rounded border px-3 py-2 text-sm">
                <label className="mb-1 block text-xs text-gray-500">User Tab Color</label>
                <input type="color" value={addForm.userTabColor} onChange={(e) => setAddForm((p) => ({ ...p, userTabColor: e.target.value }))} />
              </div>
              <input placeholder="External Payroll Employee ID" className="rounded border px-3 py-2 text-sm" value={addForm.externalPayrollEmployeeId} onChange={(e) => setAddForm((p) => ({ ...p, externalPayrollEmployeeId: e.target.value }))} />
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-gray-500">Locations</label>
                <div className="grid grid-cols-2 gap-2 rounded border p-3">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={addForm.locationIds.includes(l.id)}
                        onChange={(e) =>
                          setAddForm((p) => ({
                            ...p,
                            locationIds: e.target.checked
                              ? [...p.locationIds, l.id]
                              : p.locationIds.filter((id) => id !== l.id),
                          }))
                        }
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
                Show passwords
              </label>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={addForm.forcePasswordReset} onChange={(e) => setAddForm((p) => ({ ...p, forcePasswordReset: e.target.checked }))} />
                Force password reset on first login
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded border px-3 py-2 text-sm">Cancel</button>
              <button type="button" disabled={!canSubmitAdd || isSaving} onClick={submitAddUser} className="inline-flex items-center gap-2 rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Invite User</h3>
              <button type="button" onClick={() => setShowInviteModal(false)}>
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <input placeholder="Email Address" className="w-full rounded border px-3 py-2 text-sm" value={inviteForm.emailAddress} onChange={(e) => setInviteForm((p) => ({ ...p, emailAddress: e.target.value }))} />
              <select className="w-full rounded border px-3 py-2 text-sm" value={inviteForm.roleId} onChange={(e) => setInviteForm((p) => ({ ...p, roleId: e.target.value }))}>
                <option value="">Select Role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <div className="rounded border p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500"><Shield className="h-3 w-3" /> Optional Location Scope</div>
                <div className="grid grid-cols-2 gap-2">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={inviteForm.locationIds.includes(l.id)}
                        onChange={(e) =>
                          setInviteForm((p) => ({
                            ...p,
                            locationIds: e.target.checked
                              ? [...p.locationIds, l.id]
                              : p.locationIds.filter((id) => id !== l.id),
                          }))
                        }
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowInviteModal(false)} className="rounded border px-3 py-2 text-sm">Cancel</button>
              <button type="button" disabled={!inviteForm.emailAddress || !inviteForm.roleId || isSaving} onClick={submitInvite} className="inline-flex items-center gap-2 rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
