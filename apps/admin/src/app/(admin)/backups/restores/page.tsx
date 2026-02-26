'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Filter,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useRestoreOperations, useRestoreActions } from '@/hooks/use-backups';
import { useAdminAuth } from '@/hooks/use-admin-auth';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGES: Record<string, { className: string; icon?: typeof CheckCircle }> = {
  pending_approval: { className: 'bg-yellow-500/10 text-yellow-500', icon: Clock },
  approved: { className: 'bg-blue-500/10 text-blue-500', icon: CheckCircle },
  in_progress: { className: 'bg-blue-500/10 text-blue-500', icon: Loader2 },
  completed: { className: 'bg-green-500/10 text-green-500', icon: CheckCircle },
  failed: { className: 'bg-red-500/10 text-red-500', icon: XCircle },
  rejected: { className: 'bg-red-500/10 text-red-500', icon: XCircle },
};

export default function RestoreOperationsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { session } = useAdminAuth();
  const { items, isLoading, hasMore, loadMore, refresh } = useRestoreOperations({
    status: statusFilter || undefined,
  });
  const { approve, reject, isActing } = useRestoreActions();

  const handleApprove = async (id: string) => {
    try {
      await approve(id);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve');
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    try {
      await reject(rejectId, rejectReason);
      setRejectId(null);
      setRejectReason('');
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject');
    }
  };

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Restore Operations</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track and approve database restore requests.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-slate-400" />
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading && items.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <RotateCcw className="mx-auto h-8 w-8 text-slate-500 mb-3" />
          <p className="text-slate-300 font-medium">No restore operations</p>
          <p className="text-sm text-slate-500 mt-1">
            Restore operations appear here when you request a database restore.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 font-medium text-slate-400">Backup</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Tables</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Rows</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Safety Backup</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Created</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {items.map((op) => {
                const badge = STATUS_BADGES[op.status] ?? { className: 'bg-slate-500/10 text-slate-400' };
                const BadgeIcon = badge.icon;
                const canApprove = op.status === 'pending_approval' && op.requestedByAdminId !== session?.adminId;
                const canReject = op.status === 'pending_approval';

                return (
                  <tr key={op.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/backups/${op.backupId}`}
                        className="text-indigo-400 hover:text-indigo-300 text-xs"
                      >
                        {op.backup.label ?? op.backupId.slice(-8)}
                      </Link>
                      <p className="text-xs text-slate-500 capitalize mt-0.5">
                        {op.backup.type?.replace('_', ' ')} — {op.backup.tableCount ?? '?'} tables, {op.backup.rowCount?.toLocaleString() ?? '?'} rows
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                        {BadgeIcon && <BadgeIcon size={10} className={op.status === 'in_progress' ? 'animate-spin' : ''} />}
                        {op.status.replace('_', ' ')}
                      </span>
                      {op.rejectionReason && (
                        <p className="text-xs text-red-400 mt-1">{op.rejectionReason}</p>
                      )}
                      {op.errorMessage && (
                        <p className="text-xs text-red-400 mt-1 truncate max-w-[200px]">{op.errorMessage}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 text-xs">{op.tablesRestored ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-300 text-xs">
                      {op.rowsRestored != null ? op.rowsRestored.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {op.safetyBackupId ? (
                        <Link
                          href={`/backups/${op.safetyBackupId}`}
                          className="text-indigo-400 hover:text-indigo-300 text-xs"
                        >
                          View safety backup
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {new Date(op.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canApprove && (
                          <button
                            onClick={() => handleApprove(op.id)}
                            disabled={isActing}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle size={12} />
                            Approve
                          </button>
                        )}
                        {canReject && (
                          <button
                            onClick={() => setRejectId(op.id)}
                            disabled={isActing}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50"
                          >
                            <XCircle size={12} />
                            Reject
                          </button>
                        )}
                        {op.status === 'pending_approval' && op.requestedByAdminId === session?.adminId && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <ShieldAlert size={12} />
                            Awaiting other admin
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore && (
            <div className="px-4 py-3 border-t border-slate-700 text-center">
              <button onClick={loadMore} className="text-sm text-indigo-400 hover:text-indigo-300">
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reject Dialog */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <XCircle size={18} className="text-red-400" />
              Reject Restore Request
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Provide a reason for rejecting this restore request.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Rejection reason..."
              rows={3}
              className="w-full bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 placeholder:text-slate-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isActing || !rejectReason.trim()}
                className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {isActing ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
