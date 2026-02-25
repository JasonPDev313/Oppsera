'use client';

import { useState, useEffect } from 'react';
import { Search, Lock, Shield, KeyRound, ChevronRight, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { useAdminUserSearch, useAdminUserDetail, useAdminUserActions, type AdminUser } from '@/hooks/use-admin-users';

function UserStatusBadge({ status, isLocked }: { status: string; isLocked: boolean }) {
  if (isLocked) return <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">Locked</span>;
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    suspended: 'bg-red-500/10 text-red-400 border-red-500/30',
    invited: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    deleted: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${colors[status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>{status}</span>;
}

export default function GlobalUsersPage() {
  const { users, isLoading, error, hasMore, search } = useAdminUserSearch();
  const _adminUserDetail = useAdminUserDetail(null);
  const { performAction, isActing } = useAdminUserActions();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lockedFilter, setLockedFilter] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [showActionDialog, setShowActionDialog] = useState<string | null>(null);

  const filters = {
    search: searchTerm || undefined,
    status: statusFilter || undefined,
    isLocked: lockedFilter || undefined,
  };

  useEffect(() => {
    search(filters);
  }, [searchTerm, statusFilter, lockedFilter]);

  const handleUserClick = (user: AdminUser) => {
    setDetailUser(user);
    setSelectedUserId(user.id);
    setShowDetail(true);
  };

  const handleAction = async (action: string) => {
    if (!selectedUserId) return;
    const ok = await performAction(selectedUserId, action, actionReason || undefined);
    if (ok) {
      setShowActionDialog(null);
      setActionReason('');
      search(filters);
    }
  };

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Global User Search</h1>
        <p className="text-sm text-slate-400 mt-1">Search and manage users across all tenants.</p>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="invited">Invited</option>
        </select>
        <button
          onClick={() => setLockedFilter(!lockedFilter)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
            lockedFilter ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Lock size={14} />
          Locked Only
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Results Table */}
      {isLoading && users.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Searching...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-12">
          <Search className="mx-auto h-8 w-8 text-slate-500 mb-3" />
          <p className="text-slate-300 font-medium">No users found</p>
          <p className="text-sm text-slate-500 mt-1">Try adjusting your search criteria.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 font-medium text-slate-400">User</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Tenant</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Roles</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Last Login</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {users.map(user => (
                <tr key={user.id} onClick={() => handleUserClick(user)} className="hover:bg-slate-700/50 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    <p className="text-slate-200 font-medium">{user.displayName ?? user.name ?? user.email}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-300 text-xs">{user.tenantName ?? '---'}</p>
                    <p className="text-xs text-slate-500 font-mono">{user.tenantSlug}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{user.roleNames ?? '---'}</td>
                  <td className="px-4 py-3">
                    <UserStatusBadge status={user.status} isLocked={user.isLocked} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={14} className="text-slate-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="px-4 py-3 border-t border-slate-700 text-center">
              <button onClick={() => search(filters, true)} className="text-sm text-indigo-400 hover:text-indigo-300">Load more</button>
            </div>
          )}
        </div>
      )}

      {/* User Detail Slide-over */}
      {showDetail && detailUser && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDetail(false)} />
          <div className="relative bg-slate-900 w-full max-w-lg border-l border-slate-700 overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-5 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold text-white">User Detail</h2>
              <button onClick={() => setShowDetail(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-6">
              {/* Identity */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Identity</h3>
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Name</span>
                    <span className="text-slate-200">{detailUser.displayName ?? detailUser.name ?? '---'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Email</span>
                    <span className="text-slate-200">{detailUser.email}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Phone</span>
                    <span className="text-slate-200">{detailUser.phone ?? '---'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Tenant</span>
                    <span className="text-slate-200">{detailUser.tenantName} ({detailUser.tenantSlug})</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">ID</span>
                    <span className="text-slate-200 font-mono text-xs">{detailUser.id}</span>
                  </div>
                </div>
              </div>

              {/* Security */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield size={12} />
                  Security
                </h3>
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Status</span>
                    <UserStatusBadge status={detailUser.status} isLocked={detailUser.isLocked} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">MFA</span>
                    <span className={`text-sm ${detailUser.mfaEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {detailUser.mfaEnabled ? 'Enabled' : 'Not enabled'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Failed Logins</span>
                    <span className={`text-sm ${(detailUser.failedLoginCount ?? 0) > 3 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {detailUser.failedLoginCount ?? 0}
                    </span>
                  </div>
                  {detailUser.lockedUntil && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Locked Until</span>
                      <span className="text-red-400">{new Date(detailUser.lockedUntil).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Password Reset Required</span>
                    <span className={detailUser.passwordResetRequired ? 'text-amber-400' : 'text-slate-500'}>
                      {detailUser.passwordResetRequired ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Last Login</span>
                    <span className="text-slate-300">{detailUser.lastLoginAt ? new Date(detailUser.lastLoginAt).toLocaleString() : 'Never'}</span>
                  </div>
                </div>
              </div>

              {/* Roles */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound size={12} />
                  Roles
                </h3>
                <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
                  {detailUser.roleNames ? (
                    <div className="flex flex-wrap gap-1.5">
                      {detailUser.roleNames.split(', ').map(role => (
                        <span key={role} className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs rounded-full">
                          {role}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No roles assigned</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  {detailUser.isLocked ? (
                    <button
                      onClick={() => setShowActionDialog('unlock')}
                      disabled={isActing}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      <Lock size={12} />
                      Unlock Account
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowActionDialog('lock')}
                      disabled={isActing}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <Lock size={12} />
                      Lock Account
                    </button>
                  )}
                  <button
                    onClick={() => setShowActionDialog('force_password_reset')}
                    disabled={isActing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
                  >
                    <RotateCcw size={12} />
                    Force PW Reset
                  </button>
                  <button
                    onClick={() => setShowActionDialog('reset_mfa')}
                    disabled={isActing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors"
                  >
                    <Shield size={12} />
                    Reset MFA
                  </button>
                  <button
                    onClick={() => setShowActionDialog('revoke_sessions')}
                    disabled={isActing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 transition-colors"
                  >
                    <AlertTriangle size={12} />
                    Revoke Sessions
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Dialog */}
      {showActionDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400" />
              Confirm Action: {showActionDialog.replace('_', ' ')}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              This action will be applied to <strong className="text-slate-200">{detailUser?.displayName ?? detailUser?.email}</strong>.
            </p>
            <textarea
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Reason (optional)..."
              rows={2}
              className="w-full bg-slate-900 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 placeholder:text-slate-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowActionDialog(null); setActionReason(''); }} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button
                onClick={() => handleAction(showActionDialog)}
                disabled={isActing}
                className="px-4 py-2 text-sm rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                {isActing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
