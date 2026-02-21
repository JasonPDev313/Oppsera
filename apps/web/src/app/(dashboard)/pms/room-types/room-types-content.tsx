'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, Plus, X, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { DataTable } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface RoomType {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  roomCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Page Component ───────────────────────────────────────────────

type RoomTypeRow = RoomType & Record<string, unknown>;

export default function RoomTypesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);

  // Create dialog
  const isDialogOpen = searchParams.get('action') === 'new';
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMaxAdults, setFormMaxAdults] = useState('2');
  const [formMaxChildren, setFormMaxChildren] = useState('0');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Derived ────────────────────────────────────────────────────
  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId),
    [properties, selectedPropertyId],
  );

  const propertyDisplayName = useMemo(() => {
    if (selectedProperty) return selectedProperty.name;
    if (properties.length > 0) return properties[0]!.name;
    if (propertiesLoading) return 'Loading...';
    if (propertiesError) return propertiesError;
    return 'Loading...';
  }, [selectedProperty, properties, propertiesLoading, propertiesError]);

  // ── Load properties ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPropertiesLoading(true);
      setPropertiesError(null);
      try {
        const res = await apiFetch<{ data: Property[] }>('/api/v1/pms/properties');
        if (cancelled) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0) {
          setSelectedPropertyId(items[0]!.id);
        } else {
          setPropertiesError('No property found — try refreshing');
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load properties';
          console.error('[PMS] Failed to load properties:', msg);
          setPropertiesError(msg);
        }
      } finally {
        if (!cancelled) setPropertiesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load room types ───────────────────────────────────────────
  const fetchRoomTypes = useCallback(async () => {
    if (!selectedPropertyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const qs = buildQueryString({
        propertyId: selectedPropertyId,
        limit: 100,
      });
      const res = await apiFetch<{
        data: RoomType[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/room-types${qs}`);
      setRoomTypes(res.data ?? []);
    } catch {
      // silently handle
    } finally {
      setIsLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    fetchRoomTypes();
  }, [fetchRoomTypes]);

  // ── Dialog handlers ──────────────────────────────────────────
  useEffect(() => {
    if (isDialogOpen) {
      setFormCode('');
      setFormName('');
      setFormDescription('');
      setFormMaxAdults('2');
      setFormMaxChildren('0');
      setFormError(null);
    }
  }, [isDialogOpen]);

  const closeDialog = useCallback(() => {
    router.push('/pms/room-types', { scroll: false });
  }, [router]);

  const handleCreate = useCallback(async () => {
    setFormError(null);
    if (!formCode.trim()) {
      setFormError('Code is required');
      return;
    }
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    // Use selectedPropertyId, or fall back to first property
    const propId = selectedPropertyId || properties[0]?.id;
    if (!propId) {
      setFormError('No property available — please refresh the page');
      return;
    }
    const maxAdults = parseInt(formMaxAdults, 10);
    const maxChildren = parseInt(formMaxChildren, 10);
    if (isNaN(maxAdults) || maxAdults < 1) {
      setFormError('Max adults must be at least 1');
      return;
    }
    if (isNaN(maxChildren) || maxChildren < 0) {
      setFormError('Max children must be 0 or more');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch('/api/v1/pms/room-types', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: propId,
          code: formCode.trim(),
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          maxAdults,
          maxChildren,
          maxOccupancy: maxAdults + maxChildren,
        }),
      });
      closeDialog();
      fetchRoomTypes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create room type';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [formCode, formName, formDescription, formMaxAdults, formMaxChildren, selectedPropertyId, properties, closeDialog, fetchRoomTypes]);

  // ── Property dropdown options ───────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Table columns ───────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        width: '100px',
        render: (row: RoomTypeRow) => (
          <span className="font-mono text-sm font-medium text-gray-900">
            {(row as RoomType).code}
          </span>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        render: (row: RoomTypeRow) => (
          <div>
            <span className="text-sm font-medium text-gray-900">
              {(row as RoomType).name}
            </span>
            {(row as RoomType).description && (
              <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                {(row as RoomType).description}
              </p>
            )}
          </div>
        ),
      },
      {
        key: 'maxOccupancy',
        header: 'Max Occupancy',
        width: '140px',
        render: (row: RoomTypeRow) => {
          const rt = row as RoomType;
          return (
            <span className="text-sm text-gray-700">
              {rt.maxAdults}A / {rt.maxChildren}C (max {rt.maxOccupancy})
            </span>
          );
        },
      },
      {
        key: 'roomCount',
        header: 'Rooms',
        width: '80px',
        render: (row: RoomTypeRow) => (
          <span className="text-sm text-gray-700">
            {(row as RoomType).roomCount ?? 0}
          </span>
        ),
      },
    ],
    [],
  );

  // Can user submit the form?
  const canSubmit = !isSubmitting && (!!selectedPropertyId || properties.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Room Types</h1>
            <p className="text-sm text-gray-500">Define room categories and capacity</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {properties.length > 1 && (
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
              className="w-full sm:w-48"
            />
          )}
          <button
            type="button"
            onClick={() => router.push('/pms/room-types?action=new')}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Room Type
          </button>
        </div>
      </div>

      {/* Table */}
      {!isLoading && roomTypes.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No room types yet"
          description="Create room types to define categories like Standard, Suite, Deluxe, etc."
          action={{
            label: 'New Room Type',
            onClick: () => router.push('/pms/room-types?action=new'),
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={roomTypes as RoomTypeRow[]}
          isLoading={isLoading}
          emptyMessage="No room types found"
        />
      )}

      {/* Create Room Type Dialog */}
      {isDialogOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeDialog}
            />
            {/* Panel */}
            <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  New Room Type
                </h2>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="space-y-4">
                {/* Property (auto-filled, read-only for single property) */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Property
                  </label>
                  {properties.length > 1 ? (
                    <Select
                      options={propertyOptions}
                      value={selectedPropertyId}
                      onChange={(v) => setSelectedPropertyId(v as string)}
                      placeholder="Select property"
                      className="w-full"
                    />
                  ) : (
                    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {propertyDisplayName}
                    </div>
                  )}
                </div>

                {/* Code */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. STD, DLX, STE"
                    maxLength={20}
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Short code for this room type (e.g. STD, DLX, STE)
                  </p>
                </div>

                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Standard Room, Deluxe Suite"
                    maxLength={100}
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="e.g. Two Double Beds"
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Capacity row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Max Adults
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={formMaxAdults}
                      onChange={(e) => setFormMaxAdults(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Max Children
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={formMaxChildren}
                      onChange={(e) => setFormMaxChildren(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!canSubmit}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Creating...' : 'Create Room Type'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
