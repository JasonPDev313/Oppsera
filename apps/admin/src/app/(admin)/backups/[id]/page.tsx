'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Trash2,
  RotateCcw,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useBackupDetail, useBackupActions } from '@/hooks/use-backups';

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let b = bytes;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function BackupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showRestoreOnLoad = searchParams.get('action') === 'restore';

  const { backup, isLoading, error, refresh } = useBackupDetail(id);
  const { deleteBackup, requestRestore, isActing } = useBackupActions();

  const [showRestore, setShowRestore] = useState(showRestoreOnLoad);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<{ restoreId: string; status: string; message: string } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [expandedManifest, setExpandedManifest] = useState(false);

  if (isLoading) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  if (error || !backup) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error ?? 'Backup not found'}</p>
        <Link href="/backups" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
          Back to backups
        </Link>
      </div>
    );
  }

  const expectedPhrase = `RESTORE-${backup.id.slice(-6)}`;
  const manifest = (backup.metadata as { tableManifest?: Array<{ name: string; rowCount: number }> })?.tableManifest;

  const handleRestore = async () => {
    setRestoreError(null);
    try {
      const result = await requestRestore(backup.id, confirmPhrase);
      setRestoreResult(result);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed');
    }
  };

  const handleDelete = async () => {
    const ok = await deleteBackup(backup.id);
    if (ok) router.push('/backups');
  };

  return (
    <div className="p-6 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/backups" className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-100">{backup.label ?? 'Backup Detail'}</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{backup.id}</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Status</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              backup.status === 'completed' ? 'bg-green-100 text-green-700' :
              backup.status === 'failed' ? 'bg-red-100 text-red-700' :
              backup.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {backup.status === 'completed' && <CheckCircle size={12} />}
              {backup.status === 'failed' && <XCircle size={12} />}
              {backup.status === 'in_progress' && <Loader2 size={12} className="animate-spin" />}
              {backup.status}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Type</p>
            <p className="text-sm text-slate-200 capitalize">{backup.type.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Tables</p>
            <p className="text-sm text-slate-200">{backup.tableCount ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Total Rows</p>
            <p className="text-sm text-slate-200">{backup.rowCount != null ? backup.rowCount.toLocaleString() : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">File Size</p>
            <p className="text-sm text-slate-200">{formatBytes(backup.sizeBytes)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Checksum (SHA-256)</p>
            <p className="text-xs text-slate-400 font-mono truncate">{backup.checksum ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Retention Tag</p>
            <p className="text-sm text-slate-200 capitalize">{backup.retentionTag ?? 'None (transient)'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Expires At</p>
            <p className="text-sm text-slate-200">
              {backup.expiresAt ? new Date(backup.expiresAt).toLocaleString() : 'Never'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Created</p>
            <p className="text-sm text-slate-200">{new Date(backup.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Completed</p>
            <p className="text-sm text-slate-200">
              {backup.completedAt ? new Date(backup.completedAt).toLocaleString() : '—'}
            </p>
          </div>
        </div>

        {backup.errorMessage && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-xs text-red-400 font-medium mb-1">Error</p>
            <p className="text-xs text-red-300 font-mono">{backup.errorMessage}</p>
          </div>
        )}
      </div>

      {/* Table Manifest */}
      {manifest && manifest.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 mb-6">
          <button
            onClick={() => setExpandedManifest((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-slate-200 hover:bg-slate-700/50 transition-colors"
          >
            <span>Table Manifest ({manifest.length} tables)</span>
            {expandedManifest ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {expandedManifest && (
            <div className="border-t border-slate-700 max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="text-left px-5 py-2 font-medium text-slate-400">Table</th>
                    <th className="text-right px-5 py-2 font-medium text-slate-400">Rows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {manifest.map((t) => (
                    <tr key={t.name} className="hover:bg-slate-700/30">
                      <td className="px-5 py-1.5 text-slate-300 font-mono">{t.name}</td>
                      <td className="px-5 py-1.5 text-right text-slate-400">{t.rowCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {backup.status === 'completed' && (
          <>
            <a
              href={`/api/v1/admin/backups/${backup.id}/download`}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
            >
              <Download size={14} />
              Download
            </a>
            <button
              onClick={() => setShowRestore(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-500 transition-colors"
            >
              <RotateCcw size={14} />
              Restore from this Backup
            </button>
          </>
        )}
        {backup.status !== 'in_progress' && (
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg text-sm hover:bg-red-600/30 transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        )}
      </div>

      {/* Restore Dialog */}
      {showRestore && !restoreResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-lg border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-400" />
              Restore Database
            </h3>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-300 font-medium">
                This will REPLACE ALL DATA in the database with the backup contents.
              </p>
              <p className="text-xs text-orange-300/80 mt-1">
                A safety backup will be created automatically before the restore begins.
              </p>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Type <code className="bg-slate-700 px-1.5 py-0.5 rounded text-orange-300 font-mono text-xs">{expectedPhrase}</code> to confirm:
            </p>
            <input
              type="text"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder={expectedPhrase}
              className="w-full bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 placeholder:text-slate-500 font-mono mb-4"
            />
            {restoreError && (
              <p className="text-sm text-red-400 mb-3">{restoreError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowRestore(false); setConfirmPhrase(''); setRestoreError(null); }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={isActing || confirmPhrase !== expectedPhrase}
                className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-orange-600 hover:bg-orange-500 transition-colors disabled:opacity-50"
              >
                {isActing ? 'Restoring...' : 'Restore Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Success Dialog */}
      {restoreResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <CheckCircle size={18} className="text-green-400" />
              Restore {restoreResult.status === 'pending_approval' ? 'Requested' : 'Started'}
            </h3>
            <p className="text-sm text-slate-300 mb-4">{restoreResult.message}</p>
            <div className="flex justify-end gap-2">
              <Link
                href="/backups/restores"
                className="px-4 py-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View Restore Operations
              </Link>
              <button
                onClick={() => { setShowRestore(false); setRestoreResult(null); setConfirmPhrase(''); }}
                className="px-4 py-2 text-sm rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Trash2 size={18} className="text-red-400" />
              Delete Backup
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              This will permanently delete the backup. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDelete(false)}
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
