'use client';

import { useEffect, useState } from 'react';
import { Key, XCircle, AlertTriangle } from 'lucide-react';
import { useApiKeys } from '@/hooks/use-admin-users';

function KeyStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    expired: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    revoked: 'bg-red-500/10 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium border ${colors[status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
      {status}
    </span>
  );
}

export function ApiKeysTab({ tenantId }: { tenantId: string }) {
  const { keys, isLoading, load, revoke } = useApiKeys(tenantId);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async () => {
    if (!revokeId) return;
    setIsRevoking(true);
    const ok = await revoke(revokeId);
    if (ok) setRevokeId(null);
    setIsRevoking(false);
  };

  if (isLoading && keys.length === 0) {
    return <p className="text-sm text-slate-500 py-4">Loading API keys...</p>;
  }

  if (keys.length === 0) {
    return (
      <div className="text-center py-8">
        <Key className="mx-auto h-8 w-8 text-slate-500 mb-3" />
        <p className="text-slate-300 font-medium">No API keys</p>
        <p className="text-sm text-slate-500 mt-1">This tenant has not created any API keys.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Key size={16} className="text-indigo-400" />
        <h3 className="text-sm font-medium text-slate-300">API Keys ({keys.length})</h3>
      </div>

      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left px-4 py-3 font-medium text-slate-400">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Prefix</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Expires</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Created</th>
              <th className="text-right px-4 py-3 font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {keys.map(key => (
              <tr key={key.id} className="hover:bg-slate-700/50">
                <td className="px-4 py-3 text-slate-200">{key.name}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{key.keyPrefix}****</td>
                <td className="px-4 py-3"><KeyStatusBadge status={key.status} /></td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(key.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {key.status === 'active' && (
                    <button
                      onClick={() => setRevokeId(key.id)}
                      className="p-1.5 rounded hover:bg-slate-600 text-red-400 hover:text-red-300 transition-colors"
                      title="Revoke"
                    >
                      <XCircle size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Revoke Confirmation */}
      {revokeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-400" />
              Revoke API Key
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              This will immediately invalidate the key. Any applications using it will lose access.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRevokeId(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button
                onClick={handleRevoke}
                disabled={isRevoking}
                className="px-4 py-2 text-sm rounded-lg font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                {isRevoking ? 'Revoking...' : 'Revoke Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
