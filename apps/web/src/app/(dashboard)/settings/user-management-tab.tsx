'use client';

import { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react';
import { Clock, Edit3, Loader2, Plus, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useUsers, useRoles, useMyLocations, useInvalidateSettingsData } from '@/hooks/use-settings-data';
import type { ManagedUser, RoleOption } from '@/hooks/use-settings-data';
import { LoginHistoryModal } from '@/components/settings/login-history-modal';
import { useToast } from '@/components/ui/toast';

const EditUserModal = lazy(() => import('./user-management-edit-modal'));
const AddUserModal = lazy(() => import('./user-management-add-modal'));
const InviteUserModal = lazy(() => import('./user-management-invite-modal'));

// ── Loading skeleton ────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Locations', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {Array.from({ length: 5 }, (_, i) => (
              <tr key={i}>
                {Array.from({ length: 7 }, (_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Loading fallback for lazy modals ────────────────────────────
function ModalFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-8 shadow-2xl">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// ── Memoized user row ───────────────────────────────────────────
interface UserRowProps {
  user: ManagedUser;
  canManage: boolean;
  onEdit: (id: string) => void;
  onDeactivate: (id: string) => void;
  onResetPassword: (id: string) => void;
  onResetPins: (id: string) => void;
  onResendInvite: (user: ManagedUser) => void;
  onLoginHistory: (id: string, name: string) => void;
}

const UserRow = memo(function UserRow({ user, canManage, onEdit, onDeactivate, onResetPassword, onResetPins, onResendInvite, onLoginHistory }: UserRowProps) {
  const displayName = user.displayName || `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
        <span className="inline-flex items-center gap-1.5">
          {displayName}
          {user.hasOverridePin && <span title="Manager override PIN set"><ShieldCheck className="h-3.5 w-3.5 text-green-500" /></span>}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{user.roles.map((r) => r.name).join(', ') || 'None'}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{user.status}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{user.locations.map((l) => l.name).join(', ') || 'All / Unscoped'}</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {canManage && user.status !== 'inactive' && (
            <button type="button" onClick={() => onDeactivate(user.id)} className="text-xs text-red-500 hover:underline">Deactivate</button>
          )}
          {canManage && user.status === 'invited' && (
            <button type="button" onClick={() => onResendInvite(user)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
              <RefreshCw className="h-3 w-3" />Resend Invite
            </button>
          )}
          {canManage && (
            <button type="button" onClick={() => onResetPassword(user.id)} className="text-xs text-foreground hover:underline">Reset Password</button>
          )}
          {canManage && (
            <button type="button" onClick={() => onResetPins(user.id)} className="text-xs text-foreground hover:underline">Reset PINs</button>
          )}
          {canManage && (
            <button type="button" onClick={() => onEdit(user.id)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
              <Edit3 className="h-3 w-3" />Edit
            </button>
          )}
          <button type="button" onClick={() => onLoginHistory(user.id, displayName)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <Clock className="h-3 w-3" />Login History
          </button>
        </div>
      </td>
    </tr>
  );
});

// ── Main component ──────────────────────────────────────────────
export function UserManagementTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: rolesData = [], isLoading: rolesLoading } = useRoles();
  const { data: locations = [], isLoading: locsLoading } = useMyLocations();
  const { invalidateUsers, invalidateAll } = useInvalidateSettingsData();

  const roles: RoleOption[] = useMemo(() => rolesData.map((r) => ({ id: r.id, name: r.name })), [rolesData]);
  const isLoading = usersLoading || rolesLoading || locsLoading;

  // ── Modal visibility ──────────────────────────────────────────
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [loginHistoryUserId, setLoginHistoryUserId] = useState<string | null>(null);
  const [loginHistoryUserName, setLoginHistoryUserName] = useState('');

  // ── Modal callbacks (stable) ──────────────────────────────────
  const closeEdit = useCallback(() => setEditUserId(null), []);
  const closeAdd = useCallback(() => setShowAddModal(false), []);
  const closeInvite = useCallback(() => setShowInviteModal(false), []);

  const handleEditSaved = useCallback(() => { setEditUserId(null); invalidateAll(); }, [invalidateAll]);
  const handleAddSaved = useCallback(() => { setShowAddModal(false); invalidateUsers(); }, [invalidateUsers]);
  const handleInviteSaved = useCallback(() => { setShowInviteModal(false); invalidateUsers(); }, [invalidateUsers]);

  // ── Row action callbacks (stable) ─────────────────────────────
  const deactivateUser = useCallback(async (userId: string) => {
    try {
      await apiFetch(`/api/v1/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ userStatus: 'inactive' }) });
      invalidateUsers();
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message);
    }
  }, [invalidateUsers, toast]);

  const resendInvite = useCallback(async (user: ManagedUser) => {
    const fallbackRoleId = user.roles[0]?.id;
    if (!fallbackRoleId) return;
    try {
      await apiFetch('/api/v1/users/invite', { method: 'POST', body: JSON.stringify({ emailAddress: user.email, roleId: fallbackRoleId }) });
      toast.success('Invite resent');
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message);
    }
  }, [toast]);

  const resetPassword = useCallback(async (userId: string) => {
    try {
      await apiFetch(`/api/v1/users/${userId}/reset-password`, { method: 'POST' });
      toast.success('Password reset email sent');
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message);
    }
  }, [toast]);

  const resetPins = useCallback(async (userId: string) => {
    try {
      await apiFetch(`/api/v1/users/${userId}/reset-pin`, { method: 'POST', body: JSON.stringify({}) });
      toast.success('PINs reset');
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message);
    }
  }, [toast]);

  const openEdit = useCallback((id: string) => setEditUserId(id), []);
  const openLoginHistory = useCallback((id: string, name: string) => { setLoginHistoryUserId(id); setLoginHistoryUserName(name); }, []);

  // ── Render ────────────────────────────────────────────────────
  if (isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">User Management</h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowInviteModal(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
              <UserPlus className="h-4 w-4" />Invite User
            </button>
            <button type="button" onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus className="h-4 w-4" />Add New User
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
              <UserRow
                key={user.id}
                user={user}
                canManage={canManage}
                onEdit={openEdit}
                onDeactivate={deactivateUser}
                onResetPassword={resetPassword}
                onResetPins={resetPins}
                onResendInvite={resendInvite}
                onLoginHistory={openLoginHistory}
              />
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No users found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Lazy-loaded modals ─────────────────────────────────── */}
      <Suspense fallback={<ModalFallback />}>
        {editUserId && <EditUserModal userId={editUserId} roles={roles} locations={locations} onClose={closeEdit} onSaved={handleEditSaved} />}
        {showAddModal && <AddUserModal roles={roles} locations={locations} onClose={closeAdd} onSaved={handleAddSaved} />}
        {showInviteModal && <InviteUserModal roles={roles} locations={locations} onClose={closeInvite} onSaved={handleInviteSaved} />}
      </Suspense>

      {loginHistoryUserId && (
        <LoginHistoryModal userId={loginHistoryUserId} userName={loginHistoryUserName} onClose={() => setLoginHistoryUserId(null)} />
      )}
    </div>
  );
}
