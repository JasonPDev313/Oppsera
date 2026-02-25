'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  DoorOpen,
  LogIn,
  LogOut,
  Loader2,
  RefreshCw,
  User,
  BedDouble,
  CalendarDays,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { ApiError } from '@/lib/api-client';
import {
  useProperties,
  useFrontDesk,
  usePmsMutations,
} from '@/hooks/use-pms';
import type { PMSReservation } from '@/hooks/use-pms';

// ── Helpers ──────────────────────────────────────────────────────

function guestName(r: PMSReservation): string {
  if (r.primaryGuestJson) {
    return `${r.primaryGuestJson.firstName} ${r.primaryGuestJson.lastName}`;
  }
  return 'Unknown Guest';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────

export default function FrontDeskContent() {
  useAuthContext();

  // Property selection — cached across PMS pages via React Query (60s staleTime)
  const { data: properties, isLoading: isLoadingProperties, error: propertiesError } = useProperties();
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

  const refreshAll = useCallback(() => {
    setError(null);
    refetch();
  }, [refetch]);

  const handleCheckIn = useCallback(
    async (reservation: PMSReservation) => {
      if (!reservation.roomId) {
        setError('No room assigned. Assign a room before checking in.');
        return;
      }
      setActionId(reservation.id);
      setError(null);
      try {
        await checkIn.mutateAsync({
          id: reservation.id,
          roomId: reservation.roomId,
          version: reservation.version,
        });
        // Refetch front desk data after mutation
        refetch();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Check-in failed';
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
        // Refetch front desk data after mutation
        refetch();
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Check-out failed';
        setError(message);
      } finally {
        setActionId(null);
      }
    },
    [checkOut, refetch],
  );

  // Show spinner on refresh button only when refetching with existing data
  const isRefreshing = isFetching && (arrivals.length > 0 || inHouse.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DoorOpen className="h-5 w-5 text-gray-500" />
          <h1 className="text-xl font-semibold text-gray-900">Front Desk</h1>
        </div>
        <div className="flex items-center gap-2">
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-sm text-gray-900"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={refreshAll}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200/50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
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
          Failed to load properties: {propertiesError instanceof Error ? propertiesError.message : 'Unknown error'}
        </div>
      )}
      {dataError && !error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          Failed to load front desk data: {dataError instanceof Error ? dataError.message : 'Unknown error'}
        </div>
      )}

      {/* Loading skeleton while properties haven't loaded yet */}
      {isLoadingProperties ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !propertyId && !propertiesError ? (
        <div className="py-16 text-center text-sm text-gray-500">
          No PMS property configured. Properties are auto-created from locations on first access.
        </div>
      ) : (
        /* Two-panel layout */
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Arrivals panel */}
          <div className="rounded-lg border border-gray-200 bg-surface">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <LogIn className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-gray-900">Arrivals</h2>
              <span className="ml-auto rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
                {arrivals.length}
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {isLoadingData && arrivals.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : arrivals.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No arrivals today.
                </div>
              ) : (
                arrivals.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {guestName(r)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <BedDouble className="h-3 w-3" />
                          {r.roomNumber ?? 'Unassigned'} {r.roomTypeName ? `(${r.roomTypeName})` : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(r.checkInDate)} - {formatDate(r.checkOutDate)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleCheckIn(r)}
                      disabled={actionId === r.id}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {actionId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogIn className="h-3.5 w-3.5" />
                      )}
                      Check In
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* In-House panel */}
          <div className="rounded-lg border border-gray-200 bg-surface">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <LogOut className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-900">In-House</h2>
              <span className="ml-auto rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
                {inHouse.length}
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {isLoadingData && inHouse.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : inHouse.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No guests currently in-house.
                </div>
              ) : (
                inHouse.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {guestName(r)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <BedDouble className="h-3 w-3" />
                          {r.roomNumber ?? '-'} {r.roomTypeName ? `(${r.roomTypeName})` : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(r.checkInDate)} - {formatDate(r.checkOutDate)}
                        </span>
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
