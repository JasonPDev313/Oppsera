'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ═══════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════

export interface PMSProperty {
  id: string;
  tenantId: string;
  name: string;
  timezone: string;
  currency: string;
  addressJson: Record<string, unknown> | null;
  taxRatePct: number;
  checkInTime: string;
  checkOutTime: string;
  nightAuditTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface PMSRoomType {
  id: string;
  tenantId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  bedsJson: { type: string; count: number }[] | null;
  amenitiesJson: string[] | null;
  sortOrder: number;
  roomCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PMSRoom {
  id: string;
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  roomNumber: string;
  floor: string | null;
  status: string;
  featuresJson: Record<string, unknown> | null;
  roomTypeName?: string;
  roomTypeCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PMSRatePlan {
  id: string;
  tenantId: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMSGuest {
  id: string;
  tenantId: string;
  propertyId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  addressJson: Record<string, unknown> | null;
  preferencesJson: Record<string, unknown> | null;
  notes: string | null;
  isVip: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMSReservation {
  id: string;
  tenantId: string;
  propertyId: string;
  confirmationNumber: string;
  guestId: string | null;
  primaryGuestJson: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  roomTypeId: string;
  roomId: string | null;
  ratePlanId: string;
  nightlyRateCents: number;
  totalCents: number;
  status: string;
  sourceType: string;
  internalNotes: string | null;
  guestNotes: string | null;
  version: number;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
  roomTypeName?: string;
  roomNumber?: string;
  ratePlanName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PMSFolio {
  id: string;
  tenantId: string;
  reservationId: string;
  status: string;
  totalChargesCents: number;
  totalPaymentsCents: number;
  balanceCents: number;
  entries: PMSFolioEntry[];
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PMSFolioEntry {
  id: string;
  folioId: string;
  entryType: string;
  description: string;
  amountCents: number;
  sourceRef: string | null;
  createdAt: string;
}

export interface PMSHousekeepingRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  status: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  currentGuestName: string | null;
  checkOutDate: string | null;
  nextCheckInDate: string | null;
}

export interface PMSCalendarBlock {
  reservationId: string;
  roomId: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  guestName: string;
  roomTypeName: string;
  nightlyRateCents: number;
  version: number;
}

export interface PMSCalendarWeek {
  rooms: {
    id: string;
    roomNumber: string;
    roomTypeName: string;
    roomTypeCode: string;
    floor: string | null;
    status: string;
  }[];
  blocks: PMSCalendarBlock[];
  dates: string[];
}

export interface PMSCalendarDay {
  rooms: {
    id: string;
    roomNumber: string;
    roomTypeName: string;
    roomTypeCode: string;
    floor: string | null;
    status: string;
  }[];
  arrivals: PMSReservation[];
  departures: PMSReservation[];
  stayovers: PMSReservation[];
}

export interface PMSSuggestedRoom {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomTypeId: string;
  roomTypeName: string;
  status: string;
}

export interface PMSOccupancyDay {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPct: number;
  revenue: number;
  adr: number;
  revpar: number;
}

export interface PMSRatePlanPrice {
  id: string;
  ratePlanId: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  startDate: string;
  endDate: string;
  nightlyBaseCents: number;
}

export interface PMSRatePlanDetail extends PMSRatePlan {
  prices: PMSRatePlanPrice[];
}

// ═══════════════════════════════════════════════════════════════════
// Filter Interfaces
// ═══════════════════════════════════════════════════════════════════

export interface RoomFilters {
  status?: string;
  roomTypeId?: string;
  floor?: string;
}

export interface ReservationFilters {
  status?: string;
  search?: string;
  guestId?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface HousekeepingFilters {
  status?: string;
  date?: string;
}

// ═══════════════════════════════════════════════════════════════════
// Query Hooks
// ═══════════════════════════════════════════════════════════════════

// ── useProperties ───────────────────────────────────────────────

export function useProperties() {
  const result = useQuery({
    queryKey: ['pms-properties'],
    queryFn: () =>
      apiFetch<{
        data: PMSProperty[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>('/api/v1/pms/properties'),
    staleTime: 60_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useProperty ─────────────────────────────────────────────────

export function useProperty(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-property', id],
    queryFn: () =>
      apiFetch<{ data: PMSProperty }>(`/api/v1/pms/properties/${id}`).then(
        (r) => r.data,
      ),
    enabled: !!id,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useRoomTypes ────────────────────────────────────────────────

export function useRoomTypes(propertyId: string | null) {
  const result = useQuery({
    queryKey: ['pms-room-types', propertyId],
    queryFn: () => {
      const qs = buildQueryString({ propertyId });
      return apiFetch<{ data: PMSRoomType[] }>(
        `/api/v1/pms/room-types${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useRooms ────────────────────────────────────────────────────

export function useRooms(propertyId: string | null, filters: RoomFilters = {}) {
  const result = useQuery({
    queryKey: ['pms-rooms', propertyId, filters],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, ...filters });
      return apiFetch<{ data: PMSRoom[] }>(`/api/v1/pms/rooms${qs}`).then(
        (r) => r.data,
      );
    },
    enabled: !!propertyId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useRoom ─────────────────────────────────────────────────────

export function useRoom(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-room', id],
    queryFn: () =>
      apiFetch<{ data: PMSRoom }>(`/api/v1/pms/rooms/${id}`).then(
        (r) => r.data,
      ),
    enabled: !!id,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useRatePlans ────────────────────────────────────────────────

export function useRatePlans(propertyId: string | null) {
  const result = useQuery({
    queryKey: ['pms-rate-plans', propertyId],
    queryFn: () => {
      const qs = buildQueryString({ propertyId });
      return apiFetch<{ data: PMSRatePlan[] }>(
        `/api/v1/pms/rate-plans${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useRatePlan ─────────────────────────────────────────────────

export function useRatePlan(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-rate-plan', id],
    queryFn: () =>
      apiFetch<{ data: PMSRatePlanDetail }>(`/api/v1/pms/rate-plans/${id}`).then(
        (r) => r.data,
      ),
    enabled: !!id,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useRatePlanPrices ───────────────────────────────────────────

export function useRatePlanPrices(
  ratePlanId: string | null,
  params: { roomTypeId?: string; startDate?: string; endDate?: string } = {},
) {
  const result = useQuery({
    queryKey: ['pms-rate-plan-prices', ratePlanId, params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<{ data: PMSRatePlanPrice[] }>(
        `/api/v1/pms/rate-plans/${ratePlanId}/prices${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!ratePlanId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useGuests ───────────────────────────────────────────────────

export function useGuests(
  propertyId: string | null,
  search?: string,
) {
  const result = useQuery({
    queryKey: ['pms-guests', propertyId, search],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, q: search });
      return apiFetch<{
        data: PMSGuest[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/guests${qs}`);
    },
    enabled: !!propertyId,
    staleTime: 15_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useGuest ────────────────────────────────────────────────────

export function useGuest(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-guest', id],
    queryFn: () =>
      apiFetch<{ data: PMSGuest }>(`/api/v1/pms/guests/${id}`).then(
        (r) => r.data,
      ),
    enabled: !!id,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useReservations ─────────────────────────────────────────────

export function useReservations(
  propertyId: string | null,
  filters: ReservationFilters = {},
) {
  const result = useQuery({
    queryKey: ['pms-reservations', propertyId, filters],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, ...filters });
      return apiFetch<{
        data: PMSReservation[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/reservations${qs}`);
    },
    enabled: !!propertyId,
    staleTime: 15_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useReservation ──────────────────────────────────────────────

export function useReservation(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-reservation', id],
    queryFn: () =>
      apiFetch<{ data: PMSReservation }>(
        `/api/v1/pms/reservations/${id}`,
      ).then((r) => r.data),
    enabled: !!id,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useSuggestRooms ─────────────────────────────────────────────

export function useSuggestRooms(
  propertyId: string | null,
  roomTypeId: string | null,
  checkInDate: string | null,
  checkOutDate: string | null,
  excludeReservationId?: string,
) {
  const result = useQuery({
    queryKey: [
      'pms-suggest-rooms',
      propertyId,
      roomTypeId,
      checkInDate,
      checkOutDate,
      excludeReservationId,
    ],
    queryFn: () => {
      const qs = buildQueryString({
        propertyId,
        roomTypeId,
        checkInDate,
        checkOutDate,
        excludeReservationId,
      });
      return apiFetch<{ data: PMSSuggestedRoom[] }>(
        `/api/v1/pms/reservations/suggest-rooms${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId && !!roomTypeId && !!checkInDate && !!checkOutDate,
    staleTime: 10_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCalendarWeek ─────────────────────────────────────────────

export function useCalendarWeek(
  propertyId: string | null,
  startDate: string | null,
) {
  const result = useQuery({
    queryKey: ['pms-calendar-week', propertyId, startDate],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, start: startDate });
      return apiFetch<{ data: PMSCalendarWeek }>(
        `/api/v1/pms/calendar/week${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId && !!startDate,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCalendarDay ──────────────────────────────────────────────

export function useCalendarDay(
  propertyId: string | null,
  date: string | null,
) {
  const result = useQuery({
    queryKey: ['pms-calendar-day', propertyId, date],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, date });
      return apiFetch<{ data: PMSCalendarDay }>(
        `/api/v1/pms/calendar/day${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId && !!date,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useHousekeepingRooms ────────────────────────────────────────

export function useHousekeepingRooms(
  propertyId: string | null,
  filters: HousekeepingFilters = {},
) {
  const result = useQuery({
    queryKey: ['pms-housekeeping-rooms', propertyId, filters],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, ...filters });
      return apiFetch<{ data: PMSHousekeepingRoom[] }>(
        `/api/v1/pms/housekeeping/rooms${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId && !!filters.date,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useFolio ────────────────────────────────────────────────────

export function useFolio(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-folio', id],
    queryFn: () =>
      apiFetch<{ data: PMSFolio }>(`/api/v1/pms/folios/${id}`).then(
        (r) => r.data,
      ),
    enabled: !!id,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useFolioByReservation ───────────────────────────────────────

export function useFolioByReservation(reservationId: string | null) {
  const result = useQuery({
    queryKey: ['pms-folio-by-reservation', reservationId],
    queryFn: () =>
      apiFetch<{ data: PMSFolio }>(
        `/api/v1/pms/reservations/${reservationId}/folio`,
      ).then((r) => r.data),
    enabled: !!reservationId,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useOccupancy ────────────────────────────────────────────────

export function useOccupancy(
  propertyId: string | null,
  startDate: string | null,
  endDate: string | null,
) {
  const result = useQuery({
    queryKey: ['pms-occupancy', propertyId, startDate, endDate],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, startDate, endDate });
      return apiFetch<{ data: PMSOccupancyDay[] }>(
        `/api/v1/pms/occupancy${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId && !!startDate && !!endDate,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Mutation Hook
// ═══════════════════════════════════════════════════════════════════

export function usePmsMutations(_propertyId: string | null) {
  const queryClient = useQueryClient();

  // ── Invalidation Helpers ────────────────────────────────────────

  const invalidateProperties = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-properties'] });
    queryClient.invalidateQueries({ queryKey: ['pms-property'] });
  };

  const invalidateRoomTypes = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-room-types'] });
  };

  const invalidateRooms = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-rooms'] });
    queryClient.invalidateQueries({ queryKey: ['pms-room'] });
    queryClient.invalidateQueries({ queryKey: ['pms-housekeeping-rooms'] });
  };

  const invalidateRatePlans = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-rate-plans'] });
    queryClient.invalidateQueries({ queryKey: ['pms-rate-plan'] });
    queryClient.invalidateQueries({ queryKey: ['pms-rate-plan-prices'] });
  };

  const invalidateGuests = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-guests'] });
    queryClient.invalidateQueries({ queryKey: ['pms-guest'] });
  };

  const invalidateReservations = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-reservations'] });
    queryClient.invalidateQueries({ queryKey: ['pms-reservation'] });
    queryClient.invalidateQueries({ queryKey: ['pms-calendar-week'] });
    queryClient.invalidateQueries({ queryKey: ['pms-calendar-day'] });
    queryClient.invalidateQueries({ queryKey: ['pms-suggest-rooms'] });
    queryClient.invalidateQueries({ queryKey: ['pms-occupancy'] });
  };

  const invalidateFolios = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-folio'] });
    queryClient.invalidateQueries({ queryKey: ['pms-folio-by-reservation'] });
  };

  const invalidateHousekeeping = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-housekeeping-rooms'] });
    queryClient.invalidateQueries({ queryKey: ['pms-rooms'] });
    queryClient.invalidateQueries({ queryKey: ['pms-room'] });
  };

  // ── Property Mutations ──────────────────────────────────────────

  const createProperty = useMutation({
    mutationFn: (input: {
      name: string;
      timezone: string;
      currency?: string;
      addressJson?: Record<string, unknown>;
      taxRatePct?: number;
      checkInTime?: string;
      checkOutTime?: string;
      nightAuditTime?: string;
    }) =>
      apiFetch<{ data: PMSProperty }>('/api/v1/pms/properties', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateProperties(),
  });

  const updateProperty = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      timezone?: string;
      currency?: string;
      addressJson?: Record<string, unknown>;
      taxRatePct?: number;
      checkInTime?: string;
      checkOutTime?: string;
      nightAuditTime?: string;
    }) =>
      apiFetch<{ data: PMSProperty }>(`/api/v1/pms/properties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateProperties(),
  });

  // ── Room Type Mutations ─────────────────────────────────────────

  const createRoomType = useMutation({
    mutationFn: (input: {
      propertyId: string;
      code: string;
      name: string;
      description?: string;
      maxAdults?: number;
      maxChildren?: number;
      maxOccupancy?: number;
      bedsJson?: { type: string; count: number }[];
      amenitiesJson?: string[];
      sortOrder?: number;
    }) =>
      apiFetch<{ data: PMSRoomType }>('/api/v1/pms/room-types', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRoomTypes(),
  });

  const updateRoomType = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string;
      maxAdults?: number;
      maxChildren?: number;
      maxOccupancy?: number;
      bedsJson?: { type: string; count: number }[];
      amenitiesJson?: string[];
      sortOrder?: number;
    }) =>
      apiFetch<{ data: PMSRoomType }>(`/api/v1/pms/room-types/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRoomTypes(),
  });

  // ── Room Mutations ──────────────────────────────────────────────

  const createRoom = useMutation({
    mutationFn: (input: {
      propertyId: string;
      roomTypeId: string;
      roomNumber: string;
      floor?: string;
      featuresJson?: Record<string, unknown>;
    }) =>
      apiFetch<{ data: PMSRoom }>('/api/v1/pms/rooms', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRooms(),
  });

  const updateRoom = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      roomNumber?: string;
      floor?: string;
      roomTypeId?: string;
      featuresJson?: Record<string, unknown>;
    }) =>
      apiFetch<{ data: PMSRoom }>(`/api/v1/pms/rooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRooms(),
  });

  // ── Rate Plan Mutations ─────────────────────────────────────────

  const createRatePlan = useMutation({
    mutationFn: (input: {
      propertyId: string;
      code: string;
      name: string;
      description?: string;
      isDefault?: boolean;
    }) =>
      apiFetch<{ data: PMSRatePlan }>('/api/v1/pms/rate-plans', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRatePlans(),
  });

  const updateRatePlan = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string;
      isDefault?: boolean;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSRatePlan }>(`/api/v1/pms/rate-plans/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRatePlans(),
  });

  const setRatePlanPrices = useMutation({
    mutationFn: (input: {
      ratePlanId: string;
      roomTypeId: string;
      startDate: string;
      endDate: string;
      nightlyBaseCents: number;
    }) =>
      apiFetch<{ data: PMSRatePlanPrice }>(
        `/api/v1/pms/rate-plans/${input.ratePlanId}/prices`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ).then((r) => r.data),
    onSuccess: () => invalidateRatePlans(),
  });

  // ── Guest Mutations ─────────────────────────────────────────────

  const createGuest = useMutation({
    mutationFn: (input: {
      propertyId: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      addressJson?: Record<string, unknown>;
      preferencesJson?: Record<string, unknown>;
      notes?: string;
      isVip?: boolean;
    }) =>
      apiFetch<{ data: PMSGuest }>('/api/v1/pms/guests', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateGuests(),
  });

  const updateGuest = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      addressJson?: Record<string, unknown>;
      preferencesJson?: Record<string, unknown>;
      notes?: string;
      isVip?: boolean;
    }) =>
      apiFetch<{ data: PMSGuest }>(`/api/v1/pms/guests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateGuests(),
  });

  // ── Reservation Mutations ───────────────────────────────────────

  const createReservation = useMutation({
    mutationFn: (input: {
      propertyId: string;
      guestId?: string;
      primaryGuestJson: {
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
      };
      checkInDate: string;
      checkOutDate: string;
      adults?: number;
      children?: number;
      roomTypeId: string;
      roomId?: string;
      ratePlanId: string;
      nightlyRateCents: number;
      sourceType?: string;
      internalNotes?: string;
      guestNotes?: string;
      status?: 'HOLD' | 'CONFIRMED';
    }) =>
      apiFetch<{ data: PMSReservation }>('/api/v1/pms/reservations', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateReservations(),
  });

  const updateReservation = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      guestId?: string;
      primaryGuestJson?: {
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
      };
      adults?: number;
      children?: number;
      nightlyRateCents?: number;
      ratePlanId?: string;
      internalNotes?: string;
      guestNotes?: string;
      version: number;
    }) =>
      apiFetch<{ data: PMSReservation }>(`/api/v1/pms/reservations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateReservations(),
  });

  const cancelReservation = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      version: number;
      reason?: string;
    }) =>
      apiFetch<{ data: PMSReservation }>(
        `/api/v1/pms/reservations/${id}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ).then((r) => r.data),
    onSuccess: () => invalidateReservations(),
  });

  const markNoShow = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<{ data: PMSReservation }>(
        `/api/v1/pms/reservations/${id}/no-show`,
        {
          method: 'POST',
          body: JSON.stringify({ version }),
        },
      ).then((r) => r.data),
    onSuccess: () => invalidateReservations(),
  });

  // ── Front Desk Mutations ────────────────────────────────────────

  const checkIn = useMutation({
    mutationFn: ({
      id,
      roomId,
      version,
    }: {
      id: string;
      roomId: string;
      version: number;
    }) =>
      apiFetch<{ data: PMSReservation }>(
        `/api/v1/pms/reservations/${id}/check-in`,
        {
          method: 'POST',
          body: JSON.stringify({ roomId, version }),
        },
      ).then((r) => r.data),
    onSuccess: () => {
      invalidateReservations();
      invalidateRooms();
    },
  });

  const checkOut = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<{ data: PMSReservation }>(
        `/api/v1/pms/reservations/${id}/check-out`,
        {
          method: 'POST',
          body: JSON.stringify({ version }),
        },
      ).then((r) => r.data),
    onSuccess: () => {
      invalidateReservations();
      invalidateRooms();
      invalidateFolios();
    },
  });

  const moveRoom = useMutation({
    mutationFn: ({
      id,
      newRoomId,
      version,
    }: {
      id: string;
      newRoomId: string;
      version: number;
    }) =>
      apiFetch<{ data: PMSReservation }>(
        `/api/v1/pms/reservations/${id}/move-room`,
        {
          method: 'POST',
          body: JSON.stringify({ newRoomId, version }),
        },
      ).then((r) => r.data),
    onSuccess: () => {
      invalidateReservations();
      invalidateRooms();
    },
  });

  // ── Calendar Mutations ──────────────────────────────────────────

  const calendarMove = useMutation({
    mutationFn: (input: {
      reservationId: string;
      from: {
        roomId: string;
        checkInDate: string;
        checkOutDate: string;
        version: number;
      };
      to: {
        roomId: string;
        checkInDate: string;
      };
      idempotencyKey: string;
    }) =>
      apiFetch<{ data: PMSReservation }>('/api/v1/pms/calendar/move', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidateReservations();
      invalidateRooms();
    },
  });

  const calendarResize = useMutation({
    mutationFn: (input: {
      reservationId: string;
      edge: 'LEFT' | 'RIGHT';
      from: {
        checkInDate: string;
        checkOutDate: string;
        roomId: string;
        version: number;
      };
      to: {
        checkInDate?: string;
        checkOutDate?: string;
      };
      idempotencyKey: string;
    }) =>
      apiFetch<{ data: PMSReservation }>('/api/v1/pms/calendar/resize', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateReservations(),
  });

  // ── Folio Mutations ─────────────────────────────────────────────

  const postFolioEntry = useMutation({
    mutationFn: ({
      folioId,
      ...input
    }: {
      folioId: string;
      entryType: string;
      description: string;
      amountCents: number;
      sourceRef?: string;
    }) =>
      apiFetch<{ data: PMSFolioEntry }>(
        `/api/v1/pms/folios/${folioId}/entries`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ).then((r) => r.data),
    onSuccess: () => invalidateFolios(),
  });

  const closeFolio = useMutation({
    mutationFn: (folioId: string) =>
      apiFetch<{ data: PMSFolio }>(`/api/v1/pms/folios/${folioId}/close`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidateFolios(),
  });

  // ── Housekeeping Mutations ──────────────────────────────────────

  const updateHousekeeping = useMutation({
    mutationFn: ({
      roomId,
      status,
      reason,
    }: {
      roomId: string;
      status: string;
      reason?: string;
    }) =>
      apiFetch<{ data: PMSRoom }>(
        `/api/v1/pms/housekeeping/rooms/${roomId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, reason }),
        },
      ).then((r) => r.data),
    onSuccess: () => invalidateHousekeeping(),
  });

  return {
    // Properties
    createProperty,
    updateProperty,
    // Room Types
    createRoomType,
    updateRoomType,
    // Rooms
    createRoom,
    updateRoom,
    // Rate Plans
    createRatePlan,
    updateRatePlan,
    setRatePlanPrices,
    // Guests
    createGuest,
    updateGuest,
    // Reservations
    createReservation,
    updateReservation,
    cancelReservation,
    markNoShow,
    // Front Desk
    checkIn,
    checkOut,
    moveRoom,
    // Calendar
    calendarMove,
    calendarResize,
    // Folios
    postFolioEntry,
    closeFolio,
    // Housekeeping
    updateHousekeeping,
  };
}
