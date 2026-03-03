'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DoorOpen,
  LogIn,
  LogOut,
  Loader2,
  RefreshCw,
  User,
  BedDouble,
  CalendarDays,
  Search,
  X,
  ChevronDown,
  ArrowUpRight,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { ApiError, apiFetch } from '@/lib/api-client';
import {
  useProperties,
  useFrontDesk,
  usePmsMutations,
} from '@/hooks/use-pms';
import type { PMSReservation } from '@/hooks/use-pms';

// ── Types ────────────────────────────────────────────────────────

interface AvailableRoom {
  roomId: string;
  roomNumber: string;
  floor: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────

function guestName(r: PMSReservation): string {
  const g = r.primaryGuestJson;
  if (g?.firstName && g?.lastName) return `${g.firstName} ${g.lastName}`;
  if (g?.firstName) return g.firstName;
  if (g?.lastName) return g.lastName;
  return 'Unknown Guest';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function matchesSearch(r: PMSReservation, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = guestName(r).toLowerCase();
  const room = (r.roomNumber ?? '').toLowerCase();
  const conf = (r.confirmationNumber ?? '').toLowerCase();
  return name.includes(q) || room.includes(q) || conf.includes(q);
}

// ── Room Picker (inline dropdown for unassigned reservations) ────

function RoomPicker({
  reservation,
  onAssignAndCheckIn,
  onCancel,
  isLoading: isCheckingIn,
}: {
  reservation: PMSReservation;
  onAssignAndCheckIn: (roomId: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch available rooms for this reservation's room type + dates
  useEffect(() => {
    let cancelled = false;
    setIsLoadingRooms(true);
    setFetchError(null);

    const qs = new URLSearchParams({
      propertyId: reservation.propertyId,
      roomTypeId: reservation.roomTypeId,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
    });

    apiFetch<{ data: AvailableRoom[] }>(
      `/api/v1/pms/reservations/suggest-rooms?${qs}`,
    )
      .then((res) => {
        if (!cancelled) setRooms(res.data);
      })
      .catch((err) => {
        if (!cancelled)
          setFetchError(
            err instanceof ApiError ? err.message : 'Failed to load rooms',
          );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRooms(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reservation]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedRoom = rooms.find((r) => r.roomId === selectedRoomId);

  return (
    <div className="mt-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          Assign Room — {reservation.roomTypeName ?? 'Room'}
        </span>
        <button
          onClick={onCancel}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isLoadingRooms ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading available rooms...
        </div>
      ) : fetchError ? (
        <div className="py-2 text-xs text-red-500">{fetchError}</div>
      ) : rooms.length === 0 ? (
        <div className="py-2 text-xs text-muted-foreground">
          No available rooms for this type and dates.
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {/* Room dropdown */}
          <div ref={dropdownRef} className="relative flex-1">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground"
            >
              <span>
                {selectedRoom
                  ? `Room ${selectedRoom.roomNumber}${selectedRoom.floor ? ` (Floor ${selectedRoom.floor})` : ''}`
                  : `Select room (${rooms.length} available)`}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
                {rooms.map((room) => (
                  <button
                    key={room.roomId}
                    onClick={() => {
                      setSelectedRoomId(room.roomId);
                      setDropdownOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-accent/50 ${
                      selectedRoomId === room.roomId
                        ? 'bg-indigo-500/10 text-indigo-400'
                        : 'text-foreground'
                    }`}
                  >
                    <BedDouble className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">Room {room.roomNumber}</span>
                    {room.floor && (
                      <span className="text-muted-foreground">
                        Floor {room.floor}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Check In button */}
          <button
            onClick={() => selectedRoomId && onAssignAndCheckIn(selectedRoomId)}
            disabled={!selectedRoomId || isCheckingIn}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isCheckingIn ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogIn className="h-3.5 w-3.5" />
            )}
            Check In
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function FrontDeskContent() {
  useAuthContext();

  // Property selection — cached across PMS pages via React Query (60s staleTime)
  const {
    data: properties,
    isLoading: isLoadingProperties,
    error: propertiesError,
  } = useProperties();
  const [propertyId, setPropertyId] = useState('');

  // Auto-select first property when loaded
  useEffect(() => {
    if (properties.length > 0 && !propertyId) {
      setPropertyId(properties[0]!.id);
    }
  }, [properties, propertyId]);

  // Single batch query — arrivals + in-house in one HTTP request, 30s auto-refresh
  const {
    arrivals,
    inHouse,
    isLoading: isLoadingData,
    isFetching,
    error: dataError,
    refetch,
  } = useFrontDesk(propertyId || null);

  // Mutations — auto-invalidate reservation + room queries on success
  const { checkIn, checkOut } = usePmsMutations(propertyId || null);

  // Action state + error
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState('');

  // Room assignment picker — which reservation is currently picking a room
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const filteredArrivals = useMemo(
    () => arrivals.filter((r) => matchesSearch(r, search)),
    [arrivals, search],
  );
  const filteredInHouse = useMemo(
    () => inHouse.filter((r) => matchesSearch(r, search)),
    [inHouse, search],
  );

  const refreshAll = useCallback(() => {
    setError(null);
    refetch();
  }, [refetch]);

  const handleCheckIn = useCallback(
    async (reservation: PMSReservation, overrideRoomId?: string) => {
      const roomId = overrideRoomId ?? reservation.roomId;
      if (!roomId) {
        // Open the room picker instead of showing error
        setAssigningId(reservation.id);
        return;
      }
      setActionId(reservation.id);
      setAssigningId(null);
      setError(null);
      try {
        await checkIn.mutateAsync({
          id: reservation.id,
          roomId,
          version: reservation.version,
        });
        refetch();
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Check-in failed';
        setError(message);
      } finally {
        setActionId(null);
      }
    },
    [checkIn, refetch],
  );

  const handleCheckOut = useCallback(
    async (reservation: PMSReservation) => {
      setActionId(reservation.id);
      setError(null);
      try {
        await checkOut.mutateAsync({
          id: reservation.id,
          version: reservation.version,
        });
        refetch();
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Check-out failed';
        setError(message);
      } finally {
        setActionId(null);
      }
    },
    [checkOut, refetch],
  );

  // Show spinner on refresh button only when refetching with existing data
  const isRefreshing =
    isFetching && (arrivals.length > 0 || inHouse.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DoorOpen className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Front Desk</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guest, room, confirmation..."
              className="w-56 rounded-lg border border-border bg-surface py-1.5 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={refreshAll}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banners */}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}
      {propertiesError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          Failed to load properties:{' '}
          {propertiesError instanceof Error
            ? propertiesError.message
            : 'Unknown error'}
        </div>
      )}
      {dataError && !error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          Failed to load front desk data:{' '}
          {dataError instanceof Error ? dataError.message : 'Unknown error'}
        </div>
      )}

      {/* Loading skeleton while properties haven't loaded yet */}
      {isLoadingProperties ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !propertyId && !propertiesError ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No PMS property configured. Properties are auto-created from locations
          on first access.
        </div>
      ) : (
        /* Two-panel layout */
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Arrivals panel */}
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <LogIn className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-foreground">
                Arrivals
              </h2>
              <span className="ml-auto rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
                {filteredArrivals.length}
                {search && filteredArrivals.length !== arrivals.length
                  ? ` / ${arrivals.length}`
                  : ''}
              </span>
            </div>
            <div className="divide-y divide-border max-h-[calc(100vh-220px)] overflow-y-auto">
              {isLoadingData && arrivals.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredArrivals.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {search ? 'No matching arrivals.' : 'No arrivals today.'}
                </div>
              ) : (
                filteredArrivals.map((r) => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">
                            {guestName(r)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3 w-3" />
                            {r.roomNumber ? (
                              <>
                                {r.roomNumber}{' '}
                                {r.roomTypeName
                                  ? `(${r.roomTypeName})`
                                  : ''}
                              </>
                            ) : (
                              <span className="text-amber-500">
                                {r.roomTypeName ?? 'Unassigned'}{' '}
                                <ArrowUpRight className="inline h-3 w-3" />{' '}
                                assign room
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(r.checkInDate)} -{' '}
                            {formatDate(r.checkOutDate)}
                          </span>
                          {r.confirmationNumber && (
                            <span className="text-muted-foreground/70">
                              #{r.confirmationNumber}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCheckIn(r)}
                        disabled={actionId === r.id}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {actionId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LogIn className="h-3.5 w-3.5" />
                        )}
                        Check In
                      </button>
                    </div>

                    {/* Room assignment picker (shown when no room assigned) */}
                    {assigningId === r.id && (
                      <RoomPicker
                        reservation={r}
                        onAssignAndCheckIn={(roomId) =>
                          handleCheckIn(r, roomId)
                        }
                        onCancel={() => setAssigningId(null)}
                        isLoading={actionId === r.id}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* In-House panel */}
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <LogOut className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-foreground">
                In-House
              </h2>
              <span className="ml-auto rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
                {filteredInHouse.length}
                {search && filteredInHouse.length !== inHouse.length
                  ? ` / ${inHouse.length}`
                  : ''}
              </span>
            </div>
            <div className="divide-y divide-border max-h-[calc(100vh-220px)] overflow-y-auto">
              {isLoadingData && inHouse.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredInHouse.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {search
                    ? 'No matching in-house guests.'
                    : 'No guests currently in-house.'}
                </div>
              ) : (
                filteredInHouse.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">
                          {guestName(r)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <BedDouble className="h-3 w-3" />
                          {r.roomNumber ?? '-'}{' '}
                          {r.roomTypeName ? `(${r.roomTypeName})` : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(r.checkInDate)} -{' '}
                          {formatDate(r.checkOutDate)}
                        </span>
                        {r.confirmationNumber && (
                          <span className="text-muted-foreground/70">
                            #{r.confirmationNumber}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCheckOut(r)}
                      disabled={actionId === r.id}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogOut className="h-3.5 w-3.5" />
                      )}
                      Check Out
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
