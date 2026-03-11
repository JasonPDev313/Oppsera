'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface Props {
  venueId: string | null;
  parentSiteId: string;
  parentSiteName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function VenueFormModal({
  venueId,
  parentSiteId,
  parentSiteName,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!venueId;

  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing venue data for edit
  useEffect(() => {
    if (!venueId) return;
    (async () => {
      try {
        const res = await apiFetch<{ data: { name: string } }>(
          `/api/v1/locations/venues/${venueId}`,
        );
        setName(res.data.name);
      } catch {
        setError('Failed to load venue');
      }
    })();
  }, [venueId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await apiFetch(`/api/v1/locations/venues/${venueId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim() }),
        });
      } else {
        await apiFetch('/api/v1/locations/venues', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            parentLocationId: parentSiteId,
          }),
        });
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
            {isEdit ? 'Edit Venue' : 'Add Venue'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-accent/50"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="vfm-site" className="block text-sm font-medium text-foreground">
              Site
            </label>
            <input
              id="vfm-site"
              type="text"
              value={parentSiteName}
              disabled
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-muted-foreground"
            />
          </div>

          <div>
            <label htmlFor="vfm-name" className="block text-sm font-medium text-foreground">
              Venue Name
            </label>
            <input
              id="vfm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Patio, Main Dining, Pro Shop"
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

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
              {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Venue'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
