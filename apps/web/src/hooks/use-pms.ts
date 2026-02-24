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

export interface PMSPaymentMethod {
  id: string;
  tenantId: string;
  guestId: string;
  gateway: string;
  gatewayCustomerId: string | null;
  gatewayPaymentMethodId: string | null;
  cardLastFour: string | null;
  cardBrand: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMSPaymentTransaction {
  id: string;
  tenantId: string;
  propertyId: string;
  folioId: string | null;
  reservationId: string | null;
  paymentMethodId: string | null;
  gateway: string;
  gatewayChargeId: string | null;
  gatewayRefundId: string | null;
  transactionType: string;
  amountCents: number;
  currency: string;
  status: string;
  description: string | null;
  failureReason: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface PMSDepositPolicy {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  depositType: string;
  percentagePct: number | null;
  fixedAmountCents: number | null;
  chargeTiming: string;
  daysBefore: number | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMSCancellationPolicy {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  penaltyType: string;
  percentagePct: number | null;
  fixedAmountCents: number | null;
  deadlineHours: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

// ── usePaymentMethods ──────────────────────────────────────────

export function usePaymentMethods(guestId: string | null) {
  const result = useQuery({
    queryKey: ['pms-payment-methods', guestId],
    queryFn: () => {
      const qs = buildQueryString({ guestId });
      return apiFetch<{ data: PMSPaymentMethod[] }>(
        `/api/v1/pms/payment-methods${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!guestId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── usePaymentTransactions ────────────────────────────────────

export function usePaymentTransactions(
  filters: { folioId?: string; reservationId?: string } = {},
) {
  const result = useQuery({
    queryKey: ['pms-payment-transactions', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: PMSPaymentTransaction[] }>(
        `/api/v1/pms/payments${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!(filters.folioId || filters.reservationId),
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useDepositPolicies ────────────────────────────────────────

export function useDepositPolicies(propertyId: string | null) {
  const result = useQuery({
    queryKey: ['pms-deposit-policies', propertyId],
    queryFn: () => {
      const qs = buildQueryString({ propertyId });
      return apiFetch<{ data: PMSDepositPolicy[] }>(
        `/api/v1/pms/deposit-policies${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCancellationPolicies ───────────────────────────────────

export function useCancellationPolicies(propertyId: string | null) {
  const result = useQuery({
    queryKey: ['pms-cancellation-policies', propertyId],
    queryFn: () => {
      const qs = buildQueryString({ propertyId });
      return apiFetch<{ data: PMSCancellationPolicy[] }>(
        `/api/v1/pms/cancellation-policies${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId,
    staleTime: 60_000,
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

  const invalidateRestrictions = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-restrictions'] });
  };

  const invalidatePaymentMethods = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-payment-methods'] });
  };

  const invalidatePaymentTransactions = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-payment-transactions'] });
  };

  const invalidateDepositPolicies = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-deposit-policies'] });
  };

  const invalidateCancellationPolicies = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-cancellation-policies'] });
  };

  const invalidateMessageTemplates = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-message-templates'] });
  };

  const invalidateMessageLog = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-message-log'] });
  };

  const invalidateHousekeepers = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-housekeepers'] });
  };

  const invalidateHkAssignments = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-hk-assignments'] });
    queryClient.invalidateQueries({ queryKey: ['pms-hk-workload'] });
    queryClient.invalidateQueries({ queryKey: ['pms-housekeeping-rooms'] });
    queryClient.invalidateQueries({ queryKey: ['pms-rooms'] });
    queryClient.invalidateQueries({ queryKey: ['pms-room'] });
  };

  const invalidateWorkOrders = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['pms-work-order'] });
  };

  const invalidateRatePackages = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-rate-packages'] });
    queryClient.invalidateQueries({ queryKey: ['pms-rate-package'] });
  };

  const invalidateGroups = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-groups'] });
    queryClient.invalidateQueries({ queryKey: ['pms-group'] });
  };

  const invalidateCorporateAccounts = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-corporate-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['pms-corporate-account'] });
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

  // ── Restriction Mutations ──────────────────────────────────────

  const setRestrictions = useMutation({
    mutationFn: (input: {
      propertyId: string;
      roomTypeId?: string;
      ratePlanId?: string;
      dates: Array<{
        date: string;
        minStay?: number | null;
        maxStay?: number | null;
        cta?: boolean;
        ctd?: boolean;
        stopSell?: boolean;
      }>;
    }) =>
      apiFetch<{ data: { propertyId: string; upsertedCount: number } }>('/api/v1/pms/restrictions', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRestrictions(),
  });

  const clearRestrictions = useMutation({
    mutationFn: (input: {
      propertyId: string;
      startDate: string;
      endDate: string;
      roomTypeId?: string;
      ratePlanId?: string;
    }) =>
      apiFetch<{ data: { propertyId: string; deletedCount: number } }>('/api/v1/pms/restrictions', {
        method: 'DELETE',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRestrictions(),
  });

  // ── Payment Method Mutations ─────────────────────────────────

  const savePaymentMethod = useMutation({
    mutationFn: (input: {
      guestId: string;
      gateway?: string;
      gatewayCustomerId?: string;
      gatewayPaymentMethodId?: string;
      cardLastFour?: string;
      cardBrand?: string;
      cardExpMonth?: number;
      cardExpYear?: number;
      isDefault?: boolean;
    }) =>
      apiFetch<{ data: PMSPaymentMethod }>('/api/v1/pms/payment-methods', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidatePaymentMethods(),
  });

  const removePaymentMethod = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/pms/payment-methods/${id}`, {
        method: 'DELETE',
      }).then((r) => r.data),
    onSuccess: () => invalidatePaymentMethods(),
  });

  // ── Payment Transaction Mutations ────────────────────────────

  const authorizeDeposit = useMutation({
    mutationFn: (input: {
      reservationId: string;
      paymentMethodId: string;
      amountCents: number;
      currency?: string;
      description?: string;
    }) =>
      apiFetch<{ data: PMSPaymentTransaction }>('/api/v1/pms/payments/authorize', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidatePaymentTransactions();
      invalidateReservations();
    },
  });

  const captureDeposit = useMutation({
    mutationFn: (input: {
      transactionId: string;
      amountCents?: number;
    }) =>
      apiFetch<{ data: PMSPaymentTransaction }>('/api/v1/pms/payments/capture', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidatePaymentTransactions();
      invalidateFolios();
      invalidateReservations();
    },
  });

  const chargeCard = useMutation({
    mutationFn: (input: {
      reservationId: string;
      paymentMethodId: string;
      amountCents: number;
      currency?: string;
      description?: string;
    }) =>
      apiFetch<{ data: PMSPaymentTransaction }>('/api/v1/pms/payments/charge', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidatePaymentTransactions();
      invalidateFolios();
      invalidateReservations();
    },
  });

  const refundPayment = useMutation({
    mutationFn: ({
      transactionId,
      ...input
    }: {
      transactionId: string;
      amountCents?: number;
      reason?: string;
    }) =>
      apiFetch<{ data: PMSPaymentTransaction }>(`/api/v1/pms/payments/${transactionId}/refund`, {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidatePaymentTransactions();
      invalidateFolios();
    },
  });

  // ── Deposit Policy Mutations ─────────────────────────────────

  const createDepositPolicy = useMutation({
    mutationFn: (input: {
      propertyId: string;
      name: string;
      depositType: 'first_night' | 'percentage' | 'fixed_amount';
      percentagePct?: number;
      fixedAmountCents?: number;
      chargeTiming?: 'at_booking' | 'days_before_arrival';
      daysBefore?: number;
      isDefault?: boolean;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSDepositPolicy }>('/api/v1/pms/deposit-policies', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateDepositPolicies(),
  });

  const updateDepositPolicy = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      depositType?: 'first_night' | 'percentage' | 'fixed_amount';
      percentagePct?: number;
      fixedAmountCents?: number;
      chargeTiming?: 'at_booking' | 'days_before_arrival';
      daysBefore?: number;
      isDefault?: boolean;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSDepositPolicy }>(`/api/v1/pms/deposit-policies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateDepositPolicies(),
  });

  // ── Cancellation Policy Mutations ────────────────────────────

  const createCancellationPolicy = useMutation({
    mutationFn: (input: {
      propertyId: string;
      name: string;
      penaltyType: 'none' | 'first_night' | 'percentage' | 'fixed_amount';
      percentagePct?: number;
      fixedAmountCents?: number;
      deadlineHours?: number;
      isDefault?: boolean;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSCancellationPolicy }>('/api/v1/pms/cancellation-policies', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateCancellationPolicies(),
  });

  const updateCancellationPolicy = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      penaltyType?: 'none' | 'first_night' | 'percentage' | 'fixed_amount';
      percentagePct?: number;
      fixedAmountCents?: number;
      deadlineHours?: number;
      isDefault?: boolean;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSCancellationPolicy }>(`/api/v1/pms/cancellation-policies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateCancellationPolicies(),
  });

  // ── Message Template Mutations ────────────────────────────────

  const createMessageTemplate = useMutation({
    mutationFn: (input: {
      propertyId: string;
      templateKey: string;
      channel: string;
      subject?: string | null;
      bodyTemplate: string;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: { id: string } }>('/api/v1/pms/message-templates', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateMessageTemplates(),
  });

  const updateMessageTemplate = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      subject?: string | null;
      bodyTemplate?: string;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/pms/message-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateMessageTemplates(),
  });

  // ── Message Mutations ─────────────────────────────────────────

  const sendReservationMessage = useMutation({
    mutationFn: (input: {
      reservationId: string;
      templateKey: string;
      channel: string;
    }) =>
      apiFetch<{ data: { id: string; status: string } }>('/api/v1/pms/messages/send', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateMessageLog(),
  });

  const logCommunication = useMutation({
    mutationFn: (input: {
      propertyId: string;
      guestId: string;
      reservationId?: string | null;
      channel: string;
      direction: string;
      messageType: string;
      subject?: string | null;
      body: string;
      recipient?: string | null;
    }) =>
      apiFetch<{ data: { id: string } }>('/api/v1/pms/messages/log', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateMessageLog(),
  });

  // ── Housekeeper Mutations ─────────────────────────────────────────

  const createHousekeeper = useMutation({
    mutationFn: (input: {
      propertyId: string;
      name: string;
      userId?: string;
      phone?: string;
    }) =>
      apiFetch<{ data: PMSHousekeeper }>('/api/v1/pms/housekeepers', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateHousekeepers(),
  });

  const updateHousekeeper = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      name?: string;
      phone?: string;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSHousekeeper }>(`/api/v1/pms/housekeepers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateHousekeepers(),
  });

  // ── Housekeeping Assignment Mutations ─────────────────────────────

  const assignHousekeeping = useMutation({
    mutationFn: (input: {
      propertyId: string;
      businessDate: string;
      assignments: Array<{
        roomId: string;
        housekeeperId: string;
        priority?: number;
      }>;
    }) =>
      apiFetch<{ data: { assignedCount: number } }>('/api/v1/pms/housekeeping/assign', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateHkAssignments(),
  });

  const startCleaning = useMutation({
    mutationFn: (assignmentId: string) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/pms/housekeeping/assignments/${assignmentId}/start`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidateHkAssignments(),
  });

  const completeCleaning = useMutation({
    mutationFn: ({ assignmentId, notes }: { assignmentId: string; notes?: string }) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/pms/housekeeping/assignments/${assignmentId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }).then((r) => r.data),
    onSuccess: () => invalidateHkAssignments(),
  });

  const skipCleaning = useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: string; reason?: string }) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/pms/housekeeping/assignments/${assignmentId}/skip`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }).then((r) => r.data),
    onSuccess: () => invalidateHkAssignments(),
  });

  // ── Work Order Mutations ──────────────────────────────────────────

  const createWorkOrder = useMutation({
    mutationFn: (input: {
      propertyId: string;
      roomId?: string;
      title: string;
      description?: string;
      category: string;
      priority: string;
      assignedTo?: string;
      estimatedHours?: number;
      dueDate?: string;
    }) =>
      apiFetch<{ data: PMSWorkOrder }>('/api/v1/pms/work-orders', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateWorkOrders(),
  });

  const updateWorkOrder = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      title?: string;
      description?: string;
      category?: string;
      priority?: string;
      status?: string;
      assignedTo?: string;
      estimatedHours?: number;
      dueDate?: string;
    }) =>
      apiFetch<{ data: PMSWorkOrder }>(`/api/v1/pms/work-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateWorkOrders(),
  });

  const completeWorkOrder = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      resolutionNotes?: string;
      actualHours?: number;
      partsCostCents?: number;
    }) =>
      apiFetch<{ data: PMSWorkOrder }>(`/api/v1/pms/work-orders/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateWorkOrders(),
  });

  const addWorkOrderComment = useMutation({
    mutationFn: ({ workOrderId, comment }: {
      workOrderId: string;
      comment: string;
    }) =>
      apiFetch<{ data: PMSWorkOrderComment }>(`/api/v1/pms/work-orders/${workOrderId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment }),
      }).then((r) => r.data),
    onSuccess: () => invalidateWorkOrders(),
  });

  // ── Rate Package Mutations ────────────────────────────────────────

  const createRatePackage = useMutation({
    mutationFn: (input: {
      propertyId: string;
      code: string;
      name: string;
      description?: string;
      ratePlanId?: string;
      includesJson?: PMSRatePackageInclude[];
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSRatePackage }>('/api/v1/pms/rate-packages', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRatePackages(),
  });

  const updateRatePackage = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      name?: string;
      description?: string | null;
      ratePlanId?: string | null;
      includesJson?: PMSRatePackageInclude[];
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSRatePackage }>(`/api/v1/pms/rate-packages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateRatePackages(),
  });

  const deactivateRatePackage = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: PMSRatePackage }>(`/api/v1/pms/rate-packages/${id}`, {
        method: 'DELETE',
      }).then((r) => r.data),
    onSuccess: () => invalidateRatePackages(),
  });

  // ── Pricing Rule Mutations ──────────────────────────────────────────

  const invalidatePricingRules = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-pricing-rules'] });
    queryClient.invalidateQueries({ queryKey: ['pms-pricing-rule'] });
    queryClient.invalidateQueries({ queryKey: ['pms-pricing-log'] });
    queryClient.invalidateQueries({ queryKey: ['pms-pricing-preview'] });
  };

  const createPricingRule = useMutation({
    mutationFn: (input: {
      propertyId: string;
      name: string;
      ruleType: string;
      priority?: number;
      conditions: Record<string, unknown>;
      adjustments: Record<string, unknown>;
      floorCents?: number;
      ceilingCents?: number;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSPricingRule }>('/api/v1/pms/pricing-rules', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidatePricingRules(),
  });

  const updatePricingRule = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      name?: string;
      ruleType?: string;
      priority?: number;
      conditions?: Record<string, unknown>;
      adjustments?: Record<string, unknown>;
      floorCents?: number | null;
      ceilingCents?: number | null;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSPricingRule }>(`/api/v1/pms/pricing-rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidatePricingRules(),
  });

  const deactivatePricingRule = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: PMSPricingRule }>(`/api/v1/pms/pricing-rules/${id}`, {
        method: 'DELETE',
      }).then((r) => r.data),
    onSuccess: () => invalidatePricingRules(),
  });

  const runPricingEngine = useMutation({
    mutationFn: (input: {
      propertyId: string;
      startDate: string;
      endDate: string;
    }) =>
      apiFetch<{ data: { totalDatesProcessed: number; totalAdjusted: number } }>('/api/v1/pms/pricing-rules/run', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidatePricingRules(),
  });

  // ── Group Mutations ─────────────────────────────────────────────────

  const createGroup = useMutation({
    mutationFn: (input: {
      propertyId: string;
      name: string;
      groupType?: string;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      corporateAccountId?: string;
      ratePlanId?: string;
      negotiatedRateCents?: number;
      startDate: string;
      endDate: string;
      cutoffDate?: string;
      status?: string;
      billingType?: string;
      notes?: string;
    }) =>
      apiFetch<{ data: PMSGroup }>('/api/v1/pms/groups', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateGroups(),
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      name?: string;
      groupType?: string;
      contactName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      ratePlanId?: string | null;
      negotiatedRateCents?: number;
      startDate?: string;
      endDate?: string;
      cutoffDate?: string | null;
      status?: string;
      billingType?: string;
      notes?: string | null;
    }) =>
      apiFetch<{ data: PMSGroup }>(`/api/v1/pms/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateGroups(),
  });

  const setGroupBlocks = useMutation({
    mutationFn: ({ groupId, blocks }: {
      groupId: string;
      blocks: Array<{
        roomTypeId: string;
        blockDate: string;
        roomsBlocked: number;
      }>;
    }) =>
      apiFetch<{ data: { blocksSet: number } }>(`/api/v1/pms/groups/${groupId}/blocks`, {
        method: 'POST',
        body: JSON.stringify({ blocks }),
      }).then((r) => r.data),
    onSuccess: () => invalidateGroups(),
  });

  const pickUpGroupRoom = useMutation({
    mutationFn: ({ groupId, reservationInput }: {
      groupId: string;
      reservationInput: {
        primaryGuestJson: { firstName: string; lastName: string; email?: string; phone?: string };
        checkInDate: string;
        checkOutDate: string;
        roomTypeId: string;
        adults?: number;
        children?: number;
        guestId?: string;
        roomId?: string;
        ratePlanId?: string;
        nightlyRateCents?: number;
        sourceType?: string;
        internalNotes?: string;
        guestNotes?: string;
        status?: string;
        restrictionOverride?: boolean;
      };
    }) =>
      apiFetch<{ data: { reservationId: string } }>(`/api/v1/pms/groups/${groupId}/pickup`, {
        method: 'POST',
        body: JSON.stringify({ reservationInput }),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidateGroups();
      invalidateReservations();
    },
  });

  const releaseGroupBlocks = useMutation({
    mutationFn: (groupId: string) =>
      apiFetch<{ data: { releasedCount: number } }>(`/api/v1/pms/groups/${groupId}/release`, {
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: () => invalidateGroups(),
  });

  // ── Corporate Account Mutations ─────────────────────────────────────

  const createCorporateAccount = useMutation({
    mutationFn: (input: {
      propertyId?: string;
      companyName: string;
      taxId?: string;
      billingAddressJson?: Record<string, unknown>;
      contactName?: string;
      contactEmail?: string;
      contactPhone?: string;
      defaultRatePlanId?: string;
      negotiatedDiscountPct?: number;
      billingType?: string;
      paymentTermsDays?: number;
      creditLimitCents?: number;
      notes?: string;
    }) =>
      apiFetch<{ data: PMSCorporateAccount }>('/api/v1/pms/corporate-accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateCorporateAccounts(),
  });

  const updateCorporateAccount = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      companyName?: string;
      taxId?: string | null;
      billingAddressJson?: Record<string, unknown>;
      contactName?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
      defaultRatePlanId?: string | null;
      negotiatedDiscountPct?: number;
      billingType?: string;
      paymentTermsDays?: number;
      creditLimitCents?: number;
      isActive?: boolean;
      notes?: string | null;
    }) =>
      apiFetch<{ data: PMSCorporateAccount }>(`/api/v1/pms/corporate-accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateCorporateAccounts(),
  });

  const deactivateCorporateAccount = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: PMSCorporateAccount }>(`/api/v1/pms/corporate-accounts/${id}`, {
        method: 'DELETE',
      }).then((r) => r.data),
    onSuccess: () => invalidateCorporateAccounts(),
  });

  const setCorporateRateOverrides = useMutation({
    mutationFn: ({ accountId, overrides }: {
      accountId: string;
      overrides: Array<{
        roomTypeId: string;
        negotiatedRateCents: number;
        startDate?: string;
        endDate?: string;
      }>;
    }) =>
      apiFetch<{ data: { overridesSet: number } }>(`/api/v1/pms/corporate-accounts/${accountId}/rates`, {
        method: 'POST',
        body: JSON.stringify({ overrides }),
      }).then((r) => r.data),
    onSuccess: () => invalidateCorporateAccounts(),
  });

  // ── Channel Mutations ────────────────────────────────────────────

  const invalidateChannels = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-channels'] });
    queryClient.invalidateQueries({ queryKey: ['pms-channel'] });
    queryClient.invalidateQueries({ queryKey: ['pms-channel-sync-log'] });
  };

  const invalidateBookingEngine = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-booking-engine-config'] });
  };

  const createChannel = useMutation({
    mutationFn: (input: {
      propertyId: string;
      channelCode: string;
      displayName: string;
      apiCredentialsJson?: Record<string, unknown>;
      mappingJson?: Record<string, unknown>;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: { id: string } }>('/api/v1/pms/channels', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateChannels(),
  });

  const updateChannel = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      displayName?: string;
      apiCredentialsJson?: Record<string, unknown>;
      mappingJson?: Record<string, unknown>;
      isActive?: boolean;
    }) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/pms/channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateChannels(),
  });

  const syncChannel = useMutation({
    mutationFn: ({ channelId, entityType }: {
      channelId: string;
      entityType: string;
    }) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/pms/channels/${channelId}/sync`, {
        method: 'POST',
        body: JSON.stringify({ entityType }),
      }).then((r) => r.data),
    onSuccess: () => invalidateChannels(),
  });

  const updateBookingEngineConfig = useMutation({
    mutationFn: (input: {
      propertyId: string;
      isActive?: boolean;
      widgetThemeJson?: Record<string, unknown>;
      allowedRatePlanIds?: string[];
      minLeadTimeHours?: number;
      maxAdvanceDays?: number;
      termsUrl?: string | null;
      privacyUrl?: string | null;
      confirmationTemplateId?: string | null;
    }) =>
      apiFetch<{ data: { id: string } }>('/api/v1/pms/booking-engine', {
        method: 'PUT',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateBookingEngine(),
  });

  // ── Auto Room Assignment ──────────────────────────────────────
  const invalidateAssignment = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-room-assignment-preferences'] });
    queryClient.invalidateQueries({ queryKey: ['pms-room-suggestions'] });
  };

  const updateRoomAssignmentPreferences = useMutation({
    mutationFn: (input: {
      propertyId: string;
      preferences: Array<{
        name: string;
        weight: number;
        isActive?: boolean;
      }>;
    }) =>
      apiFetch<{ data: { propertyId: string; count: number } }>('/api/v1/pms/room-assignment-preferences', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => invalidateAssignment(),
  });

  const runAutoAssignment = useMutation({
    mutationFn: (input: {
      propertyId: string;
      targetDate: string;
      reservationIds?: string[];
    }) =>
      apiFetch<{ data: Array<{ reservationId: string; roomId: string; roomNumber: string; score: number; reasons: string[] }> }>('/api/v1/pms/rooms/auto-assign', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidateAssignment();
      queryClient.invalidateQueries({ queryKey: ['pms-reservations'] });
    },
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
    // Restrictions
    setRestrictions,
    clearRestrictions,
    // Payment Methods
    savePaymentMethod,
    removePaymentMethod,
    // Payments
    authorizeDeposit,
    captureDeposit,
    chargeCard,
    refundPayment,
    // Deposit Policies
    createDepositPolicy,
    updateDepositPolicy,
    // Cancellation Policies
    createCancellationPolicy,
    updateCancellationPolicy,
    // Message Templates
    createMessageTemplate,
    updateMessageTemplate,
    // Messages
    sendReservationMessage,
    logCommunication,
    // Housekeepers
    createHousekeeper,
    updateHousekeeper,
    // Housekeeping Assignments
    assignHousekeeping,
    startCleaning,
    completeCleaning,
    skipCleaning,
    // Work Orders
    createWorkOrder,
    updateWorkOrder,
    completeWorkOrder,
    addWorkOrderComment,
    // Rate Packages
    createRatePackage,
    updateRatePackage,
    deactivateRatePackage,
    // Pricing Rules
    createPricingRule,
    updatePricingRule,
    deactivatePricingRule,
    runPricingEngine,
    // Groups
    createGroup,
    updateGroup,
    setGroupBlocks,
    pickUpGroupRoom,
    releaseGroupBlocks,
    // Corporate Accounts
    createCorporateAccount,
    updateCorporateAccount,
    deactivateCorporateAccount,
    setCorporateRateOverrides,
    // Channels
    createChannel,
    updateChannel,
    syncChannel,
    // Booking Engine
    updateBookingEngineConfig,
    // Auto Room Assignment
    updateRoomAssignmentPreferences,
    runAutoAssignment,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Message Templates & Communication Log
// ═══════════════════════════════════════════════════════════════════

export interface PMSMessageTemplate {
  id: string;
  propertyId: string;
  templateKey: string;
  channel: string;
  subject: string | null;
  bodyTemplate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMSMessageLogEntry {
  id: string;
  propertyId: string;
  reservationId: string | null;
  guestId: string | null;
  channel: string;
  direction: string;
  messageType: string;
  subject: string | null;
  body: string;
  recipient: string | null;
  status: string;
  sentAt: string | null;
  externalId: string | null;
  createdAt: string;
  createdBy: string | null;
}

export function useMessageTemplates(propertyId: string | null) {
  const result = useQuery({
    queryKey: ['pms-message-templates', propertyId],
    queryFn: () => {
      const qs = buildQueryString({ propertyId });
      return apiFetch<{ data: PMSMessageTemplate[] }>(
        `/api/v1/pms/message-templates${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useMessageLog(filters: {
  propertyId: string | null;
  reservationId?: string;
  guestId?: string;
  channel?: string;
}) {
  const qs = buildQueryString(filters);
  const result = useQuery({
    queryKey: ['pms-message-log', filters.propertyId, filters.reservationId, filters.guestId, filters.channel],
    queryFn: () =>
      apiFetch<{ data: PMSMessageLogEntry[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/pms/messages${qs}`,
      ).then((r) => ({ items: r.data, cursor: r.meta.cursor, hasMore: r.meta.hasMore })),
    enabled: !!filters.propertyId,
    staleTime: 30_000,
  });

  return {
    data: result.data?.items ?? [],
    cursor: result.data?.cursor ?? null,
    hasMore: result.data?.hasMore ?? false,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Rate Restrictions Query Hook
// ═══════════════════════════════════════════════════════════════════

export interface RateRestriction {
  id: string;
  propertyId: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
  restrictionDate: string;
  minStay: number | null;
  maxStay: number | null;
  cta: boolean;
  ctd: boolean;
  stopSell: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useRateRestrictions(
  propertyId: string | null,
  startDate: string | null,
  endDate: string | null,
  roomTypeId?: string,
  ratePlanId?: string,
) {
  const qs = buildQueryString({ propertyId, startDate, endDate, roomTypeId, ratePlanId });
  const result = useQuery({
    queryKey: ['pms-restrictions', propertyId, startDate, endDate, roomTypeId, ratePlanId],
    queryFn: () =>
      apiFetch<{ data: RateRestriction[] }>(`/api/v1/pms/restrictions${qs}`).then((r) => r.data),
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
// PMS Report Types
// ═══════════════════════════════════════════════════════════════════

export interface OccupancyForecastDay {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPct: number;
  arrivals: number;
  departures: number;
}

export interface RevenueByRoomTypeRow {
  roomTypeId: string;
  roomTypeName: string;
  roomsSold: number;
  roomRevenueCents: number;
  taxRevenueCents: number;
  adrCents: number;
}

export interface PickupReportRow {
  targetDate: string;
  roomsBookedSinceSnapshot: number;
  totalRoomsBooked: number;
}

export interface PMSManagerFlashReport {
  businessDate: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPct: number;
  adrCents: number;
  revParCents: number;
  arrivals: number;
  departures: number;
  stayovers: number;
  outOfOrder: number;
  totalRevenueCents: number;
}

export interface NoShowReportRow {
  reservationId: string;
  confirmationNumber: string | null;
  guestName: string;
  roomTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  nightCount: number;
  estimatedRevenueCents: number;
}

export interface HousekeepingProductivityRow {
  housekeeperId: string;
  totalRoomsCleaned: number;
  totalMinutes: number;
  avgMinutesPerRoom: number;
}

// ═══════════════════════════════════════════════════════════════════
// PMS Report Query Hooks
// ═══════════════════════════════════════════════════════════════════

export function useOccupancyForecast(
  propertyId: string | null,
  startDate: string | null,
  endDate: string | null,
) {
  const qs = buildQueryString({ propertyId, startDate, endDate });
  const result = useQuery({
    queryKey: ['pms-occupancy-forecast', propertyId, startDate, endDate],
    queryFn: () =>
      apiFetch<{ data: OccupancyForecastDay[] }>(`/api/v1/pms/reports/occupancy-forecast${qs}`).then((r) => r.data),
    enabled: !!propertyId && !!startDate && !!endDate,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useRevenueByRoomType(
  propertyId: string | null,
  startDate: string | null,
  endDate: string | null,
) {
  const qs = buildQueryString({ propertyId, startDate, endDate });
  const result = useQuery({
    queryKey: ['pms-revenue-by-room-type', propertyId, startDate, endDate],
    queryFn: () =>
      apiFetch<{ data: RevenueByRoomTypeRow[] }>(`/api/v1/pms/reports/revenue-by-room-type${qs}`).then((r) => r.data),
    enabled: !!propertyId && !!startDate && !!endDate,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function usePickupReport(
  propertyId: string | null,
  snapshotDate: string | null,
  startDate: string | null,
  endDate: string | null,
) {
  const qs = buildQueryString({ propertyId, snapshotDate, startDate, endDate });
  const result = useQuery({
    queryKey: ['pms-pickup-report', propertyId, snapshotDate, startDate, endDate],
    queryFn: () =>
      apiFetch<{ data: PickupReportRow[] }>(`/api/v1/pms/reports/pickup${qs}`).then((r) => r.data),
    enabled: !!propertyId && !!snapshotDate && !!startDate && !!endDate,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useManagerFlashReport(
  propertyId: string | null,
  businessDate: string | null,
) {
  const qs = buildQueryString({ propertyId, businessDate });
  const result = useQuery({
    queryKey: ['pms-manager-flash', propertyId, businessDate],
    queryFn: () =>
      apiFetch<{ data: PMSManagerFlashReport }>(`/api/v1/pms/reports/manager-flash${qs}`).then((r) => r.data),
    enabled: !!propertyId && !!businessDate,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useNoShowReport(
  propertyId: string | null,
  startDate: string | null,
  endDate: string | null,
) {
  const qs = buildQueryString({ propertyId, startDate, endDate });
  const result = useQuery({
    queryKey: ['pms-no-show-report', propertyId, startDate, endDate],
    queryFn: () =>
      apiFetch<{ data: { items: NoShowReportRow[]; totalNoShows: number; totalLostRevenueCents: number } }>(
        `/api/v1/pms/reports/no-show${qs}`,
      ).then((r) => r.data),
    enabled: !!propertyId && !!startDate && !!endDate,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? { items: [], totalNoShows: 0, totalLostRevenueCents: 0 },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useHousekeepingProductivity(
  propertyId: string | null,
  startDate: string | null,
  endDate: string | null,
) {
  const qs = buildQueryString({ propertyId, startDate, endDate });
  const result = useQuery({
    queryKey: ['pms-hk-productivity', propertyId, startDate, endDate],
    queryFn: () =>
      apiFetch<{ data: HousekeepingProductivityRow[] }>(
        `/api/v1/pms/reports/housekeeping-productivity${qs}`,
      ).then((r) => r.data),
    enabled: !!propertyId && !!startDate && !!endDate,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Housekeeping Assignments & Maintenance Work Orders
// ═══════════════════════════════════════════════════════════════════

export interface PMSHousekeeper {
  id: string;
  tenantId: string;
  propertyId: string;
  userId: string | null;
  name: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMSHousekeepingAssignment {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId: string;
  housekeeperId: string;
  businessDate: string;
  priority: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  roomNumber: string | null;
  roomTypeName: string | null;
  housekeeperName: string | null;
}

export interface PMSHousekeeperWorkload {
  housekeeperId: string;
  housekeeperName: string;
  pending: number;
  inProgress: number;
  completed: number;
  skipped: number;
  avgMinutes: number;
}

export interface PMSWorkOrderComment {
  id: string;
  workOrderId: string;
  comment: string;
  createdAt: string;
  createdBy: string | null;
}

export interface PMSWorkOrder {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  reportedBy: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  partsCostCents: number | null;
  completedAt: string | null;
  resolutionNotes: string | null;
  dueDate: string | null;
  roomNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PMSWorkOrderDetail extends PMSWorkOrder {
  comments: PMSWorkOrderComment[];
}

export interface WorkOrderFilters {
  status?: string;
  roomId?: string;
  category?: string;
  priority?: string;
  cursor?: string;
  limit?: number;
}

// ── useHousekeepers ───────────────────────────────────────────────

export function useHousekeepers(propertyId: string | null) {
  const result = useQuery({
    queryKey: ['pms-housekeepers', propertyId],
    queryFn: () => {
      const qs = buildQueryString({ propertyId });
      return apiFetch<{ data: PMSHousekeeper[] }>(
        `/api/v1/pms/housekeepers${qs}`,
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

// ── useHousekeepingAssignments ───────────────────────────────────

export function useHousekeepingAssignments(
  propertyId: string | null,
  date: string | null,
  housekeeperId?: string,
) {
  const result = useQuery({
    queryKey: ['pms-hk-assignments', propertyId, date, housekeeperId],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, date, housekeeperId });
      return apiFetch<{ data: PMSHousekeepingAssignment[] }>(
        `/api/v1/pms/housekeeping/assignments${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId && !!date,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useHousekeeperWorkload ──────────────────────────────────────

export function useHousekeeperWorkload(
  propertyId: string | null,
  date: string | null,
) {
  const result = useQuery({
    queryKey: ['pms-hk-workload', propertyId, date],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, date });
      return apiFetch<{ data: PMSHousekeeperWorkload[] }>(
        `/api/v1/pms/housekeeping/workload${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!propertyId && !!date,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useWorkOrders ───────────────────────────────────────────────

export function useWorkOrders(
  propertyId: string | null,
  filters: WorkOrderFilters = {},
) {
  const result = useQuery({
    queryKey: ['pms-work-orders', propertyId, filters],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, ...filters });
      return apiFetch<{
        data: PMSWorkOrder[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/work-orders${qs}`);
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

// ── useWorkOrder ────────────────────────────────────────────────

export function useWorkOrder(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-work-order', id],
    queryFn: () =>
      apiFetch<{ data: PMSWorkOrderDetail }>(
        `/api/v1/pms/work-orders/${id}`,
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

// ═══════════════════════════════════════════════════════════════════
// Rate Packages
// ═══════════════════════════════════════════════════════════════════

export interface PMSRatePackageInclude {
  itemCode: string;
  description: string;
  amountCents: number;
  entryType: string;
  frequency: string;
}

export interface PMSRatePackage {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  includesJson: PMSRatePackageInclude[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── useRatePackages ─────────────────────────────────────────────

export function useRatePackages(propertyId: string | null, activeOnly = true) {
  const result = useQuery({
    queryKey: ['pms-rate-packages', propertyId, activeOnly],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, activeOnly: String(activeOnly) });
      return apiFetch<{
        data: PMSRatePackage[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/rate-packages${qs}`);
    },
    enabled: !!propertyId,
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useRatePackage ──────────────────────────────────────────────

export function useRatePackage(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-rate-package', id],
    queryFn: () =>
      apiFetch<{ data: PMSRatePackage }>(`/api/v1/pms/rate-packages/${id}`).then(
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

// ═══════════════════════════════════════════════════════════════════
// Group Bookings
// ═══════════════════════════════════════════════════════════════════

export interface PMSGroupRoomBlock {
  id: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  blockDate: string;
  roomsBlocked: number;
  roomsPickedUp: number;
  released: boolean;
}

export interface PMSGroup {
  id: string;
  propertyId: string;
  name: string;
  groupType: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone?: string | null;
  corporateAccountId: string | null;
  corporateAccountName: string | null;
  ratePlanId?: string | null;
  ratePlanName?: string | null;
  negotiatedRateCents?: number | null;
  status: string;
  billingType: string;
  startDate: string;
  endDate: string;
  cutoffDate: string | null;
  totalRoomsBlocked: number;
  roomsPickedUp: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  roomBlocks?: PMSGroupRoomBlock[];
}

export interface GroupFilters {
  status?: string;
  cursor?: string;
  limit?: number;
}

// ── useGroups ───────────────────────────────────────────────────

export function useGroups(propertyId: string | null, filters: GroupFilters = {}) {
  const result = useQuery({
    queryKey: ['pms-groups', propertyId, filters],
    queryFn: () => {
      const qs = buildQueryString({ propertyId, ...filters });
      return apiFetch<{
        data: PMSGroup[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/groups${qs}`);
    },
    enabled: !!propertyId,
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useGroup ────────────────────────────────────────────────────

export function useGroup(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-group', id],
    queryFn: () =>
      apiFetch<{ data: PMSGroup }>(`/api/v1/pms/groups/${id}`).then(
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

// ═══════════════════════════════════════════════════════════════════
// Corporate Accounts
// ═══════════════════════════════════════════════════════════════════

export interface PMSCorporateRateOverride {
  id: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  negotiatedRateCents: number;
  startDate: string | null;
  endDate: string | null;
}

export interface PMSCorporateAccount {
  id: string;
  propertyId: string | null;
  companyName: string;
  taxId?: string | null;
  billingAddressJson?: Record<string, unknown> | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone?: string | null;
  defaultRatePlanId?: string | null;
  defaultRatePlanName?: string | null;
  negotiatedDiscountPct: number | null;
  billingType: string;
  paymentTermsDays?: number | null;
  creditLimitCents: number | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  rateOverrides?: PMSCorporateRateOverride[];
}

export interface CorporateAccountFilters {
  propertyId?: string;
  search?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

// ── useCorporateAccounts ────────────────────────────────────────

export function useCorporateAccounts(filters: CorporateAccountFilters = {}) {
  const result = useQuery({
    queryKey: ['pms-corporate-accounts', filters],
    queryFn: () => {
      const qs = buildQueryString({
        ...filters,
        isActive: filters.isActive != null ? String(filters.isActive) : undefined,
      });
      return apiFetch<{
        data: PMSCorporateAccount[];
        meta?: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/pms/corporate-accounts${qs}`);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data?.data ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useCorporateAccount ─────────────────────────────────────────

export function useCorporateAccount(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-corporate-account', id],
    queryFn: () =>
      apiFetch<{ data: PMSCorporateAccount }>(`/api/v1/pms/corporate-accounts/${id}`).then(
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

// ═══════════════════════════════════════════════════════════════════
// Calendar Month View
// ═══════════════════════════════════════════════════════════════════

export interface PMSMonthDay {
  date: string;
  totalRooms: number;
  roomsOccupied: number;
  roomsAvailable: number;
  roomsOoo: number;
  occupancyPct: number;
  arrivals: number;
  departures: number;
  adrCents: number;
  revparCents: number;
}

export function useCalendarMonth(
  propertyId: string | null,
  year: number | null,
  month: number | null,
) {
  const qs = buildQueryString({ propertyId, year: year != null ? String(year) : undefined, month: month != null ? String(month) : undefined });
  const result = useQuery({
    queryKey: ['pms-calendar-month', propertyId, year, month],
    queryFn: () =>
      apiFetch<{ data: { year: number; month: number; days: PMSMonthDay[] } }>(
        `/api/v1/pms/calendar/month${qs}`,
      ).then((r) => r.data),
    enabled: !!propertyId && year != null && month != null,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Pricing Rules (Yield/Revenue Management)
// ═══════════════════════════════════════════════════════════════════

export interface PMSPricingRule {
  id: string;
  propertyId: string;
  name: string;
  ruleType: string;
  isActive: boolean;
  priority: number;
  conditionsJson: Record<string, unknown>;
  adjustmentsJson: Record<string, unknown>;
  floorCents: number | null;
  ceilingCents: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
}

export interface PMSPricingLogEntry {
  id: string;
  propertyId: string;
  roomTypeId: string;
  businessDate: string;
  baseRateCents: number;
  adjustedRateCents: number;
  rulesAppliedJson: Array<{ ruleId: string; ruleName: string; adjustment: number }>;
  createdAt: string;
}

export interface PMSPricingPreviewDay {
  businessDate: string;
  roomTypeId: string;
  roomTypeName: string;
  baseCents: number;
  adjustedCents: number;
  rulesApplied: Array<{ ruleId: string; ruleName: string; adjustment: number }>;
}

export function usePricingRules(propertyId: string | null, opts?: { isActive?: boolean }) {
  const qs = buildQueryString({
    propertyId,
    isActive: opts?.isActive !== undefined ? String(opts.isActive) : undefined,
  });
  const result = useQuery({
    queryKey: ['pms-pricing-rules', propertyId, opts?.isActive],
    queryFn: () =>
      apiFetch<{ data: PMSPricingRule[] }>(
        `/api/v1/pms/pricing-rules${qs}`,
      ).then((r) => r.data),
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function usePricingRule(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-pricing-rule', id],
    queryFn: () =>
      apiFetch<{ data: PMSPricingRule }>(
        `/api/v1/pms/pricing-rules/${id}`,
      ).then((r) => r.data),
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

export function usePricingLog(
  propertyId: string | null,
  startDate: string | null,
  endDate: string | null,
  roomTypeId?: string,
) {
  const qs = buildQueryString({ propertyId, startDate, endDate, roomTypeId });
  const result = useQuery({
    queryKey: ['pms-pricing-log', propertyId, startDate, endDate, roomTypeId],
    queryFn: () =>
      apiFetch<{ data: PMSPricingLogEntry[] }>(
        `/api/v1/pms/pricing-rules/log${qs}`,
      ).then((r) => r.data),
    enabled: !!propertyId && !!startDate && !!endDate,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function usePricingPreview(
  propertyId: string | null,
  startDate: string | null,
  endDate: string | null,
  roomTypeId?: string,
) {
  const qs = buildQueryString({ propertyId, startDate, endDate, roomTypeId });
  const result = useQuery({
    queryKey: ['pms-pricing-preview', propertyId, startDate, endDate, roomTypeId],
    queryFn: () =>
      apiFetch<{ data: PMSPricingPreviewDay[] }>(
        `/api/v1/pms/pricing-rules/preview${qs}`,
      ).then((r) => r.data),
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
// Channels (Channel Manager)
// ═══════════════════════════════════════════════════════════════════

export interface PMSChannel {
  id: string;
  propertyId: string;
  channelCode: string;
  displayName: string;
  apiCredentialsJson: Record<string, unknown>;
  mappingJson: Record<string, unknown>;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface PMSChannelSyncLogEntry {
  id: string;
  channelId: string;
  direction: string;
  entityType: string;
  status: string;
  recordsSynced: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function useChannels(propertyId: string | null) {
  const qs = buildQueryString({ propertyId });
  const result = useQuery({
    queryKey: ['pms-channels', propertyId],
    queryFn: () =>
      apiFetch<{ data: PMSChannel[] }>(
        `/api/v1/pms/channels${qs}`,
      ).then((r) => r.data),
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

export function useChannel(id: string | null) {
  const result = useQuery({
    queryKey: ['pms-channel', id],
    queryFn: () =>
      apiFetch<{ data: PMSChannel }>(
        `/api/v1/pms/channels/${id}`,
      ).then((r) => r.data),
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

export function useChannelSyncLog(channelId: string | null, limit?: number) {
  const qs = buildQueryString({ limit: limit != null ? String(limit) : undefined });
  const result = useQuery({
    queryKey: ['pms-channel-sync-log', channelId, limit],
    queryFn: () =>
      apiFetch<{ data: PMSChannelSyncLogEntry[] }>(
        `/api/v1/pms/channels/${channelId}/sync-log${qs}`,
      ).then((r) => r.data),
    enabled: !!channelId,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Booking Engine
// ═══════════════════════════════════════════════════════════════════

export interface PMSBookingEngineConfig {
  id: string;
  propertyId: string;
  isActive: boolean;
  widgetThemeJson: Record<string, unknown>;
  allowedRatePlanIds: string[];
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  termsUrl: string | null;
  privacyUrl: string | null;
  confirmationTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useBookingEngineConfig(propertyId: string | null) {
  const qs = buildQueryString({ propertyId });
  const result = useQuery({
    queryKey: ['pms-booking-engine-config', propertyId],
    queryFn: () =>
      apiFetch<{ data: PMSBookingEngineConfig | null }>(
        `/api/v1/pms/booking-engine${qs}`,
      ).then((r) => r.data),
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Auto Room Assignment
// ═══════════════════════════════════════════════════════════════════

export interface PMSRoomAssignmentPreference {
  id: string;
  propertyId: string;
  name: string;
  weight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMSRoomSuggestion {
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  floor: string | null;
  viewType: string | null;
  wing: string | null;
  score: number;
  reasons: string[];
}

export function useRoomAssignmentPreferences(propertyId: string | null) {
  const qs = buildQueryString({ propertyId });
  const result = useQuery({
    queryKey: ['pms-room-assignment-preferences', propertyId],
    queryFn: () =>
      apiFetch<{ data: PMSRoomAssignmentPreference[] }>(
        `/api/v1/pms/room-assignment-preferences${qs}`,
      ).then((r) => r.data),
    enabled: !!propertyId,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useRoomSuggestions(reservationId: string | null) {
  const result = useQuery({
    queryKey: ['pms-room-suggestions', reservationId],
    queryFn: () =>
      apiFetch<{ data: PMSRoomSuggestion[] }>(
        `/api/v1/pms/reservations/${reservationId}/room-suggestions`,
      ).then((r) => r.data),
    enabled: !!reservationId,
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
// Guest Self-Service Portal
// ═══════════════════════════════════════════════════════════════════

export interface PMSGuestPortalSession {
  id: string;
  tenantId: string;
  reservationId: string;
  token: string;
  status: string;
  expiresAt: string;
  preCheckinCompleted: boolean;
  roomPreferenceJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Enriched from reservation
  guestName?: string;
  propertyName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  roomTypeName?: string;
  roomNumber?: string | null;
}

export interface PMSGuestPortalFolio {
  folioId: string;
  reservationId: string;
  status: string;
  entries: PMSGuestPortalFolioEntry[];
  totalChargeCents: number;
  totalPaymentCents: number;
  balanceCents: number;
}

export interface PMSGuestPortalFolioEntry {
  id: string;
  entryType: string;
  description: string | null;
  amountCents: number;
  createdAt: string;
}

export function useGuestPortalSession(token: string | null) {
  const result = useQuery({
    queryKey: ['pms-guest-portal-session', token],
    queryFn: () =>
      apiFetch<{ data: PMSGuestPortalSession }>(
        `/api/v1/public/guest-portal/${token}/reservation`,
      ).then((r) => r.data),
    enabled: !!token,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useGuestPortalFolio(token: string | null) {
  const result = useQuery({
    queryKey: ['pms-guest-portal-folio', token],
    queryFn: () =>
      apiFetch<{ data: PMSGuestPortalFolio }>(
        `/api/v1/public/guest-portal/${token}/folio`,
      ).then((r) => r.data),
    enabled: !!token,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useGuestPortalMutations() {
  const queryClient = useQueryClient();

  const createSession = useMutation({
    mutationFn: (input: { reservationId: string; expiresInHours?: number }) =>
      apiFetch<{ data: PMSGuestPortalSession }>(
        '/api/v1/pms/guest-portal-sessions',
        { method: 'POST', body: JSON.stringify(input) },
      ).then((r) => r.data),
  });

  const completePreCheckin = useMutation({
    mutationFn: ({
      token,
      ...input
    }: {
      token: string;
      guestDetails?: {
        email?: string;
        phone?: string;
        addressJson?: Record<string, unknown>;
      };
      roomPreference?: Record<string, unknown>;
    }) =>
      apiFetch<{ data: unknown }>(
        `/api/v1/public/guest-portal/${token}/pre-checkin`,
        { method: 'POST', body: JSON.stringify(input) },
      ).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pms-guest-portal-session'] });
    },
  });

  return { createSession, completePreCheckin };
}

// ═══════════════════════════════════════════════════════════════════
// Loyalty / Points
// ═══════════════════════════════════════════════════════════════════

export interface PMSLoyaltyProgram {
  id: string;
  tenantId: string;
  name: string;
  pointsPerDollar: number;
  pointsPerNight: number;
  redemptionValueCents: number;
  tiersJson: { name: string; minPoints: number; multiplier: number; perks: string[] }[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PMSLoyaltyMember {
  id: string;
  tenantId: string;
  guestId: string;
  programId: string;
  pointsBalance: number;
  lifetimePoints: number;
  currentTier: string | null;
  enrolledAt: string;
  // Enriched
  guestName?: string;
  programName?: string;
}

export interface PMSLoyaltyTransaction {
  id: string;
  tenantId: string;
  memberId: string;
  transactionType: string;
  points: number;
  balanceAfter: number;
  reservationId: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
}

export function useLoyaltyPrograms() {
  const result = useQuery({
    queryKey: ['pms-loyalty-programs'],
    queryFn: () =>
      apiFetch<{ data: PMSLoyaltyProgram[] }>(
        '/api/v1/pms/loyalty/programs',
      ).then((r) => r.data),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useLoyaltyMember(guestId: string | null) {
  const qs = buildQueryString({ guestId });
  const result = useQuery({
    queryKey: ['pms-loyalty-member', guestId],
    queryFn: () =>
      apiFetch<{ data: PMSLoyaltyMember | null }>(
        `/api/v1/pms/loyalty/members${qs}`,
      ).then((r) => r.data),
    enabled: !!guestId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useLoyaltyTransactions(memberId: string | null) {
  const result = useQuery({
    queryKey: ['pms-loyalty-transactions', memberId],
    queryFn: () =>
      apiFetch<{ data: PMSLoyaltyTransaction[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/pms/loyalty/members/${memberId}/transactions`,
      ).then((r) => ({ items: r.data, cursor: r.meta.cursor, hasMore: r.meta.hasMore })),
    enabled: !!memberId,
    staleTime: 30_000,
  });

  return {
    data: result.data?.items ?? [],
    cursor: result.data?.cursor ?? null,
    hasMore: result.data?.hasMore ?? false,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

export function useLoyaltyMutations() {
  const queryClient = useQueryClient();

  const invalidateLoyalty = () => {
    queryClient.invalidateQueries({ queryKey: ['pms-loyalty-programs'] });
    queryClient.invalidateQueries({ queryKey: ['pms-loyalty-member'] });
    queryClient.invalidateQueries({ queryKey: ['pms-loyalty-transactions'] });
  };

  const createProgram = useMutation({
    mutationFn: (input: {
      name: string;
      pointsPerDollar?: number;
      pointsPerNight?: number;
      redemptionValueCents?: number;
      tiersJson?: { name: string; minPoints: number; multiplier: number; perks: string[] }[];
    }) =>
      apiFetch<{ data: PMSLoyaltyProgram }>(
        '/api/v1/pms/loyalty/programs',
        { method: 'POST', body: JSON.stringify(input) },
      ).then((r) => r.data),
    onSuccess: () => invalidateLoyalty(),
  });

  const updateProgram = useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      name?: string;
      pointsPerDollar?: number;
      pointsPerNight?: number;
      redemptionValueCents?: number;
      tiersJson?: { name: string; minPoints: number; multiplier: number; perks: string[] }[];
      isActive?: boolean;
    }) =>
      apiFetch<{ data: PMSLoyaltyProgram }>(
        `/api/v1/pms/loyalty/programs/${id}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      ).then((r) => r.data),
    onSuccess: () => invalidateLoyalty(),
  });

  const enrollGuest = useMutation({
    mutationFn: (input: { guestId: string; programId: string }) =>
      apiFetch<{ data: PMSLoyaltyMember }>(
        '/api/v1/pms/loyalty/members/enroll',
        { method: 'POST', body: JSON.stringify(input) },
      ).then((r) => r.data),
    onSuccess: () => invalidateLoyalty(),
  });

  const earnPoints = useMutation({
    mutationFn: (input: {
      memberId: string;
      points: number;
      reservationId?: string;
      description?: string;
    }) =>
      apiFetch<{ data: PMSLoyaltyTransaction }>(
        `/api/v1/pms/loyalty/members/${input.memberId}/earn`,
        { method: 'POST', body: JSON.stringify(input) },
      ).then((r) => r.data),
    onSuccess: () => invalidateLoyalty(),
  });

  const redeemPoints = useMutation({
    mutationFn: (input: {
      memberId: string;
      points: number;
      reservationId?: string;
      description?: string;
    }) =>
      apiFetch<{ data: unknown }>(
        `/api/v1/pms/loyalty/members/${input.memberId}/redeem`,
        { method: 'POST', body: JSON.stringify(input) },
      ).then((r) => r.data),
    onSuccess: () => invalidateLoyalty(),
  });

  const adjustPoints = useMutation({
    mutationFn: (input: { memberId: string; points: number; reason: string }) =>
      apiFetch<{ data: PMSLoyaltyTransaction }>(
        `/api/v1/pms/loyalty/members/${input.memberId}/adjust`,
        { method: 'POST', body: JSON.stringify(input) },
      ).then((r) => r.data),
    onSuccess: () => invalidateLoyalty(),
  });

  return { createProgram, updateProgram, enrollGuest, earnPoints, redeemPoints, adjustPoints };
}
