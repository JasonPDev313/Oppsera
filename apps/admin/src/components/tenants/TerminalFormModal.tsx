'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { TerminalItem } from '@/types/tenant';

interface Props {
  existing?: TerminalItem;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export function TerminalFormModal({ existing, onClose, onSave }: Props) {
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [terminalNumber, setTerminalNumber] = useState<string>(
    existing?.terminalNumber != null ? String(existing.terminalNumber) : '',
  );
  const [deviceIdentifier, setDeviceIdentifier] = useState(existing?.deviceIdentifier ?? '');
  const [ipAddress, setIpAddress] = useState(existing?.ipAddress ?? '');
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        terminalNumber: terminalNumber ? Number(terminalNumber) : undefined,
        deviceIdentifier: deviceIdentifier.trim() || undefined,
        ipAddress: ipAddress.trim() || undefined,
        isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Terminal' : 'New Terminal'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <ModalField label="Name *">
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="modal-input" placeholder="Register 1" />
          </ModalField>

          <ModalField label="Terminal Number" hint="Auto-assigned if blank">
            <input type="number" value={terminalNumber} onChange={(e) => setTerminalNumber(e.target.value)} className="modal-input" min={1} />
          </ModalField>

          <ModalField label="Device Identifier">
            <input type="text" value={deviceIdentifier} onChange={(e) => setDeviceIdentifier(e.target.value)} className="modal-input" placeholder="iPad-ABC123" maxLength={100} />
          </ModalField>

          <ModalField label="IP Address">
            <input type="text" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} className="modal-input" placeholder="192.168.1.100" maxLength={45} />
          </ModalField>

          {isEdit && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900 text-indigo-600"
              />
              <span className="text-sm text-slate-300">Active</span>
            </label>
          )}

          <div className="flex gap-3 pt-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .modal-input {
          width: 100%;
          background: rgb(15 23 42);
          border: 1px solid rgb(71 85 105);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          color: white;
          font-size: 0.875rem;
        }
        .modal-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgb(99 102 241);
          border-color: transparent;
        }
      `}</style>
    </div>,
    document.body,
  );
}

function ModalField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">
        {label}
        {hint && <span className="text-xs text-slate-500 ml-1 font-normal">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
