'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Plus, X } from 'lucide-react';
import { adminFetch, AdminApiError } from '@/lib/api-fetch';

interface RoleOption { id: string; name: string }
interface LocationOption { id: string; name: string }

interface TenantUser {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  status: 'invited' | 'active' | 'inactive' | 'locked';
  lastLoginAt: string | null;
  // listUsers maps phone→phoneNumber; getUserById returns raw 'phone'
  phoneNumber?: string | null;
  phone?: string | null;
  tabColor: string | null;
  externalPayrollEmployeeId: string | null;
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
}

interface UserForm {
  firstName: string;
  lastName: string;
  emailAddress: string;
  userName: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  userRole: string;
  userStatus: string;
  posOverridePin: string;
  uniqueIdentificationPin: string;
  userTabColor: string;
  externalPayrollEmployeeId: string;
  forcePasswordReset: boolean;
  locationIds: string[];
}

const emptyForm: UserForm = {
  firstName: '', lastName: '', emailAddress: '', userName: '',
  password: '', confirmPassword: '', phoneNumber: '', userRole: '',
  userStatus: 'active', posOverridePin: '', uniqueIdentificationPin: '',
  userTabColor: '#4f46e5', externalPayrollEmployeeId: '',
  forcePasswordReset: false, locationIds: [],
};

export function TenantUsersTab({ tenantId }: { tenantId: string }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<UserForm>(emptyForm);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<UserForm>(emptyForm);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersRes, metaRes] = await Promise.all([
        adminFetch<{ data: TenantUser[] }>(`/api/v1/tenants/${tenantId}/users`),
        adminFetch<{ data: { roles: RoleOption[]; locations: LocationOption[] } }>(`/api/v1/tenants/${tenantId}/users/meta`),
      ]);
      setUsers(usersRes.data);
      setRoles(metaRes.data.roles);
      setLocations(metaRes.data.locations);
    } catch (err) {
      console.error('[TenantUsersTab] load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Add User ─────────────────────────────────────────────────
  const canSubmitAdd = useMemo(() => {
    if (!addForm.firstName || !addForm.lastName || !addForm.emailAddress || !addForm.userName || !addForm.userRole) return false;
    if (addForm.password && addForm.password !== addForm.confirmPassword) return false;
    return true;
  }, [addForm]);

  const submitAdd = useCallback(async () => {
    if (!canSubmitAdd) return;
    setIsSaving(true);
    try {
      await adminFetch(`/api/v1/tenants/${tenantId}/users`, {
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
      setAddForm(emptyForm);
      await loadData();
    } catch (err) {
      if (err instanceof AdminApiError) alert(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [addForm, canSubmitAdd, tenantId, loadData]);

  // ── Edit User ────────────────────────────────────────────────
  const openEditModal = useCallback(async (userId: string) => {
    setEditLoading(true);
    setEditUserId(userId);
    try {
      const res = await adminFetch<{ data: TenantUser }>(`/api/v1/tenants/${tenantId}/users/${userId}`);
      const u = res.data;
      setEditForm({
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        emailAddress: u.email,
        userName: u.username ?? '',
        phoneNumber: u.phoneNumber ?? u.phone ?? '',
        userRole: u.roles[0]?.id ?? '',
        userStatus: u.status,
        password: '', confirmPassword: '',
        posOverridePin: '', uniqueIdentificationPin: '',
        userTabColor: u.tabColor ?? '#4f46e5',
        externalPayrollEmployeeId: u.externalPayrollEmployeeId ?? '',
        forcePasswordReset: false,
        locationIds: u.locations.map((l) => l.id),
      });
      setShowEditModal(true);
    } catch (err) {
      if (err instanceof AdminApiError) alert(err.message);
    } finally {
      setEditLoading(false);
    }
  }, [tenantId]);

  const canSubmitEdit = useMemo(() => {
    return !!(editForm.firstName && editForm.lastName && editForm.emailAddress && editForm.userName && editForm.userRole);
  }, [editForm]);

  const submitEdit = useCallback(async () => {
    if (!canSubmitEdit || !editUserId) return;
    setIsSaving(true);
    try {
      await adminFetch(`/api/v1/tenants/${tenantId}/users/${editUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          emailAddress: editForm.emailAddress,
          userName: editForm.userName,
          phoneNumber: editForm.phoneNumber || undefined,
          userRole: editForm.userRole,
          userStatus: editForm.userStatus,
          posOverridePin: editForm.posOverridePin || undefined,
          uniqueIdentificationPin: editForm.uniqueIdentificationPin || undefined,
          userTabColor: editForm.userTabColor || undefined,
          externalPayrollEmployeeId: editForm.externalPayrollEmployeeId || undefined,
          locationIds: editForm.locationIds,
        }),
      });
      setShowEditModal(false);
      setEditUserId(null);
      setEditForm(emptyForm);
      await loadData();
    } catch (err) {
      if (err instanceof AdminApiError) alert(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [editForm, canSubmitEdit, editUserId, tenantId, loadData]);

  const deactivateUser = useCallback(async (userId: string) => {
    if (!confirm('Deactivate this user?')) return;
    try {
      await adminFetch(`/api/v1/tenants/${tenantId}/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ userStatus: 'inactive' }),
      });
      await loadData();
    } catch (err) {
      if (err instanceof AdminApiError) alert(err.message);
    }
  }, [tenantId, loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
  const selectCls = 'w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">
          {users.length} user{users.length !== 1 ? 's' : ''}
        </h3>
        <button
          type="button"
          onClick={() => { setAddForm(emptyForm); setShowAddModal(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-lg border border-slate-700">
        <table className="min-w-full divide-y divide-slate-700">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-400 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-400 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-400 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-400 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-400 uppercase">Last Login</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-400 uppercase">Locations</th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700 bg-slate-800/50">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-white">
                  {user.displayName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{user.email}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">
                  {user.roles.map((r) => r.name).join(', ') || 'None'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <StatusBadge status={user.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {user.locations.map((l) => l.name).join(', ') || 'All'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(user.id)}
                      disabled={editLoading}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </button>
                    {user.status !== 'inactive' && (
                      <button
                        type="button"
                        onClick={() => deactivateUser(user.id)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No users found for this tenant
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add User Modal ────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Add New User</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input placeholder="First Name" className={inputCls} value={addForm.firstName} onChange={(e) => setAddForm((p) => ({ ...p, firstName: e.target.value }))} />
              <input placeholder="Last Name" className={inputCls} value={addForm.lastName} onChange={(e) => setAddForm((p) => ({ ...p, lastName: e.target.value }))} />
              <input placeholder="Email Address" className={inputCls} value={addForm.emailAddress} onChange={(e) => setAddForm((p) => ({ ...p, emailAddress: e.target.value }))} />
              <input placeholder="User Name" className={inputCls} value={addForm.userName} onChange={(e) => setAddForm((p) => ({ ...p, userName: e.target.value }))} />
              <input type={showPasswords ? 'text' : 'password'} placeholder="Password (optional)" className={inputCls} value={addForm.password} onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))} />
              <input type={showPasswords ? 'text' : 'password'} placeholder="Confirm Password" className={inputCls} value={addForm.confirmPassword} onChange={(e) => setAddForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
              <input placeholder="Phone Number" className={inputCls} value={addForm.phoneNumber} onChange={(e) => setAddForm((p) => ({ ...p, phoneNumber: e.target.value }))} />
              <select className={selectCls} value={addForm.userRole} onChange={(e) => setAddForm((p) => ({ ...p, userRole: e.target.value }))}>
                <option value="">Select Role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className={selectCls} value={addForm.userStatus} onChange={(e) => setAddForm((p) => ({ ...p, userStatus: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <input placeholder="POS Override PIN" className={inputCls} value={addForm.posOverridePin} onChange={(e) => setAddForm((p) => ({ ...p, posOverridePin: e.target.value }))} />
              <input placeholder="Unique Identification PIN" className={inputCls} value={addForm.uniqueIdentificationPin} onChange={(e) => setAddForm((p) => ({ ...p, uniqueIdentificationPin: e.target.value }))} />
              <div className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm">
                <label className="mb-1 block text-xs text-slate-400">User Tab Color</label>
                <input type="color" className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" value={addForm.userTabColor} onChange={(e) => setAddForm((p) => ({ ...p, userTabColor: e.target.value }))} />
              </div>
              <input placeholder="External Payroll Employee ID" className={inputCls} value={addForm.externalPayrollEmployeeId} onChange={(e) => setAddForm((p) => ({ ...p, externalPayrollEmployeeId: e.target.value }))} />
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Locations</label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-600 bg-slate-700 p-3">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={addForm.locationIds.includes(l.id)}
                        onChange={(e) =>
                          setAddForm((p) => ({
                            ...p,
                            locationIds: e.target.checked
                              ? [...p.locationIds, l.id]
                              : p.locationIds.filter((x) => x !== l.id),
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                      />
                      {l.name}
                    </label>
                  ))}
                  {locations.length === 0 && <p className="text-xs text-slate-500">No locations</p>}
                </div>
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} className="h-4 w-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500" />
                Show passwords
              </label>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={addForm.forcePasswordReset} onChange={(e) => setAddForm((p) => ({ ...p, forcePasswordReset: e.target.checked }))} className="h-4 w-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500" />
                Force password reset on first login
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">Cancel</button>
              <button type="button" disabled={!canSubmitAdd || isSaving} onClick={submitAdd} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ───────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Edit User</h3>
              <button type="button" onClick={() => { setShowEditModal(false); setEditUserId(null); setEditForm(emptyForm); }} className="rounded-lg p-1 text-slate-400 hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input placeholder="First Name" className={inputCls} value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} />
              <input placeholder="Last Name" className={inputCls} value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} />
              <input placeholder="Email Address" className={inputCls} value={editForm.emailAddress} onChange={(e) => setEditForm((p) => ({ ...p, emailAddress: e.target.value }))} />
              <input placeholder="User Name" className={inputCls} value={editForm.userName} onChange={(e) => setEditForm((p) => ({ ...p, userName: e.target.value }))} />
              <input placeholder="Phone Number" className={inputCls} value={editForm.phoneNumber} onChange={(e) => setEditForm((p) => ({ ...p, phoneNumber: e.target.value }))} />
              <select className={selectCls} value={editForm.userRole} onChange={(e) => setEditForm((p) => ({ ...p, userRole: e.target.value }))}>
                <option value="">Select Role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className={selectCls} value={editForm.userStatus} onChange={(e) => setEditForm((p) => ({ ...p, userStatus: e.target.value }))}>
                <option value="invited">Invited</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="locked">Locked</option>
              </select>
              <input placeholder="POS Override PIN (leave blank to keep unchanged)" className={inputCls} value={editForm.posOverridePin} onChange={(e) => setEditForm((p) => ({ ...p, posOverridePin: e.target.value }))} />
              <input placeholder="Unique ID PIN (leave blank to keep unchanged)" className={inputCls} value={editForm.uniqueIdentificationPin} onChange={(e) => setEditForm((p) => ({ ...p, uniqueIdentificationPin: e.target.value }))} />
              <div className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm">
                <label className="mb-1 block text-xs text-slate-400">User Tab Color</label>
                <input type="color" className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" value={editForm.userTabColor} onChange={(e) => setEditForm((p) => ({ ...p, userTabColor: e.target.value }))} />
              </div>
              <input placeholder="External Payroll Employee ID" className={inputCls} value={editForm.externalPayrollEmployeeId} onChange={(e) => setEditForm((p) => ({ ...p, externalPayrollEmployeeId: e.target.value }))} />
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Locations</label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-600 bg-slate-700 p-3">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={editForm.locationIds.includes(l.id)}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            locationIds: e.target.checked
                              ? [...p.locationIds, l.id]
                              : p.locationIds.filter((x) => x !== l.id),
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-500 text-blue-600 focus:ring-blue-500"
                      />
                      {l.name}
                    </label>
                  ))}
                  {locations.length === 0 && <p className="text-xs text-slate-500">No locations</p>}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowEditModal(false); setEditUserId(null); setEditForm(emptyForm); }} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700">Cancel</button>
              <button type="button" disabled={!canSubmitEdit || isSaving} onClick={submitEdit} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    invited: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    inactive: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    locked: 'bg-red-500/10 text-red-400 border-red-500/30',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.inactive}`}>
      {status}
    </span>
  );
}
