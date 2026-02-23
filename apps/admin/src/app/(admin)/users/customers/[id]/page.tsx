'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Clock,
  Key,
  Lock,
  Mail,
  MapPin,
  Shield,
  Unlock,
  User,
} from 'lucide-react';
import { useCustomerDetail } from '@/hooks/use-customers-admin';

type Tab = 'profile' | 'access';

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    active: { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Active' },
    invited: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Invited' },
    inactive: { color: 'bg-slate-500/10 text-slate-400 border-slate-500/30', label: 'Inactive' },
    locked: { color: 'bg-red-500/10 text-red-400 border-red-500/30', label: 'Locked' },
  };
  const { color, label } = config[status] ?? { color: 'bg-slate-500/10 text-slate-400 border-slate-500/30', label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${color}`}>
      {label}
    </span>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('profile');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [editName, setEditName] = useState({ firstName: '', lastName: '' });
  const [editPhone, setEditPhone] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const {
    data: customer,
    isLoading,
    error,
    load,
    update,
    suspend,
    unsuspend,
    resetPassword,
    resendInvite,
  } = useCustomerDetail(id);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (customer) {
      setEditName({ firstName: customer.firstName ?? '', lastName: customer.lastName ?? '' });
      setEditPhone(customer.phone ?? '');
    }
  }, [customer]);

  const handleSave = async () => {
    setActionLoading('save');
    try {
      await update({
        firstName: editName.firstName || undefined,
        lastName: editName.lastName || undefined,
        phoneNumber: editPhone || undefined,
      });
      setIsEditing(false);
    } catch { /* error handled by hook */ }
    setActionLoading(null);
  };

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action);
    try {
      await fn();
    } catch { /* error handled by hook */ }
    setActionLoading(null);
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error ?? 'Customer not found'}
        </div>
        <Link href="/users/customers" className="mt-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft size={14} /> Back to Customers
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back + Header */}
      <Link href="/users/customers" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-4">
        <ArrowLeft size={14} /> Back to Customers
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">
              {customer.displayName || customer.name}
            </h1>
            <StatusBadge status={customer.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <Mail size={12} /> {customer.email}
            </span>
            <span className="flex items-center gap-1">
              <Building2 size={12} /> {customer.tenantName}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {customer.status === 'invited' && (
            <button
              onClick={() => handleAction('invite', resendInvite)}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors"
            >
              <Mail size={12} />
              {actionLoading === 'invite' ? 'Sending…' : 'Resend Invite'}
            </button>
          )}

          <button
            onClick={() => handleAction('reset', resetPassword)}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/10 transition-colors"
          >
            <Key size={12} />
            {actionLoading === 'reset' ? 'Resetting…' : 'Reset Password'}
          </button>

          {customer.status === 'locked' ? (
            <button
              onClick={() => handleAction('unsuspend', unsuspend)}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 transition-colors"
            >
              <Unlock size={12} />
              {actionLoading === 'unsuspend' ? 'Unlocking…' : 'Unlock'}
            </button>
          ) : customer.status !== 'invited' ? (
            <button
              onClick={() => setShowSuspendModal(true)}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <Lock size={12} />
              Lock Account
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-700 mb-6">
        {[
          { key: 'profile' as const, label: 'Profile', icon: User },
          { key: 'access' as const, label: 'Access & Roles', icon: Shield },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'profile' && (
        <div className="space-y-6">
          {/* Identity Card */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Identity</h2>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={actionLoading === 'save'}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    {actionLoading === 'save' ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs text-slate-500 block mb-1">First Name</label>
                {isEditing ? (
                  <input
                    value={editName.firstName}
                    onChange={(e) => setEditName((prev) => ({ ...prev, firstName: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-white">{customer.firstName || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Last Name</label>
                {isEditing ? (
                  <input
                    value={editName.lastName}
                    onChange={(e) => setEditName((prev) => ({ ...prev, lastName: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-white">{customer.lastName || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Email</label>
                <p className="text-white">{customer.email}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Phone</label>
                {isEditing ? (
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-white">{customer.phone || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Username</label>
                <p className="text-white">{customer.username || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Display Name</label>
                <p className="text-white">{customer.displayName || '—'}</p>
              </div>
            </div>
          </div>

          {/* Account Card */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Account Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Status</label>
                <StatusBadge status={customer.status} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Membership</label>
                <p className="text-white capitalize">{customer.membershipStatus || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Password Reset Required</label>
                <p className="text-white">{customer.passwordResetRequired ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Auth Provider ID</label>
                <p className="text-slate-300 text-xs font-mono">
                  {customer.authProviderId || <span className="text-slate-500 italic">Not linked</span>}
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Last Login</label>
                <p className="text-white flex items-center gap-1">
                  <Clock size={12} className="text-slate-500" />
                  {customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleString() : 'Never'}
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Created</label>
                <p className="text-white">{new Date(customer.createdAt).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Tenant Card */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Tenant</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                <Building2 size={18} className="text-indigo-400" />
              </div>
              <div>
                <p className="text-white font-medium">{customer.tenantName}</p>
                <p className="text-xs text-slate-400">{customer.tenantSlug} &middot; {customer.tenantId}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'access' && (
        <div className="space-y-6">
          {/* Roles */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Assigned Roles</h2>
            {customer.roles.length > 0 ? (
              <div className="space-y-2">
                {customer.roles.map((role) => (
                  <div key={role.id} className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-lg">
                    <Shield size={14} className="text-indigo-400" />
                    <span className="text-sm text-white">{role.name}</span>
                    <span className="text-xs text-slate-500 font-mono">{role.id}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No roles assigned</p>
            )}
          </div>

          {/* Locations */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Location Access</h2>
            {customer.locations.length > 0 ? (
              <div className="space-y-2">
                {customer.locations.map((loc) => (
                  <div key={loc.id} className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-lg">
                    <MapPin size={14} className="text-emerald-400" />
                    <span className="text-sm text-white">{loc.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">All locations (no restrictions)</p>
            )}
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-2">Lock Account</h3>
            <p className="text-sm text-slate-400 mb-4">
              This will lock {customer.displayName || customer.name}&apos;s account, preventing them from logging in.
            </p>

            <label className="text-xs text-slate-400 block mb-1">Reason (optional)</label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 mb-4 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Why is this account being locked?"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowSuspendModal(false); setSuspendReason(''); }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleAction('suspend', () => suspend(suspendReason || undefined));
                  setShowSuspendModal(false);
                  setSuspendReason('');
                }}
                disabled={actionLoading === 'suspend'}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                {actionLoading === 'suspend' ? 'Locking…' : 'Lock Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
