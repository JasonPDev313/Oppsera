'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { LocationItem } from '@/types/tenant';

interface Props {
  locationType: 'site' | 'venue';
  existing?: LocationItem;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}

export function LocationFormModal({ locationType, existing, onClose, onSave }: Props) {
  const isEdit = !!existing;
  const label = locationType === 'site' ? 'Site' : 'Venue';

  const [name, setName] = useState(existing?.name ?? '');
  const [timezone, setTimezone] = useState(existing?.timezone ?? 'America/New_York');
  const [addressLine1, setAddressLine1] = useState(existing?.addressLine1 ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [state, setState] = useState(existing?.state ?? '');
  const [postalCode, setPostalCode] = useState(existing?.postalCode ?? '');
  const [country, setCountry] = useState(existing?.country ?? 'US');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
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
        timezone,
        addressLine1: addressLine1.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        postalCode: postalCode.trim() || null,
        country,
        phone: phone.trim() || null,
        email: email.trim() || null,
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
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? `Edit ${label}` : `New ${label}`}
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
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="modal-input" />
          </ModalField>

          <ModalField label="Timezone">
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="modal-input">
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
              <option value="America/Phoenix">Arizona</option>
              <option value="Pacific/Honolulu">Hawaii</option>
            </select>
          </ModalField>

          <ModalField label="Address">
            <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className="modal-input" placeholder="123 Main St" />
          </ModalField>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label="City">
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="modal-input" />
            </ModalField>
            <ModalField label="State">
              <input type="text" value={state} onChange={(e) => setState(e.target.value)} className="modal-input" maxLength={2} />
            </ModalField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Postal Code">
              <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="modal-input" />
            </ModalField>
            <ModalField label="Country">
              <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} className="modal-input" maxLength={2} />
            </ModalField>
          </div>

          <ModalField label="Phone">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="modal-input" />
          </ModalField>

          <ModalField label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="modal-input" />
          </ModalField>

          {isEdit && (
            <label className="flex items-center gap-2 pt-1">
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
