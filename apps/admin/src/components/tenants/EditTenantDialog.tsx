'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { TenantDetail } from '@/types/tenant';

interface Props {
  tenant: TenantDetail;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}

const INDUSTRY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'retail', label: 'Retail' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'spa', label: 'Spa / Wellness' },
  { value: 'enterprise', label: 'Enterprise' },
];

export function EditTenantDialog({ tenant, onClose, onSave }: Props) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [industry, setIndustry] = useState(tenant.industry ?? '');
  const [contactName, setContactName] = useState(tenant.primaryContactName ?? '');
  const [contactEmail, setContactEmail] = useState(tenant.primaryContactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(tenant.primaryContactPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim(),
        industry: industry || null,
        primaryContactName: contactName.trim() || null,
        primaryContactEmail: contactEmail.trim() || null,
        primaryContactPhone: contactPhone.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tenant');
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 shadow-xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Edit Tenant</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Organization Name *">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </Field>

          <Field label="Slug">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="input-field"
            />
          </Field>

          <Field label="Industry">
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="input-field"
            >
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Contact Name">
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="input-field"
            />
          </Field>

          <Field label="Contact Email">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="input-field"
            />
          </Field>

          <Field label="Contact Phone">
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="input-field"
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .input-field {
          width: 100%;
          background: rgb(15 23 42); /* slate-900 */
          border: 1px solid rgb(71 85 105); /* slate-600 */
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          color: white;
          font-size: 0.875rem;
        }
        .input-field:focus {
          outline: none;
          box-shadow: 0 0 0 2px rgb(99 102 241); /* indigo-500 */
          border-color: transparent;
        }
      `}</style>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      {children}
    </div>
  );
}
