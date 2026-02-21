'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Shield, Clock, Mail, Phone, Key, Ban, Trash2,
  RotateCcw, AlertTriangle, CheckCircle2, Send,
} from 'lucide-react';
import { useStaffDetail, useAdminAudit, useAdminRoles } from '@/hooks/use-staff';
import { useAdminAuth } from '@/hooks/use-admin-auth';
import type { StaffStatus } from '@/types/users';

function StatusBadge({ status }: { status: StaffStatus }) {
  const config: Record<StaffStatus, { color: string; label: string }> = {
    active: { color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', label: 'Active' },
    invited: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', label: 'Invited' },
    suspended: { color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', label: 'Suspended' },
    deleted: { color: 'bg-red-500/10 text-red-400 border-red-500/30', label: 'Deleted' },
  };
  const { color, label } = config[status] ?? config.active;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
}

type Tab = 'profile' | 'access' | 'activity';

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAdminAuth();
  const { data: staff, isLoading, error, load, update, suspend, unsuspend, deleteStaff, resetPassword, resendInvite } = useStaffDetail(params.id);
  const { data: auditData, load: loadAudit } = useAdminAudit(params.id);
  const { data: roles, load: loadRoles } = useAdminRoles();

  const [tab, setTab] = useState<Tab>('profile');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Modal states
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  useEffect(() => { load(); loadRoles(); }, [load, loadRoles]);
  useEffect(() => {
    if (tab === 'activity') loadAudit();
  }, [tab, loadAudit]);
  useEffect(() => {
    if (staff) {
      setEditName(staff.name);
      setEditPhone(staff.phone ?? '');
    }
  }, [staff]);

  const isSuperAdmin = session?.role === 'super_admin';
  const isSelf = session?.adminId === params.id;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await update({ name: editName, phone: editPhone || undefined });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch { /* error handled by hook */ }
    setIsSaving(false);
  };

  const handleSuspend = async () => {
    try {
      await suspend(suspendReason);
      setShowSuspend(false);
      setSuspendReason('');
    } catch { /* handled */ }
  };

  const handleDelete = async () => {
    try {
      await deleteStaff(deleteReason, deleteConfirm);
      router.push('/users/staff');
    } catch { /* handled */ }
  };

  if (isLoading && !staff) {
    return (
      <div className="p-6 flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/users/staff" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-6">
          <ArrowLeft size={14} /> Back to Staff
        </Link>
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error ?? 'Staff member not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back */}
      <Link href="/users/staff" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to Staff
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <span className="text-lg font-bold text-indigo-400">{staff.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{staff.name}</h1>
            <p className="text-sm text-slate-400">{staff.email}</p>
          </div>
          <StatusBadge status={staff.status} />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {staff.status === 'invited' && (
            <button onClick={() => resendInvite()} className="flex items-center gap-2 px-3 py-1.5 text-xs text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors">
              <Send size={12} /> Resend Invite
            </button>
          )}
          {staff.status !== 'deleted' && (
            <button onClick={() => resetPassword()} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-800 transition-colors">
              <Key size={12} /> Reset Password
            </button>
          )}
          {!isSelf && staff.status === 'active' && (
            <button onClick={() => setShowSuspend(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/10 transition-colors">
              <Ban size={12} /> Suspend
            </button>
          )}
          {staff.status === 'suspended' && (
            <button onClick={() => unsuspend()} className="flex items-center gap-2 px-3 py-1.5 text-xs text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 transition-colors">
              <RotateCcw size={12} /> Unsuspend
            </button>
          )}
          {isSuperAdmin && !isSelf && staff.status !== 'deleted' && (
            <button onClick={() => setShowDelete(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700">
        {(['profile', 'access', 'activity'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'text-indigo-400 border-indigo-500' : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            {t === 'access' ? 'Access & Roles' : t}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4 p-5 bg-slate-800/50 rounded-xl border border-slate-700">
              <h3 className="text-sm font-medium text-slate-300">Profile Information</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Full Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Phone</label>
                <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Optional" />
              </div>
              <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : saveSuccess ? <CheckCircle2 size={14} /> : null}
                {saveSuccess ? 'Saved' : 'Save Changes'}
              </button>
            </div>

            <div className="space-y-4 p-5 bg-slate-800/50 rounded-xl border border-slate-700">
              <h3 className="text-sm font-medium text-slate-300">Account Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <Mail size={14} className="text-slate-500" />
                  {staff.email}
                </div>
                {staff.phone && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Phone size={14} className="text-slate-500" />
                    {staff.phone}
                  </div>
                )}
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock size={14} className="text-slate-500" />
                  Created {new Date(staff.createdAt).toLocaleDateString()}
                </div>
                {staff.lastLoginAt && (
                  <div className="flex items-center gap-2 text-slate-300">
                    <Clock size={14} className="text-slate-500" />
                    Last login {new Date(staff.lastLoginAt).toLocaleString()}
                  </div>
                )}
                {staff.invitedByAdminName && (
                  <div className="text-xs text-slate-500">
                    Invited by {staff.invitedByAdminName}
                  </div>
                )}
                {staff.passwordResetRequired && (
                  <div className="flex items-center gap-2 text-amber-400 text-xs">
                    <AlertTriangle size={12} />
                    Password reset required on next login
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Access Tab */}
      {tab === 'access' && (
        <div className="space-y-4 p-5 bg-slate-800/50 rounded-xl border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300">Assigned Roles</h3>
          {staff.roles.length > 0 ? (
            <div className="space-y-2">
              {staff.roles.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-700 bg-slate-800/50">
                  <Shield size={16} className="text-indigo-400" />
                  <span className="text-sm text-white font-medium">{r.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No roles assigned.</p>
          )}
          <p className="text-xs text-slate-500 mt-4">
            Legacy role: <span className="text-slate-400 capitalize">{staff.legacyRole.replace('_', ' ')}</span>
          </p>
        </div>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <div className="space-y-3">
          {auditData?.items.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 px-4 py-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{entry.action}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {entry.entityType} &middot; {new Date(entry.createdAt).toLocaleString()}
                </p>
                {entry.reason && <p className="text-xs text-slate-500 mt-1">Reason: {entry.reason}</p>}
              </div>
            </div>
          ))}
          {auditData?.items.length === 0 && (
            <p className="text-center py-8 text-slate-500 text-sm">No audit entries found.</p>
          )}
          {auditData?.hasMore && (
            <button onClick={() => loadAudit({ cursor: auditData.cursor ?? '' })} className="w-full py-3 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl hover:border-slate-600 transition-colors">
              Load more
            </button>
          )}
        </div>
      )}

      {/* Suspend Modal */}
      {showSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowSuspend(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Suspend Staff Member</h3>
            <p className="text-sm text-slate-400 mb-4">This will prevent <strong className="text-white">{staff.name}</strong> from logging in.</p>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Reason for suspension…"
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowSuspend(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={handleSuspend} className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700">Suspend</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowDelete(false)}>
          <div className="bg-slate-800 border border-red-500/30 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Delete Staff Member</h3>
            </div>
            <p className="text-sm text-slate-400 mb-4">This will permanently deactivate <strong className="text-white">{staff.name}</strong>. They will lose all access. This action cannot be undone.</p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Reason for deletion (required)…"
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
            />
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">Type <strong className="text-red-400">DELETE</strong> to confirm</label>
              <input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="DELETE"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== 'DELETE' || !deleteReason.trim()}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
