'use client';

import { useState } from 'react';
import { Link2, Unlink, Loader2 } from 'lucide-react';
import {
  usePaymentProviders,
  useMerchantAccounts,
  useTerminalAssignments,
  usePaymentProcessorMutations,
} from '@/hooks/use-payment-processors';
import { DialogOverlay } from './_shared';

export default function TerminalsTab() {
  const { assignments, isLoading } = useTerminalAssignments(true);
  const [showAssign, setShowAssign] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Terminal → MID Assignments</h2>
        <button
          onClick={() => setShowAssign(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Link2 className="h-4 w-4" /> Assign Terminal
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading assignments...</div>
      ) : assignments.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Unlink className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm font-medium text-gray-900">No terminal assignments</p>
          <p className="mt-1 text-sm text-gray-500">
            Assign terminals to merchant accounts so each terminal knows which MID to use.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Terminal</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Merchant ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">MID Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{a.terminalId}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{a.merchantId}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{a.merchantDisplayName}</td>
                  <td className="px-4 py-3 text-sm">
                    {a.isActive ? <span className="text-green-600">Active</span> : <span className="text-gray-400">Inactive</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAssign && (
        <AssignTerminalDialog onClose={() => setShowAssign(false)} />
      )}
    </div>
  );
}

function AssignTerminalDialog({ onClose }: { onClose: () => void }) {
  const { providers } = usePaymentProviders();
  const mutations = usePaymentProcessorMutations();
  const [selectedProviderId, setSelectedProviderId] = useState<string>(providers[0]?.id ?? '');
  const { accounts } = useMerchantAccounts(selectedProviderId || null);
  const activeAccounts = accounts.filter((a) => a.isActive);

  const [terminalId, setTerminalId] = useState('');
  const [merchantAccountId, setMerchantAccountId] = useState('');

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Assign Terminal to MID</h3>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Provider</label>
          <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm">
            <option value="">Select provider...</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Terminal ID</label>
          <input type="text" value={terminalId} onChange={(e) => setTerminalId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm" placeholder="Enter terminal ID" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Merchant Account</label>
          <select value={merchantAccountId} onChange={(e) => setMerchantAccountId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm">
            <option value="">Select MID...</option>
            {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.displayName} ({a.merchantId}){a.isDefault ? ' — Default' : ''}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <button
          onClick={() => mutations.assignTerminal.mutate({ terminalId, merchantAccountId }, { onSuccess: () => onClose() })}
          disabled={mutations.assignTerminal.isPending || !terminalId || !merchantAccountId}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutations.assignTerminal.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Assign
        </button>
      </div>
    </DialogOverlay>
  );
}
