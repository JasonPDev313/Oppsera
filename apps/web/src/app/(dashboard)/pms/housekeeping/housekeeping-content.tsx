'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  AlertTriangle,
  BedDouble,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface HousekeepingRoom {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  floor: string | null;
  status: string;
  isOutOfOrder: boolean;
  currentGuest: { name: string; checkOutDate: string } | null;
  arrivingGuest: { name: string; checkInDate: string } | null;
  departingToday: boolean;
  arrivingToday: boolean;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'VACANT_CLEAN', label: 'Vacant Clean' },
  { value: 'VACANT_DIRTY', label: 'Vacant Dirty' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'OUT_OF_ORDER', label: 'Out of Order' },
];

const STATUS_BADGE: Record<string, { label: string; variant: string }> = {
  VACANT_CLEAN: { label: 'Clean', variant: 'success' },
  VACANT_DIRTY: { label: 'Dirty', variant: 'warning' },
  OCCUPIED: { label: 'Occupied', variant: 'info' },
  OUT_OF_ORDER: { label: 'Out of Order', variant: 'error' },
};

// ── Helpers ──────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Stat Card ────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-500">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Room Card ────────────────────────────────────────────────────

function RoomCard({
  room,
  onMarkClean,
  isUpdating,
}: {
  room: HousekeepingRoom;
  onMarkClean: (roomId: string) => void;
  isUpdating: boolean;
}) {
  const badge = STATUS_BADGE[room.status] ?? { label: room.status, variant: 'neutral' };
  const isDirty = room.status === 'VACANT_DIRTY';

  return (
    <div
      className={`rounded-lg border bg-surface p-4 transition-colors ${
        isDirty
          ? 'cursor-pointer border-amber-300 hover:border-amber-400 hover:bg-amber-50/30'
          : 'border-gray-200'
      }`}
      onClick={isDirty && !isUpdating ? () => onMarkClean(room.roomId) : undefined}
      role={isDirty ? 'button' : undefined}
      tabIndex={isDirty ? 0 : undefined}
      onKeyDown={
        isDirty
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!isUpdating) onMarkClean(room.roomId);
              }
            }
          : undefined
      }
    >
      {/* Room number + status */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-bold text-gray-900">{room.roomNumber}</h3>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {/* Room type + floor */}
      <p className="mt-1 text-sm text-gray-600">{room.roomTypeName}</p>
      {room.floor && (
        <p className="text-xs text-gray-400">Floor {room.floor}</p>
      )}

      {/* Guest info */}
      {room.currentGuest && (
        <div className="mt-3 border-t border-gray-100 pt-2">
          <p className="text-xs font-medium text-gray-500">Current Guest</p>
          <p className="text-sm text-gray-900">{room.currentGuest.name}</p>
          <p className="text-xs text-gray-400">
            Checkout: {room.currentGuest.checkOutDate}
          </p>
        </div>
      )}

      {/* Arriving guest */}
      {room.arrivingGuest && !room.currentGuest && (
        <div className="mt-3 border-t border-gray-100 pt-2">
          <p className="text-xs font-medium text-gray-500">Arriving Today</p>
          <p className="text-sm text-gray-900">{room.arrivingGuest.name}</p>
        </div>
      )}

      {/* Departing flag */}
      {room.departingToday && room.currentGuest && (
        <p className="mt-2 text-xs font-medium text-amber-600">Departing today</p>
      )}

      {/* Click hint for dirty rooms */}
      {isDirty && (
        <p className="mt-3 text-center text-xs font-medium text-amber-600">
          {isUpdating ? 'Updating...' : 'Click to mark clean'}
        </p>
      )}
    </div>
  );
}

// ── Page Component ───────────────────────────────────────────────

export default function HousekeepingContent() {
  const { toast } = useToast();
  const today = useMemo(() => todayISO(), []);

  // ── State ────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rooms, setRooms] = useState<HousekeepingRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingRoomId, setUpdatingRoomId] = useState<string | null>(null);

  // ── Load properties ───────────────────────────────────────────────
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
      } catch {
        // silently handle
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load housekeeping rooms ───────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    if (!selectedPropertyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const qs = buildQueryString({
        propertyId: selectedPropertyId,
        date: today,
        status: statusFilter || undefined,
      });
      const res = await apiFetch<{ data: HousekeepingRoom[] }>(
        `/api/v1/pms/housekeeping/rooms${qs}`,
      );
      setRooms(res.data ?? []);
    } catch {
      toast.error('Failed to load housekeeping rooms');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPropertyId, statusFilter, today, toast]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // ── Mark room clean ─────────────────────────────────────────────
  const handleMarkClean = useCallback(
    async (roomId: string) => {
      setUpdatingRoomId(roomId);
      try {
        await apiFetch(`/api/v1/pms/rooms/${roomId}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: 'VACANT_CLEAN' }),
        });
        toast.success('Room marked as clean');
        // Update local state optimistically
        setRooms((prev) =>
          prev.map((r) =>
            r.roomId === roomId ? { ...r, status: 'VACANT_CLEAN' } : r,
          ),
        );
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to update room');
        toast.error(e.message);
      } finally {
        setUpdatingRoomId(null);
      }
    },
    [toast],
  );

  // ── Quick stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    let clean = 0;
    let dirty = 0;
    let occupied = 0;
    let outOfOrder = 0;
    for (const room of rooms) {
      switch (room.status) {
        case 'VACANT_CLEAN':
          clean++;
          break;
        case 'VACANT_DIRTY':
          dirty++;
          break;
        case 'OCCUPIED':
          occupied++;
          break;
        case 'OUT_OF_ORDER':
          outOfOrder++;
          break;
      }
    }
    return { clean, dirty, occupied, outOfOrder };
  }, [rooms]);

  // ── Property dropdown options ──────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Housekeeping</h1>
            <p className="text-sm text-gray-500">
              Room status board for {today}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {properties.length > 1 && (
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
              className="w-full sm:w-56"
            />
          )}
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as string)}
            placeholder="All Statuses"
            className="w-full sm:w-48"
          />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={CheckCircle2}
          label="Clean"
          value={stats.clean}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          icon={AlertTriangle}
          label="Dirty"
          value={stats.dirty}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          icon={BedDouble}
          label="Occupied"
          value={stats.occupied}
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={Ban}
          label="Out of Order"
          value={stats.outOfOrder}
          color="bg-red-100 text-red-600"
        />
      </div>

      {/* Room Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-surface p-4">
              <div className="h-6 w-16 animate-pulse rounded bg-gray-200" />
              <div className="mt-2 h-4 w-32 animate-pulse rounded bg-gray-100" />
              <div className="mt-2 h-4 w-20 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-16">
          <BedDouble className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">No rooms found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {statusFilter
              ? 'No rooms match the selected filter.'
              : 'No rooms configured for this property.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rooms.map((room) => (
            <RoomCard
              key={room.roomId}
              room={room}
              onMarkClean={handleMarkClean}
              isUpdating={updatingRoomId === room.roomId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
