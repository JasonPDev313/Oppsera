'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  quotedWaitMinutes: number | null;
  status: string;
  priority: number;
  position: number;
  seatingPreference: string | null;
  specialRequests: string | null;
  isVip: boolean;
  vipNote: string | null;
  customerId: string | null;
  addedAt: string;
  notifiedAt: string | null;
  elapsedMinutes: number;
  source: string;
  notes: string | null;
}

export interface ReservationEntry {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  durationMinutes: number;
  endTime: string | null;
  status: string;
  seatingPreference: string | null;
  specialRequests: string | null;
  occasion: string | null;
  isVip: boolean;
  assignedTableId: string | null;
  assignedTableLabel: string | null;
  notes: string | null;
  minutesUntil: number;
}

export interface TableSummary {
  total: number;
  available: number;
  seated: number;
  reserved: number;
  dirty: number;
  blocked: number;
}

export interface ServerSummary {
  serverUserId: string;
  serverName: string | null;
  sectionNames: string[];
  coversServed: number;
  openTabCount: number;
  isNext: boolean;
}

export interface DashboardStats {
  totalCoversToday: number;
  currentWaiting: number;
  avgWaitMinutes: number;
  reservationsToday: number;
  noShowsToday: number;
  seatedFromWaitlist: number;
}

export interface HostDashboard {
  waitlist: WaitlistEntry[];
  upcomingReservations: ReservationEntry[];
  tableSummary: TableSummary;
  servers: ServerSummary[];
  nextUpServerUserId: string | null;
  stats: DashboardStats;
}

export interface WaitTimeEstimate {
  estimatedMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  basedOnSamples: number;
  currentQueueLength: number;
  currentAvgWait: number;
  partySizeAdjustment: number;
}

export interface AvailableTable {
  tableId: string;
  displayLabel: string;
  minCapacity: number;
  maxCapacity: number;
  tableType: string;
  shape: string;
  sectionName: string | null;
  serverName: string | null;
  currentStatus: string;
  roomName: string | null;
  fitScore: number;
  fitReason: string;
}

export interface TableAvailabilityResult {
  suggestedTables: AvailableTable[];
  allAvailable: AvailableTable[];
  totalAvailable: number;
  totalTables: number;
}

export interface HostSettings {
  id: string | null;
  locationId: string;
  defaultWaitQuoteMinutes: number;
  autoQuoteEnabled: boolean;
  rotationMode: string;
  maxPartySize: number;
  enableVipPriority: boolean;
  enableSmsNotifications: boolean;
  enableOnlineWaitlist: boolean;
  enableOnlineReservations: boolean;
  reservationSlotIntervalMinutes: number;
  defaultReservationDurationMinutes: number;
  maxAdvanceBookingDays: number;
  requirePhoneForWaitlist: boolean;
  requirePhoneForReservation: boolean;
  autoSeatFromWaitlist: boolean;
  noShowWindowMinutes: number;
}

// ── Inputs ───────────────────────────────────────────────────────

export interface AddToWaitlistInput {
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  partySize: number;
  quotedWaitMinutes?: number;
  seatingPreference?: string;
  specialRequests?: string;
  isVip?: boolean;
  vipNote?: string;
  customerId?: string;
  source?: string;
  notes?: string;
}

export interface CreateReservationInput {
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  durationMinutes?: number;
  seatingPreference?: string;
  specialRequests?: string;
  occasion?: string;
  isVip?: boolean;
  vipNote?: string;
  customerId?: string;
  assignedTableId?: string;
  source?: string;
  notes?: string;
}

// ── Dashboard Hook ───────────────────────────────────────────────

interface UseHostDashboardOptions {
  locationId: string | null;
  businessDate?: string;
  pollIntervalMs?: number;
}

export function useHostDashboard({
  locationId,
  businessDate,
  pollIntervalMs = 15_000,
}: UseHostDashboardOptions) {
  const date = businessDate ?? new Date().toISOString().slice(0, 10);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['host-dashboard', locationId, date],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: HostDashboard }>(
        `/api/v1/fnb/host/dashboard?locationId=${locationId}&businessDate=${date}`,
        { signal },
      );
      return json.data;
    },
    enabled: !!locationId,
    staleTime: 10_000,
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: true,
  });

  return {
    dashboard: data ?? null,
    waitlist: data?.waitlist ?? [],
    reservations: data?.upcomingReservations ?? [],
    tableSummary: data?.tableSummary ?? null,
    servers: data?.servers ?? [],
    stats: data?.stats ?? null,
    nextUpServerUserId: data?.nextUpServerUserId ?? null,
    isLoading,
    error: error?.message ?? null,
    refresh: refetch,
  };
}

// ── Wait Time Estimate Hook ──────────────────────────────────────

export function useWaitTimeEstimate(
  locationId: string | null,
  partySize: number,
  businessDate?: string,
) {
  const date = businessDate ?? new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ['host-wait-estimate', locationId, partySize, date],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: WaitTimeEstimate }>(
        `/api/v1/fnb/host/wait-estimate?locationId=${locationId}&partySize=${partySize}&businessDate=${date}`,
        { signal },
      );
      return json.data;
    },
    enabled: !!locationId && partySize > 0,
    staleTime: 30_000,
  });

  return { estimate: data ?? null, isLoading };
}

// ── Table Availability Hook ──────────────────────────────────────

export function useTableAvailability(
  locationId: string | null,
  partySize: number,
  seatingPreference?: string,
  businessDate?: string,
) {
  const date = businessDate ?? new Date().toISOString().slice(0, 10);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['host-table-availability', locationId, partySize, seatingPreference, date],
    queryFn: async ({ signal }) => {
      let url = `/api/v1/fnb/host/table-availability?locationId=${locationId}&partySize=${partySize}&businessDate=${date}`;
      if (seatingPreference) url += `&seatingPreference=${seatingPreference}`;
      const json = await apiFetch<{ data: TableAvailabilityResult }>(url, { signal });
      return json.data;
    },
    enabled: !!locationId && partySize > 0,
    staleTime: 10_000,
  });

  return {
    suggested: data?.suggestedTables ?? [],
    allAvailable: data?.allAvailable ?? [],
    totalAvailable: data?.totalAvailable ?? 0,
    totalTables: data?.totalTables ?? 0,
    isLoading,
    refresh: refetch,
  };
}

// ── Host Settings Hook ───────────────────────────────────────────

export function useHostSettings(locationId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['host-settings', locationId],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: HostSettings }>(
        `/api/v1/fnb/host/settings?locationId=${locationId}`,
        { signal },
      );
      return json.data;
    },
    enabled: !!locationId,
    staleTime: 60_000,
  });

  const updateSettings = useMutation({
    mutationFn: async (input: Partial<HostSettings>) => {
      const json = await apiFetch<{ data: HostSettings }>(
        '/api/v1/fnb/host/settings',
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['host-settings', locationId] });
    },
  });

  return {
    settings: data ?? null,
    isLoading,
    updateSettings: updateSettings.mutateAsync,
    isSaving: updateSettings.isPending,
  };
}

// ── Waitlist Mutations ───────────────────────────────────────────

export function useWaitlistMutations(_locationId: string | null) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['host-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['host-table-availability'] });
  }, [queryClient]);

  const addToWaitlist = useMutation({
    mutationFn: async (input: AddToWaitlistInput) => {
      const json = await apiFetch<{ data: WaitlistEntry }>(
        '/api/v1/fnb/host/waitlist',
        { method: 'POST', body: JSON.stringify(input) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<AddToWaitlistInput>) => {
      const json = await apiFetch<{ data: WaitlistEntry }>(
        `/api/v1/fnb/host/waitlist/${id}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  const seatGuest = useMutation({
    mutationFn: async (input: { id: string; tableId: string; serverUserId?: string }) => {
      const json = await apiFetch<{ data: unknown }>(
        `/api/v1/fnb/host/waitlist/${input.id}/seat`,
        { method: 'POST', body: JSON.stringify({ tableId: input.tableId, serverUserId: input.serverUserId }) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  const notifyGuest = useMutation({
    mutationFn: async (input: { id: string; method?: string }) => {
      const json = await apiFetch<{ data: unknown }>(
        `/api/v1/fnb/host/waitlist/${input.id}/notify`,
        { method: 'POST', body: JSON.stringify({ method: input.method }) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  const removeGuest = useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const json = await apiFetch<{ data: unknown }>(
        `/api/v1/fnb/host/waitlist/${input.id}`,
        { method: 'DELETE', body: JSON.stringify({ reason: input.reason }) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  return {
    addToWaitlist: addToWaitlist.mutateAsync,
    updateEntry: updateEntry.mutateAsync,
    seatGuest: seatGuest.mutateAsync,
    notifyGuest: notifyGuest.mutateAsync,
    removeGuest: removeGuest.mutateAsync,
    isAdding: addToWaitlist.isPending,
    isSeating: seatGuest.isPending,
    isNotifying: notifyGuest.isPending,
    error,
    clearError: () => setError(null),
  };
}

// ── Reservation Mutations ────────────────────────────────────────

export function useReservationMutations(_locationId: string | null) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['host-dashboard'] });
  }, [queryClient]);

  const createReservation = useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      const json = await apiFetch<{ data: ReservationEntry }>(
        '/api/v1/fnb/host/reservations',
        { method: 'POST', body: JSON.stringify(input) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  const updateReservation = useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<CreateReservationInput>) => {
      const json = await apiFetch<{ data: ReservationEntry }>(
        `/api/v1/fnb/host/reservations/${id}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  const checkIn = useMutation({
    mutationFn: async (input: { id: string; tableId?: string; serverUserId?: string }) => {
      const json = await apiFetch<{ data: unknown }>(
        `/api/v1/fnb/host/reservations/${input.id}/check-in`,
        { method: 'POST', body: JSON.stringify({ tableId: input.tableId, serverUserId: input.serverUserId }) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  const cancelReservation = useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const json = await apiFetch<{ data: unknown }>(
        `/api/v1/fnb/host/reservations/${input.id}/cancel`,
        { method: 'POST', body: JSON.stringify({ reason: input.reason }) },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  const markNoShow = useMutation({
    mutationFn: async (id: string) => {
      const json = await apiFetch<{ data: unknown }>(
        `/api/v1/fnb/host/reservations/${id}/no-show`,
        { method: 'POST' },
      );
      return json.data;
    },
    onSuccess: invalidateAll,
    onError: (e) => setError(e.message),
  });

  return {
    createReservation: createReservation.mutateAsync,
    updateReservation: updateReservation.mutateAsync,
    checkIn: checkIn.mutateAsync,
    cancelReservation: cancelReservation.mutateAsync,
    markNoShow: markNoShow.mutateAsync,
    isCreating: createReservation.isPending,
    isCheckingIn: checkIn.isPending,
    error,
    clearError: () => setError(null),
  };
}
