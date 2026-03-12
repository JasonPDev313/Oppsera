'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ═══════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════

export interface SpaSettings {
  id: string;
  tenantId: string;
  locationId: string | null;
  timezone: string;
  dayCloseTime: string;
  defaultCurrency: string;
  taxInclusive: boolean;
  defaultBufferMinutes: number;
  defaultCleanupMinutes: number;
  defaultSetupMinutes: number;
  onlineBookingEnabled: boolean;
  waitlistEnabled: boolean;
  autoAssignProvider: boolean;
  rebookingWindowDays: number;
  notificationPreferences: Record<string, unknown> | null;
  depositRules: Record<string, unknown> | null;
  cancellationDefaults: Record<string, unknown> | null;
  enterpriseMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpaServiceCategory {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  serviceCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SpaService {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName?: string;
  durationMinutes: number;
  priceCents: number;
  isActive: boolean;
  requiresResource: boolean;
  resourceTypeRequired: string | null;
  maxCapacity: number;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpaProvider {
  id: string;
  tenantId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  specialties: string[];
  serviceIds: string[];
  isActive: boolean;
  scheduleJson: Record<string, { start: string; end: string }[]> | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpaResource {
  id: string;
  tenantId: string;
  locationId: string | null;
  name: string;
  type: string;
  description: string | null;
  isActive: boolean;
  capacityJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpaAppointmentListItem {
  id: string;
  appointmentNumber: string;
  customerId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  locationId: string | null;
  providerId: string | null;
  providerName: string | null;
  providerColor: string | null;
  resourceId: string | null;
  resourceName: string | null;
  startAt: string;
  endAt: string;
  status: string;
  bookingSource: string;
  notes: string | null;
  depositAmountCents: number;
  depositStatus: string;
  orderId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  services: Array<{
    id: string;
    serviceName: string;
    priceCents: number;
    finalPriceCents: number;
    status: string;
  }>;
}

export interface SpaAppointmentItemDetail {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  serviceDurationMinutes: number;
  addonId: string | null;
  providerId: string | null;
  providerName: string | null;
  providerColor: string | null;
  resourceId: string | null;
  resourceName: string | null;
  startAt: string;
  endAt: string;
  priceCents: number;
  memberPriceCents: number | null;
  finalPriceCents: number;
  discountAmountCents: number;
  discountReason: string | null;
  packageBalanceId: string | null;
  notes: string | null;
  status: string;
  sortOrder: number;
}

export interface SpaAppointmentDetail {
  id: string;
  appointmentNumber: string;
  customerId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  locationId: string | null;
  providerId: string | null;
  providerName: string | null;
  providerColor: string | null;
  providerPhotoUrl: string | null;
  resourceId: string | null;
  resourceName: string | null;
  resourceType: string | null;
  startAt: string;
  endAt: string;
  status: string;
  bookingSource: string;
  bookingChannel: string | null;
  notes: string | null;
  internalNotes: string | null;
  depositAmountCents: number;
  depositStatus: string;
  depositPaymentId: string | null;
  cancellationReason: string | null;
  canceledAt: string | null;
  canceledBy: string | null;
  noShowFeeCharged: boolean;
  checkedInAt: string | null;
  checkedInBy: string | null;
  serviceStartedAt: string | null;
  serviceCompletedAt: string | null;
  checkedOutAt: string | null;
  orderId: string | null;
  pmsFolioId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: SpaAppointmentItemDetail[];
}

export interface CalendarAppointment {
  id: string;
  providerId: string;
  serviceId: string;
  serviceName: string;
  customerName: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  orderId: string | null;
}

export interface CalendarProviderColumn {
  providerId: string;
  providerName: string;
  appointments: CalendarAppointment[];
}

export interface SpaCalendarResult {
  providers: CalendarProviderColumn[];
  unassigned: CalendarAppointment[];
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  providerId: string;
  providerName: string;
  resourceId: string | null;
}

export interface SpaDashboardUpcomingAppointment {
  id: string;
  appointmentNumber: string;
  guestName: string | null;
  providerId: string | null;
  providerName: string | null;
  serviceName: string | null;
  startAt: string;
  endAt: string;
  status: string;
}

export interface SpaDashboardMetrics {
  today: {
    totalAppointments: number;
    confirmed: number;
    checkedIn: number;
    inService: number;
    completed: number;
    canceled: number;
    noShow: number;
  };
  revenue: {
    totalRevenue: number;
    serviceRevenue: number;
    addonRevenue: number;
    retailRevenue: number;
    tipTotal: number;
  };
  providerUtilization: Array<{
    providerId: string;
    providerName: string;
    providerColor: string | null;
    appointmentCount: number;
    completedCount: number;
    utilizationPct: number;
    totalRevenue: number;
  }>;
  topServices: Array<{
    serviceId: string;
    serviceName: string;
    bookingCount: number;
    totalRevenue: number;
    completedCount: number;
  }>;
  kpis: {
    avgAppointmentDuration: number;
    utilizationPct: number;
    rebookingRate: number;
    noShowRate: number;
    walkInCount: number;
    onlineBookingCount: number;
  };
  upcomingAppointments: SpaDashboardUpcomingAppointment[];
}

// ═══════════════════════════════════════════════════════════════════
// Filter Interfaces
// ═══════════════════════════════════════════════════════════════════

export interface SpaServiceFilters {
  locationId?: string;
  categoryId?: string;
  status?: 'active' | 'archived' | 'all';
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface SpaProviderFilters {
  locationId?: string;
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface SpaResourceFilters {
  locationId?: string;
  type?: string;
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface SpaAppointmentFilters {
  status?: string;
  providerId?: string;
  customerId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface SpaCalendarParams {
  locationId?: string;
  startDate: string;
  endDate: string;
  providerIds?: string[];
}

export interface SpaAvailableSlotsParams {
  serviceId: string;
  providerId?: string;
  locationId?: string;
  date: string;
  durationMinutes?: number;
}

// ═══════════════════════════════════════════════════════════════════
// Pagination Meta
// ═══════════════════════════════════════════════════════════════════

interface CursorMeta {
  cursor: string | null;
  hasMore: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Query Hooks
// ═══════════════════════════════════════════════════════════════════

// ── useSpaSettings ──────────────────────────────────────────────

export function useSpaSettings(params: { locationId?: string } = {}) {
  const headers = params.locationId ? { 'X-Location-Id': params.locationId } : undefined;
  const result = useQuery({
    queryKey: ['spa-settings', params.locationId],
    queryFn: () =>
      apiFetch<{ data: SpaSettings }>('/api/v1/spa/settings', headers ? { headers } : undefined).then(
        (r) => r.data,
      ),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaServices ──────────────────────────────────────────────

export function useSpaServices(filters: SpaServiceFilters = {}) {
  const result = useQuery({
    queryKey: ['spa-services', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: SpaService[]; meta: CursorMeta }>(
        `/api/v1/spa/services${qs}`,
      ).then((r) => ({ items: r.data, meta: r.meta }));
    },
    staleTime: 60_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaService ───────────────────────────────────────────────

export function useSpaService(id: string | null) {
  const result = useQuery({
    queryKey: ['spa-service', id],
    queryFn: () =>
      apiFetch<{ data: SpaService }>(`/api/v1/spa/services/${id}`).then(
        (r) => r.data,
      ),
    enabled: !!id,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaServiceCategories ─────────────────────────────────────

export function useSpaServiceCategories() {
  const result = useQuery({
    queryKey: ['spa-service-categories'],
    queryFn: () =>
      apiFetch<{ data: SpaServiceCategory[] }>(
        '/api/v1/spa/services/categories',
      ).then((r) => r.data),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaProviders ─────────────────────────────────────────────

export function useSpaProviders(filters: SpaProviderFilters = {}) {
  const result = useQuery({
    queryKey: ['spa-providers', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: SpaProvider[]; meta: CursorMeta }>(
        `/api/v1/spa/providers${qs}`,
      ).then((r) => ({ items: r.data, meta: r.meta }));
    },
    staleTime: 60_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaProvider ──────────────────────────────────────────────

export function useSpaProvider(id: string | null) {
  const result = useQuery({
    queryKey: ['spa-provider', id],
    queryFn: () =>
      apiFetch<{ data: SpaProvider }>(`/api/v1/spa/providers/${id}`).then(
        (r) => r.data,
      ),
    enabled: !!id,
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaResources ─────────────────────────────────────────────

export function useSpaResources(filters: SpaResourceFilters = {}) {
  const result = useQuery({
    queryKey: ['spa-resources', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: SpaResource[]; meta: CursorMeta }>(
        `/api/v1/spa/resources${qs}`,
      ).then((r) => ({ items: r.data, meta: r.meta }));
    },
    staleTime: 60_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaAppointments ──────────────────────────────────────────

export function useSpaAppointments(filters: SpaAppointmentFilters = {}) {
  const result = useQuery({
    queryKey: ['spa-appointments', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{ data: SpaAppointmentListItem[]; meta: CursorMeta }>(
        `/api/v1/spa/appointments${qs}`,
      ).then((r) => ({ items: r.data, meta: r.meta }));
    },
    staleTime: 30_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaAppointment ───────────────────────────────────────────

export function useSpaAppointment(id: string | null) {
  const result = useQuery({
    queryKey: ['spa-appointment', id],
    queryFn: () =>
      apiFetch<{ data: SpaAppointmentDetail }>(
        `/api/v1/spa/appointments/${id}`,
      ).then((r) => r.data),
    enabled: !!id,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaCalendar ──────────────────────────────────────────────

export function useSpaCalendar(params: SpaCalendarParams | null) {
  // Exclude providerIds from query key — provider filtering is done client-side
  const queryParams = params
    ? { locationId: params.locationId, startDate: params.startDate, endDate: params.endDate }
    : null;

  const result = useQuery({
    queryKey: ['spa-calendar', queryParams],
    queryFn: ({ signal }) => {
      const qs = buildQueryString({
        locationId: params!.locationId,
        startDate: params!.startDate,
        endDate: params!.endDate,
      });
      return apiFetch<{ data: SpaCalendarResult }>(
        `/api/v1/spa/appointments/calendar${qs}`,
        { signal },
      ).then((r) => r.data);
    },
    enabled: !!params?.startDate && !!params?.endDate,
    staleTime: 30_000,
    // Pause polling when tab is hidden to reduce DB connection pressure.
    // React Query calls this function on each interval tick; returning false skips the refetch.
    refetchInterval: () => (document.hidden ? false : 30_000),
    refetchOnWindowFocus: true,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaAvailabilitySummary ────────────────────────────────────

export interface SpaAvailabilitySummaryParams {
  locationId?: string;
  startDate: string;
  endDate: string;
  categoryId?: string;
}

export interface DaySlotSummary {
  date: string;
  totalMinutes: number;
  bookedMinutes: number;
  availableMinutes: number;
  availableSlots: number;
  totalSlots: number;
  providerCount: number;
}

export interface AvailabilityCategorySummary {
  id: string;
  name: string;
  serviceCount: number;
}

export interface SpaAvailabilitySummaryResult {
  days: DaySlotSummary[];
  categories: AvailabilityCategorySummary[];
}

export function useSpaAvailabilitySummary(params: SpaAvailabilitySummaryParams | null) {
  const result = useQuery({
    queryKey: ['spa-availability-summary', params],
    queryFn: ({ signal }) => {
      const qs = buildQueryString({
        locationId: params!.locationId,
        startDate: params!.startDate,
        endDate: params!.endDate,
        categoryId: params!.categoryId,
      });
      return apiFetch<{ data: SpaAvailabilitySummaryResult }>(
        `/api/v1/spa/appointments/availability-summary${qs}`,
        { signal },
      ).then((r) => r.data);
    },
    enabled: !!params?.locationId && !!params?.startDate && !!params?.endDate,
    staleTime: 30_000,
    refetchInterval: () => (document.hidden ? false : 60_000),
    refetchOnWindowFocus: true,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaAvailableSlots ────────────────────────────────────────

export function useSpaAvailableSlots(params: SpaAvailableSlotsParams | null) {
  const result = useQuery({
    queryKey: ['spa-available-slots', params],
    queryFn: () => {
      const qs = buildQueryString({
        serviceId: params!.serviceId,
        providerId: params!.providerId,
        locationId: params!.locationId,
        date: params!.date,
        durationMinutes: params!.durationMinutes,
      });
      return apiFetch<{ data: AvailableSlot[] }>(
        `/api/v1/spa/appointments/available-slots${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!params?.serviceId && !!params?.locationId && !!params?.date,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaDashboard ─────────────────────────────────────────────

export function useSpaDashboard(locationId?: string, date?: string) {
  const result = useQuery({
    queryKey: ['spa-dashboard', locationId, date],
    queryFn: ({ signal }) => {
      const qs = buildQueryString({ locationId, date });
      return apiFetch<{ data: SpaDashboardMetrics }>(
        `/api/v1/spa/dashboard${qs}`,
        { signal },
      ).then((r) => r.data);
    },
    staleTime: 30_000,
    enabled: !!locationId && !!date,
    // Live ops dashboard — poll every 30s, pause when tab is hidden
    refetchInterval: () => (document.hidden ? false : 30_000),
    refetchOnWindowFocus: true,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Mutation Hooks
// ═══════════════════════════════════════════════════════════════════

// ── useCreateAppointment ────────────────────────────────────────

export interface CreateAppointmentItemInput {
  serviceId: string;
  addonId?: string;
  providerId?: string;
  resourceId?: string;
  startAt: string;
  endAt: string;
  priceCents: number;
  memberPriceCents?: number;
  finalPriceCents: number;
  discountAmountCents?: number;
  discountReason?: string;
  packageBalanceId?: string;
  notes?: string;
}

export interface CreateAppointmentInput {
  clientRequestId?: string;
  locationId: string;
  customerId?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  providerId?: string;
  resourceId?: string;
  startAt: string;
  endAt: string;
  bookingSource?: string;
  bookingChannel?: string;
  notes?: string;
  internalNotes?: string;
  items: CreateAppointmentItemInput[];
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAppointmentInput) =>
      apiFetch<{ data: SpaAppointmentListItem }>('/api/v1/spa/appointments', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['spa-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['spa-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['spa-available-slots'] });
    },
  });
}

// ── useUpdateAppointment ────────────────────────────────────────

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      id: string;
      providerId?: string;
      resourceId?: string | null;
      startTime?: string;
      durationMinutes?: number;
      notes?: string;
      internalNotes?: string;
      expectedVersion?: number;
    }) => {
      const { id, ...body } = input;
      return apiFetch<{ data: SpaAppointmentListItem }>(
        `/api/v1/spa/appointments/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      ).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['spa-appointment'] });
      queryClient.invalidateQueries({ queryKey: ['spa-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['spa-available-slots'] });
    },
  });
}

// ── useAppointmentAction ────────────────────────────────────────

export function useAppointmentAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      id: string;
      action: string;
      body?: Record<string, unknown>;
    }) =>
      apiFetch(`/api/v1/spa/appointments/${input.id}/${input.action}`, {
        method: 'POST',
        body: input.body ? JSON.stringify(input.body) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['spa-appointment'] });
      queryClient.invalidateQueries({ queryKey: ['spa-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['spa-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['spa-available-slots'] });
    },
  });
}

// ── useCreateService ────────────────────────────────────────────

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      categoryId?: string;
      durationMinutes: number;
      priceCents: number;
      requiresResource?: boolean;
      resourceTypeRequired?: string;
      maxCapacity?: number;
      sortOrder?: number;
    }) =>
      apiFetch<{ data: SpaService }>('/api/v1/spa/services', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-services'] });
      queryClient.invalidateQueries({ queryKey: ['spa-service-categories'] });
    },
  });
}

// ── useUpdateService ────────────────────────────────────────────

export function useUpdateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      id: string;
      name?: string;
      description?: string | null;
      categoryId?: string | null;
      durationMinutes?: number;
      priceCents?: number;
      requiresResource?: boolean;
      resourceTypeRequired?: string | null;
      maxCapacity?: number;
      sortOrder?: number;
      isActive?: boolean;
    }) => {
      const { id, ...body } = input;
      return apiFetch<{ data: SpaService }>(`/api/v1/spa/services/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-services'] });
      queryClient.invalidateQueries({ queryKey: ['spa-service'] });
      queryClient.invalidateQueries({ queryKey: ['spa-service-categories'] });
    },
  });
}

// ── useCreateProvider ───────────────────────────────────────────

export function useCreateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      bio?: string;
      specialties?: string[];
      serviceIds?: string[];
      scheduleJson?: Record<string, { start: string; end: string }[]>;
    }) =>
      apiFetch<{ data: SpaProvider }>('/api/v1/spa/providers', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-providers'] });
    },
  });
}

// ── useUpdateProvider ───────────────────────────────────────────

export function useUpdateProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      id: string;
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phone?: string | null;
      bio?: string | null;
      specialties?: string[];
      serviceIds?: string[];
      scheduleJson?: Record<string, { start: string; end: string }[]> | null;
      isActive?: boolean;
    }) => {
      const { id, ...body } = input;
      return apiFetch<{ data: SpaProvider }>(`/api/v1/spa/providers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-providers'] });
      queryClient.invalidateQueries({ queryKey: ['spa-provider'] });
      queryClient.invalidateQueries({ queryKey: ['spa-calendar'] });
    },
  });
}

// ── useCreateResource ───────────────────────────────────────────

export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      type: string;
      description?: string;
      locationId?: string;
      capacityJson?: Record<string, unknown>;
    }) =>
      apiFetch<{ data: SpaResource }>('/api/v1/spa/resources', {
        method: 'POST',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-resources'] });
    },
  });
}

// ── useUpdateResource ───────────────────────────────────────────

export function useUpdateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      id: string;
      name?: string;
      type?: string;
      description?: string | null;
      locationId?: string | null;
      isActive?: boolean;
      capacityJson?: Record<string, unknown> | null;
    }) => {
      const { id, ...body } = input;
      return apiFetch<{ data: SpaResource }>(`/api/v1/spa/resources/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-resources'] });
    },
  });
}

// ── useUpdateSpaSettings ────────────────────────────────────────

export function useUpdateSpaSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      locationId?: string;
      timezone?: string;
      dayCloseTime?: string;
      defaultCurrency?: string;
      taxInclusive?: boolean;
      defaultBufferMinutes?: number;
      defaultCleanupMinutes?: number;
      defaultSetupMinutes?: number;
      onlineBookingEnabled?: boolean;
      waitlistEnabled?: boolean;
      autoAssignProvider?: boolean;
      rebookingWindowDays?: number;
      notificationPreferences?: Record<string, unknown>;
      depositRules?: Record<string, unknown>;
      cancellationDefaults?: Record<string, unknown>;
      enterpriseMode?: boolean;
    }) =>
      apiFetch<{ data: SpaSettings }>('/api/v1/spa/settings', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-settings'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// Online Booking Hooks
// ═══════════════════════════════════════════════════════════════════

export interface BusinessIdentity {
  businessName?: string;
  tagline?: string;
  description?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export interface ContactLocation {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  directionsUrl?: string;
  parkingInfo?: string;
  accessibilityInfo?: string;
}

export interface WidgetBranding {
  faviconUrl?: string;
  bannerImageUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  buttonStyle?: 'rounded' | 'square' | 'pill';
  headerLayout?: 'centered' | 'left-aligned';
}

export interface WidgetOperational {
  timezoneDisplay?: string;
  hoursOfOperation?: Array<{
    day: string;
    periods: Array<{ open: string; close: string }>;
  }>;
  holidayNotice?: string;
  specialInstructions?: string;
  healthSafetyNotice?: string;
}

export interface WidgetLegal {
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  cancellationPolicyText?: string;
  consentCheckboxText?: string;
  accessibilityStatementUrl?: string;
}

export interface WidgetSeo {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

export interface BookingWidgetConfig {
  id: string;
  tenantId: string;
  locationId: string | null;
  theme: string | null;
  logoUrl: string | null;
  welcomeMessage: string | null;
  bookingLeadTimeHours: number;
  maxAdvanceBookingDays: number;
  requireDeposit: boolean;
  depositType: string | null;
  depositValue: number | null;
  cancellationWindowHours: number;
  cancellationFeeType: string | null;
  cancellationFeeValue: number | null;
  showPrices: boolean;
  showProviderPhotos: boolean;
  allowProviderSelection: boolean;
  allowAddonSelection: boolean;
  customCss: string | null;
  redirectUrl: string | null;
  businessIdentity: BusinessIdentity;
  contactLocation: ContactLocation;
  branding: WidgetBranding;
  operational: WidgetOperational;
  legal: WidgetLegal;
  seo: WidgetSeo;
  createdAt: string;
  updatedAt: string;
}

export interface OnlineBookingStats {
  totalBookings: number;
  bookingsToday: number;
  upcomingCount: number;
  revenueCents: number;
  cancellationCount: number;
  cancellationRate: number;
  recentBookings: Array<{
    id: string;
    appointmentNumber: string;
    guestName: string | null;
    guestEmail: string | null;
    serviceName: string | null;
    providerName: string | null;
    startAt: string;
    endAt: string;
    status: string;
    depositAmountCents: number;
    createdAt: string;
  }>;
}

// ── useSpaBookingConfig ─────────────────────────────────────────

export function useSpaBookingConfig(params: { locationId?: string } = {}) {
  const headers = params.locationId ? { 'X-Location-Id': params.locationId } : undefined;
  const result = useQuery({
    queryKey: ['spa-booking-config', params.locationId],
    queryFn: () =>
      apiFetch<{ data: BookingWidgetConfig | null }>('/api/v1/spa/booking/config', headers ? { headers } : undefined).then(
        (r) => r.data,
      ),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useSpaBookingStats ──────────────────────────────────────────

export function useSpaBookingStats(params: { locationId?: string; from?: string; to?: string } = {}) {
  const headers = params.locationId ? { 'X-Location-Id': params.locationId } : undefined;
  const qs = buildQueryString({ from: params.from, to: params.to });

  const result = useQuery({
    queryKey: ['spa-booking-stats', params.locationId, params.from, params.to],
    queryFn: () =>
      apiFetch<{ data: OnlineBookingStats }>(`/api/v1/spa/booking/stats${qs}`, headers ? { headers } : undefined).then(
        (r) => r.data,
      ),
    staleTime: 60_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useUpdateBookingConfig ──────────────────────────────────────

export function useUpdateBookingConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      locationId?: string;
      theme?: string;
      logoUrl?: string;
      welcomeMessage?: string;
      bookingLeadTimeHours?: number;
      maxAdvanceBookingDays?: number;
      requireDeposit?: boolean;
      depositType?: string;
      depositValue?: number;
      cancellationWindowHours?: number;
      cancellationFeeType?: string;
      cancellationFeeValue?: number;
      showPrices?: boolean;
      showProviderPhotos?: boolean;
      allowProviderSelection?: boolean;
      allowAddonSelection?: boolean;
      customCss?: string;
      redirectUrl?: string;
      businessIdentity?: BusinessIdentity;
      contactLocation?: ContactLocation;
      branding?: WidgetBranding;
      operational?: WidgetOperational;
      legal?: WidgetLegal;
      seo?: WidgetSeo;
    }) =>
      apiFetch<{ data: BookingWidgetConfig }>('/api/v1/spa/booking/config', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spa-booking-config'] });
      queryClient.invalidateQueries({ queryKey: ['spa-booking-stats'] });
    },
  });
}
