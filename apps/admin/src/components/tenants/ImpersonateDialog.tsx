'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Shield, X } from 'lucide-react';
import { adminFetch } from '@/lib/api-fetch';

interface TenantUser {
  id: string;
  email: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

interface ImpersonateDialogProps {
  tenantId: string;
  tenantName: string;
  open: boolean;
  onClose: () => void;
}

export function ImpersonateDialog({ tenantId, tenantName, open, onClose }: ImpersonateDialogProps) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load users when dialog opens
  useEffect(() => {
    if (!open) return;
    setIsLoadingUsers(true);
    setError(null);
    adminFetch<{ data: TenantUser[] }>(`/api/v1/tenants/${tenantId}/users`)
      .then((res) => {
        const active = res.data.filter((u) => u.status === 'active');
        setUsers(active);
        if (active.length > 0) setSelectedUserId(active[0]!.id);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load users');
      })
      .finally(() => setIsLoadingUsers(false));
  }, [open, tenantId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedUserId('');
      setReason('');
      setDuration(60);
      setError(null);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!selectedUserId || reason.trim().length < 10) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: { url: string; sessionId: string } }>(
        `/api/v1/tenants/${tenantId}/impersonate`,
        {
          method: 'POST',
          body: JSON.stringify({
            targetUserId: selectedUserId,
            reason: reason.trim(),
            maxDurationMinutes: duration,
          }),
        },
      );
      // Open tenant app in new tab
      window.open(res.data.url, '_blank');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start impersonation');
    } finally {
      setIsSubmitting(false);
    }
  }, [tenantId, selectedUserId, reason, duration, onClose]);

  if (!open) return null;

  const getUserLabel = (u: TenantUser) => {
    const name = u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unnamed';
    return `${name} (${u.email})`;
  };

  const isValid = selectedUserId && reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Impersonate User</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Tenant info */}
          <div className="text-sm text-slate-400">
            Tenant: <span className="font-medium text-white">{tenantName}</span>
          </div>

          {/* User Selection */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Select User</label>
            {isLoadingUsers ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Loading users...
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-slate-500">No active users found for this tenant.</p>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {getUserLabel(u)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Reason <span className="text-slate-500">(required, min 10 characters)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Investigating reported issue with..."
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
            {reason.length > 0 && reason.trim().length < 10 && (
              <p className="mt-1 text-xs text-red-400">
                {10 - reason.trim().length} more characters needed
              </p>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes (default)</option>
              <option value={120}>2 hours</option>
              <option value={240}>4 hours</option>
              <option value={480}>8 hours</option>
            </select>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300">
              You will see the tenant app as this user. All actions are logged and attributed to your admin account.
              Some operations are restricted during impersonation.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting || isLoadingUsers}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Starting...
              </>
            ) : (
              <>
                <Shield size={14} /> Start Session
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
