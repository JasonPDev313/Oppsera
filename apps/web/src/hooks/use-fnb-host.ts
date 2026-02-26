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

export interface HostTableItem {
  id: string;
  tableNumber: number;
  displayLabel: string;
  capacityMin: number;
  capacityMax: number;
  tableType: string;
  shape: string;
  status: string;
  sectionId: string | null;
  currentServerUserId: string | null;
  serverName: string | null;
  seatedAt: string | null;
  partySize: number | null;
  guestName: string | null;
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

/** Host settings shape — matches the hostSettingsSchema from @oppsera/module-fnb */
export interface HostSettings {
  reservations: {
    slotMinutes: number;
    maxPartySize: number;
    advanceBookingDays: number;
    sameDayEnabled: boolean;
    requirePhone: boolean;
    requireEmail: boolean;
    allowSpecialRequests: boolean;
    confirmationRequired: boolean;
    autoConfirmUpToParty: number;
    defaultDurationMinutes: { breakfast: number; brunch: number; lunch: number; dinner: number };
    bufferMinutes: number;
    overbookPercent: number;
    minLeadTimeMinutes: number;
  };
  pacing: {
    enabled: boolean;
    coversPerInterval: number;
    intervalMinutes: number;
    onlinePacingPercent: number;
    perMealPeriod: {
      breakfast: { maxCovers: number; maxReservations: number };
      brunch: { maxCovers: number; maxReservations: number };
      lunch: { maxCovers: number; maxReservations: number };
      dinner: { maxCovers: number; maxReservations: number };
    };
  };
  waitlist: {
    maxSize: number;
    noShowGraceMinutes: number;
    notifyExpiryMinutes: number;
    autoRemoveAfterExpiryMinutes: number;
    allowQuotedTime: boolean;
    priorityEnabled: boolean;
    priorityTags: string[];
    requirePartySize: boolean;
    maxWaitMinutes: number;
  };
  estimation: {
    enabled: boolean;
    defaultTurnMinutes: { small: number; medium: number; large: number; xlarge: number };
    byTableType: { bar: number; booth: number; patio: number; highTop: number };
    dayOfWeekMultiplier: { sun: number; mon: number; tue: number; wed: number; thu: number; fri: number; sat: number };
    useHistoricalData: boolean;
    historicalWeight: number;
  };
  deposits: {
    enabled: boolean;
    mode: string;
    amountCents: number;
    percentOfEstimate: number;
    minPartySizeForDeposit: number;
    refundableUntilHoursBefore: number;
    noShowFeeEnabled: boolean;
    noShowFeeCents: number;
    lateCancellationEnabled: boolean;
    lateCancellationHoursBefore: number;
    lateCancellationFeeCents: number;
  };
  notifications: {
    smsEnabled: boolean;
    emailEnabled: boolean;
    autoConfirmation: boolean;
    autoReminder: boolean;
    reminderHoursBefore: number;
    secondReminderHoursBefore: number;
    smsFromNumber: string | null;
    templates: {
      confirmationSms: string;
      confirmationEmail: string;
      reminderSms: string;
      waitlistReadySms: string;
      waitlistAddedSms: string;
      cancellationSms: string;
      noShowSms: string;
    };
    waitlistReadyAlert: boolean;
    sendOnCancellation: boolean;
    sendOnModification: boolean;
  };
  tableManagement: {
    autoAssignEnabled: boolean;
    allowCombinations: boolean;
    maxCombinedTables: number;
    holdTimeMinutes: number;
    lateArrivalGraceMinutes: number;
    autoReleaseAfterGraceMinutes: number;
    preferenceWeights: {
      capacityFit: number;
      seatingPreference: number;
      serverBalance: number;
      vipPreference: number;
    };
    minCapacityUtilization: number;
    maxCapacityOverflow: number;
  };
  serverRotation: {
    method: string;
    trackCoversPerServer: boolean;
    maxCoverDifference: number;
    skipCutServers: boolean;
    rebalanceOnCut: boolean;
  };
  guestSelfService: {
    waitlistEnabled: boolean;
    reservationEnabled: boolean;
    qrCodeEnabled: boolean;
    showMenuWhileWaiting: boolean;
    showEstimatedWait: boolean;
    showQueuePosition: boolean;
    allowCancellation: boolean;
    requirePhoneVerification: boolean;
  };
  schedule: {
    blackoutDates: string[];
    specialHours: unknown[];
    closedDays: string[];
    holidayAutoClose: boolean;
  };
  display: {
    defaultView: string;
    showElapsedTime: boolean;
    showServerOnTables: boolean;
    showCoverCount: boolean;
    showTableStatus: boolean;
    autoSelectMealPeriod: boolean;
    colorCodeByStatus: boolean;
    colorCodeByServer: boolean;
    compactMode: boolean;
    refreshIntervalSeconds: number;
    mealPeriodSchedule: {
      breakfast: { start: string; end: string };
      brunch: { start: string; end: string };
      lunch: { start: string; end: string };
      dinner: { start: string; end: string };
    };
  };
  alerts: {
    soundEnabled: boolean;
    newReservationSound: boolean;
    waitlistEntrySound: boolean;
    tableReadySound: boolean;
    noShowAlertMinutes: number;
    capacityWarningPercent: number;
    longWaitAlertMinutes: number;
    overdueReservationMinutes: number;
  };
  guestProfile: {
    enableTags: boolean;
    defaultTags: string[];
    occasionOptions: string[];
    seatingPreferences: string[];
    trackVisitHistory: boolean;
    showGuestNotes: boolean;
  };
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

// ── Host Tables Hook ─────────────────────────────────────────────

export function useHostTables(locationId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ['host-tables', locationId],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: HostTableItem[] }>(
        `/api/v1/fnb/tables?locationId=${locationId}&limit=200`,
        { signal },
      );
      return json.data;
    },
    enabled: !!locationId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return { tables: data ?? [], isLoading };
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
        `/api/v1/fnb/host/settings?locationId=${locationId}`,
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

export function useWaitlistMutations(locationId: string | null) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const locParam = locationId ? `?locationId=${locationId}` : '';

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['host-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['host-table-availability'] });
  }, [queryClient]);

  const addToWaitlist = useMutation({
    mutationFn: async (input: AddToWaitlistInput) => {
      const json = await apiFetch<{ data: WaitlistEntry }>(
        `/api/v1/fnb/host/waitlist${locParam}`,
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
        `/api/v1/fnb/host/waitlist/${id}${locParam}`,
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
        `/api/v1/fnb/host/waitlist/${input.id}/seat${locParam}`,
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
        `/api/v1/fnb/host/waitlist/${input.id}/notify${locParam}`,
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
        `/api/v1/fnb/host/waitlist/${input.id}${locParam}`,
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

// ── Pre-Shift Report ────────────────────────────────────────────

export interface PreShiftAlert {
  type: 'allergy' | 'large_party' | 'occasion' | 'vip';
  message: string;
  reservationId: string;
  guestName: string;
  time: string;
}

export interface VipArrival {
  reservationId: string;
  guestName: string;
  time: string;
  partySize: number;
  visitCount: number;
  notes: string | null;
}

export interface StaffAssignment {
  serverName: string;
  sectionNames: string[];
  expectedCovers: number;
}

export interface PreShiftData {
  totalReservations: number;
  expectedCovers: number;
  vipCount: number;
  largePartyCount: number;
  alerts: PreShiftAlert[];
  vipArrivals: VipArrival[];
  staffAssignments: StaffAssignment[];
}

export function usePreShift(locationId: string | null, mealPeriod?: string) {
  const params = new URLSearchParams();
  if (locationId) params.set('locationId', locationId);
  if (mealPeriod) params.set('mealPeriod', mealPeriod);
  const qs = params.toString();

  const { data, isLoading, error } = useQuery<PreShiftData>({
    queryKey: ['host-pre-shift', locationId, mealPeriod],
    queryFn: async ({ signal }) => {
      const json = await apiFetch<{ data: PreShiftData }>(
        `/api/v1/fnb/host/pre-shift${qs ? `?${qs}` : ''}`,
        { signal },
      );
      return json.data;
    },
    enabled: !!locationId,
    staleTime: 5 * 60_000,
  });

  return { data: data ?? null, isLoading, error };
}

// ── Reservation Mutations ────────────────────────────────────────

export function useReservationMutations(locationId: string | null) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const locParam = locationId ? `?locationId=${locationId}` : '';

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['host-dashboard'] });
  }, [queryClient]);

  const createReservation = useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      const json = await apiFetch<{ data: ReservationEntry }>(
        `/api/v1/fnb/host/reservations${locParam}`,
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
        `/api/v1/fnb/host/reservations/${id}${locParam}`,
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
        `/api/v1/fnb/host/reservations/${input.id}/check-in${locParam}`,
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
        `/api/v1/fnb/host/reservations/${input.id}/cancel${locParam}`,
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
        `/api/v1/fnb/host/reservations/${id}/no-show${locParam}`,
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
