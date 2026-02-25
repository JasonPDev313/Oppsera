'use client';

import { useState } from 'react';
import { Plus, Cpu, CheckCircle2, XCircle, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  usePaymentProviders,
  useDeviceAssignments,
  useDeviceAssignmentMutations,
} from '@/hooks/use-payment-processors';
import type { DeviceAssignmentInfo } from '@/hooks/use-payment-processors';
import { CARDPOINTE_DEVICE_MODELS, getDeviceDisplayName } from '@oppsera/shared';
import { DialogOverlay } from './_shared';

const deviceModelOptions = Object.values(CARDPOINTE_DEVICE_MODELS);

export default function DevicesTab() {
  const { devices, isLoading } = useDeviceAssignments(undefined, true);
  const { providers } = usePaymentProviders();
  const deviceMutations = useDeviceAssignmentMutations();

  const [showAssign, setShowAssign] = useState(false);
  const [editing, setEditing] = useState<DeviceAssignmentInfo | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Payment Devices</h2>
        <button
          onClick={() => setShowAssign(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Assign Device
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading devices...</div>
      ) : devices.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Cpu className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-4 text-sm font-medium text-gray-900">No payment devices assigned</p>
          <p className="mt-1 text-sm text-gray-500">
            Assign a physical payment terminal (card reader) to a POS terminal by its Hardware
            Serial Number (HSN).
          </p>
          <button
            onClick={() => setShowAssign(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Assign Device
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Terminal</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">HSN</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Device Model</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Label</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-surface">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-gray-900">{d.terminalName || d.terminalId}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{d.hsn}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{getDeviceDisplayName(d.deviceModel)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{d.deviceLabel ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {d.lastStatus === 'connected' ? (
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                      </span>
                    ) : d.lastStatus === 'error' ? (
                      <span className="inline-flex items-center gap-1 text-red-500">
                        <XCircle className="h-3.5 w-3.5" /> Error
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        {d.isActive ? 'Not connected' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(d)}
                        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {confirmRemove === d.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              deviceMutations.removeDevice.mutate(d.id);
                              setConfirmRemove(null);
                            }}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(d.id)}
                          className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-500"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAssign && (
        <AssignDeviceDialog
          providers={providers}
          existingDevices={devices}
          onClose={() => setShowAssign(false)}
          onSubmit={(input) =>
            deviceMutations.assignDevice.mutate(input, { onSuccess: () => setShowAssign(false) })
          }
          isLoading={deviceMutations.assignDevice.isPending}
        />
      )}

      {editing && (
        <EditDeviceDialog
          device={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) =>
            deviceMutations.updateDevice.mutate(
              { id: editing.id, ...input },
              { onSuccess: () => setEditing(null) },
            )
          }
          isLoading={deviceMutations.updateDevice.isPending}
        />
      )}
    </div>
  );
}

function AssignDeviceDialog({
  providers,
  existingDevices,
  onClose,
  onSubmit,
  isLoading,
}: {
  providers: { id: string; displayName: string }[];
  existingDevices: DeviceAssignmentInfo[];
  onClose: () => void;
  onSubmit: (input: {
    terminalId: string;
    providerId: string;
    hsn: string;
    deviceModel?: string;
    deviceLabel?: string;
  }) => void;
  isLoading: boolean;
}) {
  const [terminalId, setTerminalId] = useState('');
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const [hsn, setHsn] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');

  const assignedTerminalIds = new Set(existingDevices.map((d) => d.terminalId));

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Assign Payment Device</h3>
      <p className="mt-1 text-sm text-gray-500">
        Map a physical card reader to a POS terminal by its Hardware Serial Number.
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Provider</label>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select provider...</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.displayName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">POS Terminal ID</label>
          <input
            type="text"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="Enter terminal ID"
          />
          {terminalId && assignedTerminalIds.has(terminalId) && (
            <p className="mt-1 text-xs text-amber-600">
              This terminal already has a device assigned. It will be replaced.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Hardware Serial Number (HSN)</label>
          <input
            type="text"
            value={hsn}
            onChange={(e) => setHsn(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="e.g. 12345678"
          />
          <p className="mt-1 text-xs text-gray-500">
            Found on the device label or in the CardPointe Terminal dashboard.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Device Model</label>
          <select
            value={deviceModel}
            onChange={(e) => setDeviceModel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">Select model (optional)...</option>
            {deviceModelOptions.map((m) => (
              <option key={m.code} value={m.code}>
                {m.displayName} ({m.connectionType.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Label (optional)</label>
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="e.g. Front Register Reader"
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <button
          onClick={() =>
            onSubmit({
              terminalId,
              providerId,
              hsn,
              ...(deviceModel ? { deviceModel } : {}),
              ...(deviceLabel ? { deviceLabel } : {}),
            })
          }
          disabled={isLoading || !terminalId || !providerId || !hsn}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Assign Device
        </button>
      </div>
    </DialogOverlay>
  );
}

function EditDeviceDialog({
  device,
  onClose,
  onSubmit,
  isLoading,
}: {
  device: DeviceAssignmentInfo;
  onClose: () => void;
  onSubmit: (input: {
    hsn?: string;
    deviceModel?: string | null;
    deviceLabel?: string | null;
    isActive?: boolean;
  }) => void;
  isLoading: boolean;
}) {
  const [hsn, setHsn] = useState(device.hsn);
  const [deviceModel, setDeviceModel] = useState(device.deviceModel ?? '');
  const [deviceLabel, setDeviceLabel] = useState(device.deviceLabel ?? '');
  const [isActive, setIsActive] = useState(device.isActive);

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Edit Device Assignment</h3>
      <p className="mt-1 text-sm text-gray-500">
        Terminal: {device.terminalName || device.terminalId}
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Hardware Serial Number (HSN)</label>
          <input
            type="text"
            value={hsn}
            onChange={(e) => setHsn(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Device Model</label>
          <select
            value={deviceModel}
            onChange={(e) => setDeviceModel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {deviceModelOptions.map((m) => (
              <option key={m.code} value={m.code}>
                {m.displayName} ({m.connectionType.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Label</label>
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm"
            placeholder="e.g. Front Register Reader"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-gray-700">Active</span>
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
        <button
          onClick={() =>
            onSubmit({
              ...(hsn !== device.hsn ? { hsn } : {}),
              deviceModel: deviceModel || null,
              deviceLabel: deviceLabel || null,
              isActive,
            })
          }
          disabled={isLoading || !hsn}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>
      </div>
    </DialogOverlay>
  );
}
