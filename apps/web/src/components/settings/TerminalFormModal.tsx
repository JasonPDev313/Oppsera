'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTerminalMutations } from '@/hooks/use-terminals';
import { apiFetch } from '@/lib/api-client';
import type { Terminal } from '@oppsera/core/profit-centers';

interface Props {
  profitCenterId: string;
  terminalId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TerminalFormModal({ profitCenterId, terminalId, onClose, onSaved }: Props) {
  const isEdit = !!terminalId;
  const { create, update } = useTerminalMutations(profitCenterId);

  const [name, setName] = useState('');
  const [terminalNumber, setTerminalNumber] = useState('');
  const [deviceIdentifier, setDeviceIdentifier] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalId) return;
    (async () => {
      try {
        const res = await apiFetch<{ data: Terminal }>(
          `/api/v1/terminals/${terminalId}`,
        );
        const t = res.data;
        setName(t.name);
        setTerminalNumber(t.terminalNumber != null ? String(t.terminalNumber) : '');
        setDeviceIdentifier(t.deviceIdentifier ?? '');
        setIpAddress(t.ipAddress ?? '');
        setIsActive(t.isActive);
      } catch {
        setError('Failed to load terminal');
      }
    })();
  }, [terminalId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        terminalNumber: terminalNumber ? Number(terminalNumber) : undefined,
        deviceIdentifier: deviceIdentifier.trim() || undefined,
        ipAddress: ipAddress.trim() || undefined,
        isActive,
      };
      if (isEdit) {
        await update(terminalId!, payload);
      } else {
        await create(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {isEdit ? 'Edit Terminal' : 'Add Terminal'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent/50" aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bar Terminal 1"
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Terminal Number</label>
            <input
              type="number"
              value={terminalNumber}
              onChange={(e) => setTerminalNumber(e.target.value)}
              placeholder="Auto-assigned if left blank"
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Device Identifier</label>
            <input
              type="text"
              value={deviceIdentifier}
              onChange={(e) => setDeviceIdentifier(e.target.value)}
              placeholder="e.g. iPad-BAR-01"
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">IP Address</label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="e.g. 192.168.1.101"
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            Active
          </label>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
