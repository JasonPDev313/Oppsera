'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, X, Loader2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';

interface NewCustomerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after customer is created — receives the new customer's id and displayName */
  onCreated: (customerId: string, displayName: string) => void;
}

export function NewCustomerDialog({ open, onClose, onCreated }: NewCustomerDialogProps) {
  const [type, setType] = useState<'person' | 'organization'>('person');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setType('person');
    setFirstName('');
    setLastName('');
    setOrganizationName('');
    setEmail('');
    setPhone('');
    setNotes('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canSubmit =
    type === 'person'
      ? firstName.trim().length > 0 || email.trim().length > 0 || phone.trim().length > 0
      : organizationName.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = { type };

      if (type === 'person') {
        if (firstName.trim()) body.firstName = firstName.trim();
        if (lastName.trim()) body.lastName = lastName.trim();
      } else {
        if (organizationName.trim()) body.organizationName = organizationName.trim();
      }
      if (email.trim()) body.email = email.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (notes.trim()) body.notes = notes.trim();

      const res = await apiFetch<{ data: { id: string; displayName: string } }>('/api/v1/customers', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const created = res.data;
      resetForm();
      onCreated(created.id, created.displayName);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create customer');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">New Customer</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Type selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('person')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                type === 'person'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Person
            </button>
            <button
              type="button"
              onClick={() => setType('organization')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                type === 'organization'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Organization
            </button>
          </div>

          {/* Name fields */}
          {type === 'person' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="nc-firstName" className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  id="nc-firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="First name"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="nc-lastName" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  id="nc-lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Last name"
                />
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="nc-orgName" className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name
              </label>
              <input
                id="nc-orgName"
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Organization name"
                autoFocus
              />
            </div>
          )}

          {/* Contact fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="nc-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="nc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label htmlFor="nc-phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                id="nc-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="(555) 555-5555"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="nc-notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="nc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
              placeholder="Any notes about this customer..."
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSaving}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create & Attach
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
