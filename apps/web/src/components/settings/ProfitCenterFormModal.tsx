'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useProfitCenterMutations } from '@/hooks/use-profit-centers';
import { apiFetch } from '@/lib/api-client';
import type { ProfitCenter } from '@oppsera/core/profit-centers';

interface LocationWithHierarchy {
  id: string;
  name: string;
  locationType?: 'site' | 'venue';
  parentLocationId?: string | null;
}

interface Props {
  profitCenterId: string | null;
  locations: LocationWithHierarchy[];
  prefilledLocationId?: string;
  requireSiteLevelConfirm?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ProfitCenterFormModal({
  profitCenterId,
  locations,
  prefilledLocationId,
  requireSiteLevelConfirm,
  onClose,
  onSaved,
}: Props) {
  const isEdit = !!profitCenterId;
  const { create, update } = useProfitCenterMutations();

  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [tipsApplicable, setTipsApplicable] = useState(true);
  const [siteLevelAcknowledged, setSiteLevelAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group locations: venues grouped under their parent site
  const hasHierarchy = locations.some((l) => l.locationType === 'venue');
  const sites = useMemo(
    () => locations.filter((l) => l.locationType === 'site' || !l.locationType),
    [locations],
  );
  const venuesBySite = useMemo(() => {
    const map = new Map<string, LocationWithHierarchy[]>();
    for (const loc of locations) {
      if (loc.locationType === 'venue' && loc.parentLocationId) {
        const list = map.get(loc.parentLocationId) ?? [];
        list.push(loc);
        map.set(loc.parentLocationId, list);
      }
    }
    return map;
  }, [locations]);

  // Default to prefilledLocationId, first venue, or first location
  useEffect(() => {
    if (profitCenterId) return; // Edit mode populates from fetch
    if (prefilledLocationId) {
      setLocationId(prefilledLocationId);
      return;
    }
    const venues = locations.filter((l) => l.locationType === 'venue');
    if (venues.length > 0) {
      setLocationId(venues[0]!.id);
    } else if (locations.length > 0) {
      setLocationId(locations[0]!.id);
    }
  }, [locations, profitCenterId, prefilledLocationId]);

  useEffect(() => {
    if (!profitCenterId) return;
    (async () => {
      try {
        const res = await apiFetch<{ data: ProfitCenter }>(
          `/api/v1/profit-centers/${profitCenterId}`,
        );
        const pc = res.data;
        setName(pc.name);
        setLocationId(pc.locationId ?? '');
        setCode(pc.code ?? '');
        setDescription(pc.description ?? '');
        setIsActive(pc.isActive);
        setTipsApplicable(pc.tipsApplicable ?? true);
      } catch {
        setError('Failed to load profit center');
      }
    })();
  }, [profitCenterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!locationId) {
      setError('Location is required');
      return;
    }

    if (requireSiteLevelConfirm && !siteLevelAcknowledged) {
      setError('Please acknowledge the site-level assignment below');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        locationId,
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        isActive,
        tipsApplicable,
        ...(siteLevelAcknowledged && { allowSiteLevel: true }),
      };
      if (isEdit) {
        await update(profitCenterId!, payload);
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
            {isEdit ? 'Edit Profit Center' : 'Add Profit Center'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted/50" aria-label="Close">
            <X className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground">Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              disabled={isEdit || !!prefilledLocationId}
            >
              <option value="">Select location</option>
              {hasHierarchy
                ? sites.map((site) => {
                    const children = venuesBySite.get(site.id) ?? [];
                    if (children.length === 0) {
                      // Site with no venues — selectable directly
                      return (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      );
                    }
                    return (
                      <optgroup key={site.id} label={site.name}>
                        {children.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })
                : locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bar, Restaurant, Pro Shop"
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. BAR-01"
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded"
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tipsApplicable}
                onChange={(e) => setTipsApplicable(e.target.checked)}
                className="rounded"
              />
              Tips Applicable
            </label>
          </div>

          {requireSiteLevelConfirm && !isEdit && (
            <label className="flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
              <input
                type="checkbox"
                checked={siteLevelAcknowledged}
                onChange={(e) => setSiteLevelAcknowledged(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-yellow-500">
                I understand this profit center will apply at the site level, not a
                specific venue.
              </span>
            </label>
          )}

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
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
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
