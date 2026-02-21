'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { DoorOpen, Plus, X, Loader2, Pencil } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
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
}

interface Room {
  id: string;
  propertyId: string;
  roomTypeId: string;
  roomNumber: string;
  floor: string | null;
  status: string;
  isOutOfOrder: boolean;
  outOfOrderReason: string | null;
  isActive: boolean;
  roomTypeCode: string;
  roomTypeName: string;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'VACANT_CLEAN', label: 'Vacant Clean' },
  { value: 'VACANT_DIRTY', label: 'Vacant Dirty' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'OUT_OF_ORDER', label: 'Out of Order' },
];

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  VACANT_CLEAN: { label: 'Vacant Clean', variant: 'success' },
  VACANT_DIRTY: { label: 'Vacant Dirty', variant: 'warning' },
  OCCUPIED: { label: 'Occupied', variant: 'info' },
  OUT_OF_ORDER: { label: 'Out of Order', variant: 'error' },
};

// ── Page Component ───────────────────────────────────────────────

type RoomRow = Room & Record<string, unknown>;

export default function RoomsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');

  // Create room dialog
  const isDialogOpen = searchParams.get('action') === 'new';
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomTypesLoading, setRoomTypesLoading] = useState(false);
  const [formRoomNumber, setFormRoomNumber] = useState('');
  const [formRoomTypeId, setFormRoomTypeId] = useState('');
  const [formFloor, setFormFloor] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit room dialog
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [editRoomTypeId, setEditRoomTypeId] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editRoomTypes, setEditRoomTypes] = useState<RoomType[]>([]);
  const [editRoomTypesLoading, setEditRoomTypesLoading] = useState(false);

  // ── Load properties ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>('/api/v1/pms/properties');
        if (cancelled) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(items[0]!.id);
        }
      } catch (err) {
        console.error('[PMS Rooms] Failed to load properties:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load rooms ──────────────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    if (!selectedPropertyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const qs = buildQueryString({
        propertyId: selectedPropertyId,
        status: statusFilter || undefined,
        limit: 100,
      });
      const res = await apiFetch<{
        data: Room[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/rooms${qs}`);
      setRooms(res.data ?? []);
    } catch {
      // silently handle
    } finally {
      setIsLoading(false);
    }
  }, [selectedPropertyId, statusFilter]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // ── Load room types when create dialog opens ──────────────────
  useEffect(() => {
    if (!isDialogOpen || !selectedPropertyId) return;
    let cancelled = false;
    setRoomTypesLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId: selectedPropertyId });
        const res = await apiFetch<{ data: RoomType[] }>(`/api/v1/pms/room-types${qs}`);
        if (cancelled) return;
        setRoomTypes(res.data ?? []);
      } catch (err) {
        console.error('[PMS Rooms] Failed to load room types:', err);
      } finally {
        if (!cancelled) setRoomTypesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isDialogOpen, selectedPropertyId]);

  // Reset create form when dialog opens/closes
  useEffect(() => {
    if (isDialogOpen) {
      setFormRoomNumber('');
      setFormRoomTypeId('');
      setFormFloor('');
      setFormError(null);
    }
  }, [isDialogOpen]);

  // ── Load room types when edit dialog opens ────────────────────
  useEffect(() => {
    if (!editingRoom || !selectedPropertyId) return;
    let cancelled = false;
    setEditRoomTypesLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId: selectedPropertyId });
        const res = await apiFetch<{ data: RoomType[] }>(`/api/v1/pms/room-types${qs}`);
        if (cancelled) return;
        setEditRoomTypes(res.data ?? []);
      } catch (err) {
        console.error('[PMS Rooms] Failed to load room types for edit:', err);
      } finally {
        if (!cancelled) setEditRoomTypesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editingRoom, selectedPropertyId]);

  const closeDialog = useCallback(() => {
    router.push('/pms/rooms', { scroll: false });
  }, [router]);

  const openEditDialog = useCallback((room: Room) => {
    setEditingRoom(room);
    setEditRoomNumber(room.roomNumber);
    setEditRoomTypeId(room.roomTypeId);
    setEditFloor(room.floor ?? '');
    setEditError(null);
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditingRoom(null);
    setEditRoomNumber('');
    setEditRoomTypeId('');
    setEditFloor('');
    setEditError(null);
  }, []);

  const handleCreateRoom = useCallback(async () => {
    setFormError(null);
    if (!formRoomNumber.trim()) {
      setFormError('Room number is required');
      return;
    }
    if (!formRoomTypeId) {
      setFormError('Room type is required');
      return;
    }
    if (!selectedPropertyId) {
      setFormError('No property selected');
      return;
    }
    setIsSubmitting(true);
    const payload = {
      propertyId: selectedPropertyId,
      roomTypeId: formRoomTypeId,
      roomNumber: formRoomNumber.trim(),
      floor: formFloor.trim() || undefined,
    };
    try {
      await apiFetch('/api/v1/pms/rooms', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeDialog();
      fetchRooms();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create room';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [formRoomNumber, formRoomTypeId, formFloor, selectedPropertyId, closeDialog, fetchRooms]);

  const handleUpdateRoom = useCallback(async () => {
    if (!editingRoom) return;
    setEditError(null);
    if (!editRoomNumber.trim()) {
      setEditError('Room number is required');
      return;
    }
    if (!editRoomTypeId) {
      setEditError('Room type is required');
      return;
    }
    setIsEditSubmitting(true);
    const payload: Record<string, string> = {};
    if (editRoomNumber.trim() !== editingRoom.roomNumber) {
      payload.roomNumber = editRoomNumber.trim();
    }
    if (editRoomTypeId !== editingRoom.roomTypeId) {
      payload.roomTypeId = editRoomTypeId;
    }
    const newFloor = editFloor.trim() || '';
    const oldFloor = editingRoom.floor ?? '';
    if (newFloor !== oldFloor) {
      payload.floor = newFloor || '';
    }
    if (Object.keys(payload).length === 0) {
      closeEditDialog();
      return;
    }
    try {
      await apiFetch(`/api/v1/pms/rooms/${editingRoom.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      closeEditDialog();
      fetchRooms();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update room';
      setEditError(msg);
    } finally {
      setIsEditSubmitting(false);
    }
  }, [editingRoom, editRoomNumber, editRoomTypeId, editFloor, closeEditDialog, fetchRooms]);

  // ── Property dropdown options ───────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Table columns ───────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'roomNumber',
        header: 'Room Number',
        width: '120px',
        render: (row: RoomRow) => (
          <span className="font-semibold text-gray-900">{(row as Room).roomNumber}</span>
        ),
      },
      {
        key: 'roomTypeName',
        header: 'Room Type',
        render: (row: RoomRow) => (
          <span className="text-sm text-gray-700">{(row as Room).roomTypeName}</span>
        ),
      },
      {
        key: 'floor',
        header: 'Floor',
        width: '80px',
        render: (row: RoomRow) => (
          <span className="text-sm text-gray-700">{(row as Room).floor ?? '\u2014'}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '140px',
        render: (row: RoomRow) => {
          const s = (row as Room).status;
          const badge = STATUS_BADGES[s] ?? { label: s, variant: 'neutral' };
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
      },
      {
        key: 'outOfOrder',
        header: 'OOO Reason',
        render: (row: RoomRow) => {
          const r = row as Room;
          if (!r.isOutOfOrder || !r.outOfOrderReason) {
            return <span className="text-sm text-gray-300">{'\u2014'}</span>;
          }
          return <span className="text-sm text-red-600">{r.outOfOrderReason}</span>;
        },
      },
      {
        key: 'actions',
        header: '',
        width: '60px',
        render: (row: RoomRow) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEditDialog(row as Room);
            }}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-200/50 hover:text-gray-600"
            title="Edit room"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [openEditDialog],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <DoorOpen className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
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
            onClick={() => router.push('/pms/rooms?action=new')}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Room
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          placeholder="All Statuses"
          className="w-full md:w-44"
        />
        {statusFilter && (
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Table */}
      {!isLoading && rooms.length === 0 && !statusFilter ? (
        <EmptyState
          icon={DoorOpen}
          title="No rooms yet"
          description="Add rooms to start managing your property"
          action={{
            label: 'Add Room',
            onClick: () => router.push('/pms/rooms?action=new'),
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rooms as RoomRow[]}
          isLoading={isLoading}
          emptyMessage="No rooms match your filter"
        />
      )}

      {/* Create Room Dialog */}
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
                <h2 className="text-lg font-semibold text-gray-900">Add Room</h2>
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
                {/* Room Number */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Room Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formRoomNumber}
                    onChange={(e) => setFormRoomNumber(e.target.value)}
                    placeholder="e.g. 101"
                    maxLength={20}
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>

                {/* Room Type */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Room Type <span className="text-red-500">*</span>
                  </label>
                  {roomTypesLoading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading room types...
                    </div>
                  ) : roomTypes.length === 0 ? (
                    <p className="py-2 text-sm text-gray-500">
                      No room types found. Create a room type first.
                    </p>
                  ) : (
                    <Select
                      options={roomTypes.map((rt) => ({
                        value: rt.id,
                        label: `${rt.name} (${rt.code})`,
                      }))}
                      value={formRoomTypeId}
                      onChange={(v) => setFormRoomTypeId(v as string)}
                      placeholder="Select room type"
                    />
                  )}
                </div>

                {/* Floor */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Floor
                  </label>
                  <input
                    type="text"
                    value={formFloor}
                    onChange={(e) => setFormFloor(e.target.value)}
                    placeholder="e.g. 1st, Ground"
                    maxLength={20}
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
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
                  onClick={handleCreateRoom}
                  disabled={isSubmitting || roomTypes.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Edit Room Dialog */}
      {editingRoom &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeEditDialog}
            />
            {/* Panel */}
            <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Edit Room</h2>
                <button
                  type="button"
                  onClick={closeEditDialog}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200/50 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {editError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {editError}
                </div>
              )}

              <div className="space-y-4">
                {/* Room Number */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Room Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editRoomNumber}
                    onChange={(e) => setEditRoomNumber(e.target.value)}
                    placeholder="e.g. 101"
                    maxLength={20}
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>

                {/* Room Type */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Room Type <span className="text-red-500">*</span>
                  </label>
                  {editRoomTypesLoading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading room types...
                    </div>
                  ) : editRoomTypes.length === 0 ? (
                    <p className="py-2 text-sm text-gray-500">
                      No room types found.
                    </p>
                  ) : (
                    <Select
                      options={editRoomTypes.map((rt) => ({
                        value: rt.id,
                        label: `${rt.name} (${rt.code})`,
                      }))}
                      value={editRoomTypeId}
                      onChange={(v) => setEditRoomTypeId(v as string)}
                      placeholder="Select room type"
                    />
                  )}
                </div>

                {/* Floor */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Floor
                  </label>
                  <input
                    type="text"
                    value={editFloor}
                    onChange={(e) => setEditFloor(e.target.value)}
                    placeholder="e.g. 1st, Ground"
                    maxLength={20}
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditDialog}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpdateRoom}
                  disabled={isEditSubmitting || editRoomTypes.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isEditSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEditSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
