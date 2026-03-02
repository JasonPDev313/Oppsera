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
  bookingWindowDays: number;
  cancellationPolicyMinutes: number;
  bufferMinutes: number;
  maxConcurrentAppointments: number;
  allowOnlineBooking: boolean;
  requireDeposit: boolean;
  depositAmountCents: number | null;
  depositPercentage: number | null;
  operatingHours: Record<string, { open: string; close: string }> | null;
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

export interface SpaAppointment {
  id: string;
  tenantId: string;
  locationId: string | null;
  customerId: string | null;
  customerName: string | null;
  providerId: string;
  providerName: string;
  serviceId: string;
  serviceName: string;
  resourceId: string | null;
  resourceName: string | null;
  status: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  priceCents: number;
  notes: string | null;
  internalNotes: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpaAppointmentDetail extends SpaAppointment {
  customerEmail: string | null;
  customerPhone: string | null;
  providerDisplayName: string;
  serviceDescription: string | null;
  serviceCategoryName: string | null;
  depositPaidCents: number | null;
  totalPaidCents: number | null;
  version: number;
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
  date: string;
  providers: CalendarProviderColumn[];
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  providerId: string;
  providerName: string;
  resourceId: string | null;
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
}

// ═══════════════════════════════════════════════════════════════════
// Filter Interfaces
// ═══════════════════════════════════════════════════════════════════

export interface SpaServiceFilters {
  categoryId?: string;
  status?: 'active' | 'archived' | 'all';
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface SpaProviderFilters {
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface SpaResourceFilters {
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

export function useSpaSettings() {
  const result = useQuery({
    queryKey: ['spa-settings'],
    queryFn: () =>
      apiFetch<{ data: SpaSettings }>('/api/v1/spa/settings').then(
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
      return apiFetch<{ data: SpaAppointment[]; meta: CursorMeta }>(
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
    queryFn: () => {
      const qs = buildQueryString({
        locationId: params!.locationId,
        startDate: params!.startDate,
        endDate: params!.endDate,
      });
      return apiFetch<{ data: SpaCalendarResult }>(
        `/api/v1/spa/appointments/calendar${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!params?.startDate && !!params?.endDate && !!params?.locationId,
    staleTime: 60_000,
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
    enabled: !!params?.serviceId && !!params?.date,
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
    queryFn: () => {
      const qs = buildQueryString({ locationId, date });
      return apiFetch<{ data: SpaDashboardMetrics }>(
        `/api/v1/spa/dashboard${qs}`,
      ).then((r) => r.data);
    },
    staleTime: 60_000,
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

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      serviceId: string;
      providerId: string;
      customerId?: string;
      resourceId?: string;
      locationId?: string;
      startTime: string;
      durationMinutes?: number;
      notes?: string;
      internalNotes?: string;
      clientRequestId?: string;
    }) =>
      apiFetch<{ data: SpaAppointment }>('/api/v1/spa/appointments', {
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
      return apiFetch<{ data: SpaAppointment }>(
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
      bookingWindowDays?: number;
      cancellationPolicyMinutes?: number;
      bufferMinutes?: number;
      maxConcurrentAppointments?: number;
      allowOnlineBooking?: boolean;
      requireDeposit?: boolean;
      depositAmountCents?: number | null;
      depositPercentage?: number | null;
      operatingHours?: Record<string, { open: string; close: string }> | null;
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
  totalOnlineBookings: number;
  bookingsThisPeriod: number;
  onlineRevenueCents: number;
  cancellationRate: number;
  avgLeadTimeDays: number;
  topServices: Array<{
    serviceId: string;
    serviceName: string;
    bookingCount: number;
  }>;
  recentBookings: Array<{
    appointmentId: string;
    guestName: string | null;
    guestEmail: string | null;
    serviceName: string;
    providerName: string | null;
    startAt: string;
    status: string;
    depositAmountCents: number;
    createdAt: string;
  }>;
}

// ── useSpaBookingConfig ─────────────────────────────────────────

export function useSpaBookingConfig() {
  const result = useQuery({
    queryKey: ['spa-booking-config'],
    queryFn: () =>
      apiFetch<{ data: BookingWidgetConfig | null }>('/api/v1/spa/booking/config').then(
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

export function useSpaBookingStats(from?: string, to?: string) {
  const qs = buildQueryString({ from, to });

  const result = useQuery({
    queryKey: ['spa-booking-stats', from, to],
    queryFn: () =>
      apiFetch<{ data: OnlineBookingStats }>(`/api/v1/spa/booking/stats${qs}`).then(
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
