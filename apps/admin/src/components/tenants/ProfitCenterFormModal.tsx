'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ProfitCenterItem } from '@/types/tenant';

interface Props {
  existing?: ProfitCenterItem;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export function ProfitCenterFormModal({ existing, onClose, onSave }: Props) {
  const isEdit = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [tipsApplicable, setTipsApplicable] = useState(existing?.tipsApplicable ?? true);
  const [sortOrder, setSortOrder] = useState(existing?.sortOrder ?? 0);
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
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        tipsApplicable,
        sortOrder,
        isActive,
        ...(isEdit ? {} : { allowSiteLevel: true }),
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
            {isEdit ? 'Edit Profit Center' : 'New Profit Center'}
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
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="modal-input" placeholder="Main Bar" />
          </ModalField>

          <ModalField label="Code">
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} className="modal-input" placeholder="BAR01" maxLength={20} />
          </ModalField>

          <ModalField label="Description">
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="modal-input" maxLength={500} />
          </ModalField>

          <ModalField label="Sort Order">
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="modal-input" min={0} />
          </ModalField>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={tipsApplicable}
              onChange={(e) => setTipsApplicable(e.target.checked)}
              className="rounded border-slate-600 bg-slate-900 text-indigo-600"
            />
            <span className="text-sm text-slate-300">Tips Applicable</span>
          </label>

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

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      {children}
    </div>
  );
}
