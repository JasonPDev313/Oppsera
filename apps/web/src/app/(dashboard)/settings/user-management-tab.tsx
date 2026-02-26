'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Clock, Edit3, Loader2, Plus, RefreshCw, Shield, UserPlus, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useUsers, useRoles, useMyLocations, useInvalidateSettingsData } from '@/hooks/use-settings-data';
import type { ManagedUser, RoleOption } from '@/hooks/use-settings-data';
import type { PMSProperty } from '@/hooks/use-pms';
import { LoginHistoryModal } from '@/components/settings/login-history-modal';

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

interface UserDetail extends ManagedUser {
  phone: string | null;
  tabColor: string | null;
  externalPayrollEmployeeId: string | null;
}

interface EditUserForm {
  firstName: string;
  lastName: string;
  emailAddress: string;
  userName: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  userRole: string;
  additionalRoleIds: string[];
  userStatus: 'invited' | 'active' | 'inactive' | 'locked';
  posOverridePin: string;
  uniqueIdentificationPin: string;
  userTabColor: string;
  externalPayrollEmployeeId: string;
  locationIds: string[];
}

const emptyEditForm: EditUserForm = {
  firstName: '',
  lastName: '',
  emailAddress: '',
  userName: '',
  password: '',
  confirmPassword: '',
  phoneNumber: '',
  userRole: '',
  additionalRoleIds: [],
  userStatus: 'active',
  posOverridePin: '',
  uniqueIdentificationPin: '',
  userTabColor: '#4f46e5',
  externalPayrollEmployeeId: '',
  locationIds: [],
};

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
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: rolesData = [], isLoading: rolesLoading } = useRoles();
  const { data: locations = [], isLoading: locsLoading } = useMyLocations();
  const { invalidateUsers, invalidateAll } = useInvalidateSettingsData();

  const roles: RoleOption[] = useMemo(() => rolesData.map((r) => ({ id: r.id, name: r.name })), [rolesData]);
  const isLoading = usersLoading || rolesLoading || locsLoading;

  const [isSaving, setIsSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [addForm, setAddForm] = useState<AddUserForm>(emptyAddForm);

  // ── Login History ─────────────────────────────────────────────
  const [loginHistoryUserId, setLoginHistoryUserId] = useState<string | null>(null);
  const [loginHistoryUserName, setLoginHistoryUserName] = useState('');

  // ── Module Designations (inside Edit modal) ───────────────────
  const [hkProperties, setHkProperties] = useState<PMSProperty[]>([]);
  const [editDesignations, setEditDesignations] = useState<{
    housekeeperEnabled: boolean;
    housekeeperPropertyId: string;
    housekeeperExistingRecordId: string | null;
  }>({ housekeeperEnabled: false, housekeeperPropertyId: '', housekeeperExistingRecordId: null });
  const [designationsExpanded, setDesignationsExpanded] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    emailAddress: '',
    roleId: '',
    locationIds: [] as string[],
  });

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
      invalidateUsers();
    } catch (error) {
      if (error instanceof ApiError) alert(error.message);
    } finally {
      setIsSaving(false);
    }
  }, [addForm, canSubmitAdd, invalidateUsers]);

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
      invalidateUsers();
    } catch (error) {
      if (error instanceof ApiError) alert(error.message);
    } finally {
      setIsSaving(false);
    }
  }, [inviteForm, invalidateUsers]);

  const deactivateUser = useCallback(async (userId: string) => {
    await apiFetch(`/api/v1/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ userStatus: 'inactive' }),
    });
    invalidateUsers();
  }, [invalidateUsers]);

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

  // ── Edit User ───────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<EditUserForm>(emptyEditForm);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [showEditPasswords, setShowEditPasswords] = useState(false);

  const openEditModal = useCallback(async (userId: string) => {
    setEditLoading(true);
    setEditUserId(userId);
    setDesignationsExpanded(false);
    try {
      // Fetch user detail + housekeeper status + PMS properties in parallel
      const [userRes, hkRes, propsRes] = await Promise.all([
        apiFetch<{ data: UserDetail }>(`/api/v1/users/${userId}`),
        apiFetch<{ data: Array<{ id: string; propertyId: string; propertyName: string | null; isActive: boolean }> }>(`/api/v1/pms/housekeepers/by-user?userId=${userId}`).catch(() => ({ data: [] as Array<{ id: string; propertyId: string; propertyName: string | null; isActive: boolean }> })),
        apiFetch<{ data: PMSProperty[] }>('/api/v1/pms/properties').catch(() => ({ data: [] as PMSProperty[] })),
      ]);

      const u = userRes.data;
      setEditForm({
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        emailAddress: u.email,
        userName: u.username ?? '',
        password: '',
        confirmPassword: '',
        phoneNumber: u.phone ?? '',
        userRole: u.roles[0]?.id ?? '',
        additionalRoleIds: u.roles.slice(1).map((r) => r.id),
        userStatus: u.status,
        posOverridePin: '',
        uniqueIdentificationPin: '',
        userTabColor: u.tabColor ?? '#4f46e5',
        externalPayrollEmployeeId: u.externalPayrollEmployeeId ?? '',
        locationIds: u.locations.map((l) => l.id),
      });

      // Set housekeeper designation state
      setHkProperties(propsRes.data);
      const activeHk = hkRes.data.find((h) => h.isActive);
      setEditDesignations({
        housekeeperEnabled: !!activeHk,
        housekeeperPropertyId: activeHk?.propertyId ?? (propsRes.data.length === 1 ? propsRes.data[0]!.id : ''),
        housekeeperExistingRecordId: activeHk?.id ?? null,
      });

      setShowEditModal(true);
    } catch (error) {
      if (error instanceof ApiError) alert(error.message);
    } finally {
      setEditLoading(false);
    }
  }, []);

  const canSubmitEdit = useMemo(() => {
    if (!editForm.firstName || !editForm.lastName || !editForm.emailAddress || !editForm.userName || !editForm.userRole) {
      return false;
    }
    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      return false;
    }
    if (editForm.password && editForm.password.length < 8) {
      return false;
    }
    return true;
  }, [editForm]);

  const submitEditUser = useCallback(async () => {
    if (!canSubmitEdit || !editUserId) return;
    setIsSaving(true);
    try {
      const { confirmPassword: _confirm, ...rest } = editForm;
      await apiFetch(`/api/v1/users/${editUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...rest,
          password: editForm.password || undefined,
          additionalRoleIds: editForm.additionalRoleIds.length > 0 ? editForm.additionalRoleIds : undefined,
          posOverridePin: editForm.posOverridePin || undefined,
          uniqueIdentificationPin: editForm.uniqueIdentificationPin || undefined,
          externalPayrollEmployeeId: editForm.externalPayrollEmployeeId || undefined,
        }),
      });

      // Handle housekeeper designation (best-effort, don't block save)
      if (editDesignations.housekeeperEnabled && !editDesignations.housekeeperExistingRecordId && editDesignations.housekeeperPropertyId) {
        await apiFetch('/api/v1/pms/housekeepers/from-user', {
          method: 'POST',
          body: JSON.stringify({ userId: editUserId, propertyId: editDesignations.housekeeperPropertyId }),
        }).catch(() => { /* best-effort */ });
      }

      setShowEditModal(false);
      setShowEditPasswords(false);
      setEditUserId(null);
      setEditForm(emptyEditForm);
      setEditDesignations({ housekeeperEnabled: false, housekeeperPropertyId: '', housekeeperExistingRecordId: null });
      invalidateAll();
    } catch (error) {
      if (error instanceof ApiError) alert(error.message);
    } finally {
      setIsSaving(false);
    }
  }, [editForm, canSubmitEdit, editUserId, editDesignations, invalidateAll]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">User Management</h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
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

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">Last Login</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">Locations</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  {user.displayName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                  {user.roles.map((r) => r.name).join(', ') || 'None'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{user.status}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {user.locations.map((l) => l.name).join(', ') || 'All / Unscoped'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage && user.status !== 'inactive' && (
                      <button type="button" onClick={() => deactivateUser(user.id)} className="text-xs text-red-500 hover:underline">
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
                      <button type="button" onClick={() => resetPassword(user.id)} className="text-xs text-foreground hover:underline">
                        Reset Password
                      </button>
                    )}
                    {canManage && (
                      <button type="button" onClick={() => resetPins(user.id)} className="text-xs text-foreground hover:underline">
                        Reset PINs
                      </button>
                    )}
                    {canManage && (
                      <button type="button" onClick={() => openEditModal(user.id)} disabled={editLoading} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setLoginHistoryUserId(user.id);
                        setLoginHistoryUserName(user.displayName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                    >
                      <Clock className="h-3 w-3" />
                      Login History
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Add New User</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input placeholder="First Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.firstName} onChange={(e) => setAddForm((p) => ({ ...p, firstName: e.target.value }))} />
              <input placeholder="Last Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.lastName} onChange={(e) => setAddForm((p) => ({ ...p, lastName: e.target.value }))} />
              <input placeholder="Email Address" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.emailAddress} onChange={(e) => setAddForm((p) => ({ ...p, emailAddress: e.target.value }))} />
              <input placeholder="User Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.userName} onChange={(e) => setAddForm((p) => ({ ...p, userName: e.target.value }))} />
              <input type={showPasswords ? 'text' : 'password'} placeholder="Password (optional)" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.password} onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))} />
              <input type={showPasswords ? 'text' : 'password'} placeholder="Confirm Password" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.confirmPassword} onChange={(e) => setAddForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
              <input placeholder="Phone Number" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.phoneNumber} onChange={(e) => setAddForm((p) => ({ ...p, phoneNumber: e.target.value }))} />
              <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.userRole} onChange={(e) => setAddForm((p) => ({ ...p, userRole: e.target.value }))}>
                <option value="" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Select Role</option>
                {roles.map((r) => <option key={r.id} value={r.id} style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>{r.name}</option>)}
              </select>
              <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.userStatus} onChange={(e) => setAddForm((p) => ({ ...p, userStatus: e.target.value as 'active' | 'inactive' }))}>
                <option value="active" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Active</option>
                <option value="inactive" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Inactive</option>
              </select>
              <input placeholder="POS Override PIN" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.posOverridePin} onChange={(e) => setAddForm((p) => ({ ...p, posOverridePin: e.target.value }))} />
              <input placeholder="Unique Identification PIN" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.uniqueIdentificationPin} onChange={(e) => setAddForm((p) => ({ ...p, uniqueIdentificationPin: e.target.value }))} />
              <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
                <label className="mb-1 block text-xs text-muted-foreground">User Tab Color</label>
                <input type="color" className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" value={addForm.userTabColor} onChange={(e) => setAddForm((p) => ({ ...p, userTabColor: e.target.value }))} />
              </div>
              <input placeholder="External Payroll Employee ID" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={addForm.externalPayrollEmployeeId} onChange={(e) => setAddForm((p) => ({ ...p, externalPayrollEmployeeId: e.target.value }))} />
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Locations</label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted p-3">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm text-foreground">
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
                        className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500" />
                Show passwords
              </label>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={addForm.forcePasswordReset} onChange={(e) => setAddForm((p) => ({ ...p, forcePasswordReset: e.target.checked }))} className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500" />
                Force password reset on first login
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50">Cancel</button>
              <button type="button" disabled={!canSubmitAdd || isSaving} onClick={submitAddUser} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Invite User</h3>
              <button type="button" onClick={() => setShowInviteModal(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <input placeholder="Email Address" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={inviteForm.emailAddress} onChange={(e) => setInviteForm((p) => ({ ...p, emailAddress: e.target.value }))} />
              <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={inviteForm.roleId} onChange={(e) => setInviteForm((p) => ({ ...p, roleId: e.target.value }))}>
                <option value="" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Select Role</option>
                {roles.map((r) => <option key={r.id} value={r.id} style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>{r.name}</option>)}
              </select>
              <div className="rounded-lg border border-border bg-muted p-3">
                <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground"><Shield className="h-3 w-3" /> Optional Location Scope</div>
                <div className="grid grid-cols-2 gap-2">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm text-foreground">
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
                        className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowInviteModal(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50">Cancel</button>
              <button type="button" disabled={!inviteForm.emailAddress || !inviteForm.roleId || isSaving} onClick={submitInvite} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {loginHistoryUserId && (
        <LoginHistoryModal
          userId={loginHistoryUserId}
          userName={loginHistoryUserName}
          onClose={() => setLoginHistoryUserId(null)}
        />
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Edit User</h3>
              <button type="button" onClick={() => { setShowEditModal(false); setShowEditPasswords(false); setEditUserId(null); setEditForm(emptyEditForm); setEditDesignations({ housekeeperEnabled: false, housekeeperPropertyId: '', housekeeperExistingRecordId: null }); }} className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input placeholder="First Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} />
              <input placeholder="Last Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} />
              <input placeholder="Email Address" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.emailAddress} onChange={(e) => setEditForm((p) => ({ ...p, emailAddress: e.target.value }))} />
              <input placeholder="User Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.userName} onChange={(e) => setEditForm((p) => ({ ...p, userName: e.target.value }))} />
              <input placeholder="Phone Number" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.phoneNumber} onChange={(e) => setEditForm((p) => ({ ...p, phoneNumber: e.target.value }))} />
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Primary Role</label>
                <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.userRole} onChange={(e) => setEditForm((p) => ({ ...p, userRole: e.target.value, additionalRoleIds: p.additionalRoleIds.filter((id) => id !== e.target.value) }))}>
                  <option value="" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Select Role</option>
                  {roles.map((r) => <option key={r.id} value={r.id} style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>{r.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => { setShowEditPasswords((v) => !v); if (showEditPasswords) setEditForm((p) => ({ ...p, password: '', confirmPassword: '' })); }}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  {showEditPasswords ? 'Cancel password change' : 'Set new password'}
                </button>
                {showEditPasswords && (
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input type="password" placeholder="New Password (min 8 characters)" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))} />
                    <input type="password" placeholder="Confirm Password" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.confirmPassword} onChange={(e) => setEditForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
                    {editForm.password && editForm.confirmPassword && editForm.password !== editForm.confirmPassword && (
                      <p className="md:col-span-2 text-xs text-red-500">Passwords do not match</p>
                    )}
                    {editForm.password && editForm.password.length > 0 && editForm.password.length < 8 && (
                      <p className="md:col-span-2 text-xs text-red-500">Password must be at least 8 characters</p>
                    )}
                  </div>
                )}
              </div>
              <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.userStatus} onChange={(e) => setEditForm((p) => ({ ...p, userStatus: e.target.value as EditUserForm['userStatus'] }))}>
                <option value="invited" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Invited</option>
                <option value="active" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Active</option>
                <option value="inactive" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Inactive</option>
                <option value="locked" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Locked</option>
              </select>
              {roles.filter((r) => r.id !== editForm.userRole).length > 0 && (
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Additional Roles</label>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted p-3">
                    {roles.filter((r) => r.id !== editForm.userRole).map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={editForm.additionalRoleIds.includes(r.id)}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              additionalRoleIds: e.target.checked
                                ? [...p.additionalRoleIds, r.id]
                                : p.additionalRoleIds.filter((id) => id !== r.id),
                            }))
                          }
                          className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                        />
                        {r.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <input placeholder="POS Override PIN (leave blank to keep unchanged)" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.posOverridePin} onChange={(e) => setEditForm((p) => ({ ...p, posOverridePin: e.target.value }))} />
              <input placeholder="Unique ID PIN (leave blank to keep unchanged)" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.uniqueIdentificationPin} onChange={(e) => setEditForm((p) => ({ ...p, uniqueIdentificationPin: e.target.value }))} />
              <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
                <label className="mb-1 block text-xs text-muted-foreground">User Tab Color</label>
                <input type="color" className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" value={editForm.userTabColor} onChange={(e) => setEditForm((p) => ({ ...p, userTabColor: e.target.value }))} />
              </div>
              <input placeholder="External Payroll Employee ID" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={editForm.externalPayrollEmployeeId} onChange={(e) => setEditForm((p) => ({ ...p, externalPayrollEmployeeId: e.target.value }))} />
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Locations</label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted p-3">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={editForm.locationIds.includes(l.id)}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            locationIds: e.target.checked
                              ? [...p.locationIds, l.id]
                              : p.locationIds.filter((id) => id !== l.id),
                          }))
                        }
                        className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Module Designations ─────────────────────────── */}
              {hkProperties.length > 0 && (
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={() => setDesignationsExpanded((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-muted px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent/50"
                  >
                    <span>Module Designations</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${designationsExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {designationsExpanded && (
                    <div className="mt-2 space-y-3 rounded-lg border border-border bg-muted/50 p-4">
                      {/* Housekeeper */}
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="designation-housekeeper"
                          checked={editDesignations.housekeeperEnabled}
                          disabled={!!editDesignations.housekeeperExistingRecordId}
                          onChange={(e) => setEditDesignations((p) => ({ ...p, housekeeperEnabled: e.target.checked }))}
                          className="mt-0.5 h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <div className="flex-1">
                          <label htmlFor="designation-housekeeper" className="block text-sm font-medium text-foreground">
                            Housekeeper
                            {editDesignations.housekeeperExistingRecordId && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">Active</span>
                            )}
                          </label>
                          <p className="text-xs text-muted-foreground">Assign this user as a PMS housekeeper at a property.</p>
                          {editDesignations.housekeeperEnabled && !editDesignations.housekeeperExistingRecordId && (
                            <select
                              value={editDesignations.housekeeperPropertyId}
                              onChange={(e) => setEditDesignations((p) => ({ ...p, housekeeperPropertyId: e.target.value }))}
                              className="mt-2 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                            >
                              <option value="" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Select Property</option>
                              {hkProperties.map((p) => (
                                <option key={p.id} value={p.id} style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>{p.name}</option>
                              ))}
                            </select>
                          )}
                          {editDesignations.housekeeperExistingRecordId && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Assigned to: {hkProperties.find((p) => p.id === editDesignations.housekeeperPropertyId)?.name ?? 'Unknown property'}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Placeholder for future designations */}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowEditModal(false); setShowEditPasswords(false); setEditUserId(null); setEditForm(emptyEditForm); setEditDesignations({ housekeeperEnabled: false, housekeeperPropertyId: '', housekeeperExistingRecordId: null }); }} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50">Cancel</button>
              <button type="button" disabled={!canSubmitEdit || isSaving} onClick={submitEditUser} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
