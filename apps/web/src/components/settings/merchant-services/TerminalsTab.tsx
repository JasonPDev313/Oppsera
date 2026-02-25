'use client';

import { useState, useMemo } from 'react';
import { Link2, Unlink, Loader2, Building2, MapPin } from 'lucide-react';
import {
  usePaymentProviders,
  useMerchantAccounts,
  useTerminalAssignments,
  usePaymentProcessorMutations,
} from '@/hooks/use-payment-processors';
import {
  useProfitCenterSettings,
  filterProfitCenters,
  filterTerminalsByPC,
} from '@/hooks/use-profit-center-settings';
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
                  <td className="px-4 py-3 text-sm text-gray-900">{a.terminalName ?? a.terminalId}</td>
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
  const { data: settingsData, isLoading: settingsLoading } = useProfitCenterSettings();

  const [selectedProviderId, setSelectedProviderId] = useState<string>(providers[0]?.id ?? '');
  const { accounts } = useMerchantAccounts(selectedProviderId || null);
  const activeAccounts = accounts.filter((a) => a.isActive);

  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedProfitCenterId, setSelectedProfitCenterId] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [merchantAccountId, setMerchantAccountId] = useState('');

  // Build location options: sites, then indented venues
  const locationOptions = useMemo(() => {
    if (!settingsData?.locations) return [];
    const sites = settingsData.locations.filter((l) => l.locationType === 'site');
    const venuesBySite = new Map<string, typeof settingsData.locations>();
    for (const loc of settingsData.locations) {
      if (loc.locationType === 'venue' && loc.parentLocationId) {
        const list = venuesBySite.get(loc.parentLocationId) ?? [];
        list.push(loc);
        venuesBySite.set(loc.parentLocationId, list);
      }
    }
    const options: { id: string; label: string; type: 'site' | 'venue' }[] = [];
    for (const site of sites) {
      const venues = venuesBySite.get(site.id) ?? [];
      if (venues.length > 0) {
        // Site has venues — only show venues as selectable
        options.push({ id: site.id, label: site.name, type: 'site' });
        for (const venue of venues) {
          options.push({ id: venue.id, label: `  ${venue.name}`, type: 'venue' });
        }
      } else {
        // Site without venues — selectable directly
        options.push({ id: site.id, label: site.name, type: 'site' });
      }
    }
    return options;
  }, [settingsData?.locations]);

  // Filter profit centers by selected location
  const profitCenters = useMemo(
    () => filterProfitCenters(settingsData?.profitCenters, selectedLocationId || null),
    [settingsData?.profitCenters, selectedLocationId],
  );

  // Filter terminals by selected profit center
  const terminals = useMemo(
    () => filterTerminalsByPC(settingsData?.terminals, selectedProfitCenterId || null),
    [settingsData?.terminals, selectedProfitCenterId],
  );

  const selectCls = 'mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm';

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Assign Terminal to MID</h3>
      <div className="mt-4 space-y-3">
        {/* Provider */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Provider</label>
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            className={selectCls}
          >
            <option value="">Select provider...</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Building2 className="h-3.5 w-3.5" /> Location
          </label>
          <select
            value={selectedLocationId}
            onChange={(e) => {
              setSelectedLocationId(e.target.value);
              setSelectedProfitCenterId('');
              setSelectedTerminalId('');
            }}
            disabled={settingsLoading}
            className={selectCls}
          >
            <option value="">Select location...</option>
            {locationOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.type === 'venue' ? `↳ ${opt.label.trim()}` : opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Profit Center */}
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <MapPin className="h-3.5 w-3.5" /> Profit Center
          </label>
          <select
            value={selectedProfitCenterId}
            onChange={(e) => {
              setSelectedProfitCenterId(e.target.value);
              setSelectedTerminalId('');
            }}
            disabled={!selectedLocationId || profitCenters.length === 0}
            className={selectCls}
          >
            <option value="">{!selectedLocationId ? 'Select a location first...' : profitCenters.length === 0 ? 'No profit centers at this location' : 'Select profit center...'}</option>
            {profitCenters.map((pc) => (
              <option key={pc.id} value={pc.id}>
                {pc.name}{pc.code ? ` (${pc.code})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Terminal */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Terminal</label>
          <select
            value={selectedTerminalId}
            onChange={(e) => setSelectedTerminalId(e.target.value)}
            disabled={!selectedProfitCenterId || terminals.length === 0}
            className={selectCls}
          >
            <option value="">{!selectedProfitCenterId ? 'Select a profit center first...' : terminals.length === 0 ? 'No terminals at this profit center' : 'Select terminal...'}</option>
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.terminalNumber != null ? ` (#${t.terminalNumber})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Merchant Account */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Merchant Account</label>
          <select
            value={merchantAccountId}
            onChange={(e) => setMerchantAccountId(e.target.value)}
            className={selectCls}
          >
            <option value="">Select MID...</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.merchantId}){a.isDefault ? ' — Default' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <button
          onClick={() => mutations.assignTerminal.mutate({ terminalId: selectedTerminalId, merchantAccountId }, { onSuccess: () => onClose() })}
          disabled={mutations.assignTerminal.isPending || !selectedTerminalId || !merchantAccountId}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mutations.assignTerminal.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Assign
        </button>
      </div>
    </DialogOverlay>
  );
}
