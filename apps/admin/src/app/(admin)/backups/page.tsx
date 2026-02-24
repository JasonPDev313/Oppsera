'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Plus,
  Download,
  Trash2,
  RotateCcw,
  ChevronRight,
  Filter,
  HardDrive,
  Clock,
  Database,
  Calendar,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useBackups, useBackupStats, useBackupActions } from '@/hooks/use-backups';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'failed', label: 'Failed' },
];

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  manual: { label: 'Manual', className: 'bg-blue-100 text-blue-700' },
  scheduled: { label: 'Scheduled', className: 'bg-purple-100 text-purple-700' },
  pre_restore: { label: 'Pre-Restore', className: 'bg-yellow-100 text-yellow-700' },
};

const STATUS_BADGES: Record<string, { className: string }> = {
  pending: { className: 'bg-gray-100 text-gray-600' },
  in_progress: { className: 'bg-blue-100 text-blue-700' },
  completed: { className: 'bg-green-100 text-green-700' },
  failed: { className: 'bg-red-100 text-red-700' },
  expired: { className: 'bg-yellow-100 text-yellow-700' },
};

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let b = bytes;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function BackupsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { items, isLoading, hasMore, loadMore, refresh } = useBackups({
    status: statusFilter || undefined,
  });
  const { stats, refresh: refreshStats } = useBackupStats();
  const { createBackup, deleteBackup, isActing } = useBackupActions();

  const handleCreate = async () => {
    try {
      await createBackup(createLabel || undefined);
      setShowCreateDialog(false);
      setCreateLabel('');
      refresh();
      refreshStats();
    } catch {
      // error is displayed via isActing state
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const ok = await deleteBackup(deleteId);
    if (ok) {
      setDeleteId(null);
      refresh();
      refreshStats();
    }
  };

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Database Backups</h1>
          <p className="text-sm text-slate-400 mt-1">
            Backup and restore your Supabase database. Backups capture all data automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refresh(); refreshStats(); }}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 transition-colors"
          >
            <Plus size={14} />
            Create Backup
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Database size={14} className="text-slate-400" />
              <p className="text-xs font-medium text-slate-400">Total Backups</p>
            </div>
            <p className="text-2xl font-bold text-slate-100">{stats.totalBackups}</p>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-slate-400" />
              <p className="text-xs font-medium text-slate-400">Last Backup</p>
            </div>
            <p className="text-2xl font-bold text-slate-100">{timeAgo(stats.lastBackupAt)}</p>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <HardDrive size={14} className="text-slate-400" />
              <p className="text-xs font-medium text-slate-400">Storage Used</p>
            </div>
            <p className="text-2xl font-bold text-slate-100">{formatBytes(stats.totalSizeBytes)}</p>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} className="text-slate-400" />
              <p className="text-xs font-medium text-slate-400">Next Scheduled</p>
            </div>
            <p className="text-2xl font-bold text-slate-100">
              {stats.schedulingEnabled && stats.nextScheduledAt
                ? timeAgo(stats.nextScheduledAt).replace(' ago', '')
                : 'Off'}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-slate-400" />
        <div className="flex gap-1">
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
          <HardDrive className="mx-auto h-8 w-8 text-slate-500 mb-3" />
          <p className="text-slate-300 font-medium">No backups yet</p>
          <p className="text-sm text-slate-500 mt-1">Create your first backup to get started.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 font-medium text-slate-400">Label</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Tables</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Rows</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Size</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Age</th>
                <th className="text-right px-4 py-3 font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {items.map((backup) => {
                const typeBadge = TYPE_BADGES[backup.type] ?? { label: backup.type, className: 'bg-gray-100 text-gray-600' };
                const statusBadge = STATUS_BADGES[backup.status] ?? { className: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={backup.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/backups/${backup.id}`}
                        className="text-indigo-400 hover:text-indigo-300 text-xs"
                      >
                        {backup.label ?? backup.id.slice(-8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge.className}`}>
                        {typeBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}>
                        {backup.status === 'in_progress' && <Loader2 size={10} className="animate-spin" />}
                        {backup.status === 'completed' && <CheckCircle size={10} />}
                        {backup.status === 'failed' && <XCircle size={10} />}
                        {backup.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 text-xs">{backup.tableCount ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-300 text-xs">
                      {backup.rowCount != null ? backup.rowCount.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 text-xs">{formatBytes(backup.sizeBytes)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{timeAgo(backup.completedAt ?? backup.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {backup.status === 'completed' && (
                          <>
                            <a
                              href={`/api/v1/admin/backups/${backup.id}/download`}
                              className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                              title="Download"
                            >
                              <Download size={14} />
                            </a>
                            <Link
                              href={`/backups/${backup.id}?action=restore`}
                              className="p-1.5 rounded hover:bg-slate-600 text-orange-400 hover:text-orange-300 transition-colors"
                              title="Restore"
                            >
                              <RotateCcw size={14} />
                            </Link>
                          </>
                        )}
                        <button
                          onClick={() => setDeleteId(backup.id)}
                          disabled={backup.status === 'in_progress'}
                          className="p-1.5 rounded hover:bg-slate-600 text-red-400 hover:text-red-300 transition-colors disabled:opacity-30"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                        <Link
                          href={`/backups/${backup.id}`}
                          className="p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                          title="Details"
                        >
                          <ChevronRight size={14} />
                        </Link>
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

      {/* Create Backup Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Plus size={18} className="text-indigo-400" />
              Create Manual Backup
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              This will export all database tables to a compressed backup file. The process may take a few minutes for large databases.
            </p>
            <input
              type="text"
              value={createLabel}
              onChange={(e) => setCreateLabel(e.target.value)}
              placeholder="Backup label (optional)..."
              className="w-full bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 placeholder:text-slate-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateDialog(false); setCreateLabel(''); }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isActing}
                className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {isActing ? 'Creating...' : 'Create Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Trash2 size={18} className="text-red-400" />
              Delete Backup
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              This will permanently delete the backup file and its database record. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isActing}
                className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {isActing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
