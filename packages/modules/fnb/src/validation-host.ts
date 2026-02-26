import { z } from 'zod';

// ── Status Constants ─────────────────────────────────────────────

export const HOST_RESERVATION_STATUSES = [
  'booked', 'confirmed', 'checked_in', 'partially_seated',
  'seated', 'completed', 'no_show', 'canceled',
] as const;
export type HostReservationStatus = (typeof HOST_RESERVATION_STATUSES)[number];

export const MEAL_PERIODS = ['breakfast', 'lunch', 'dinner', 'brunch'] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

export const HOST_SEATING_PREFERENCES = [
  'indoor', 'outdoor', 'bar', 'booth', 'window', 'quiet', 'none',
] as const;
export type HostSeatingPreference = (typeof HOST_SEATING_PREFERENCES)[number];

export const HOST_OCCASIONS = [
  'birthday', 'anniversary', 'business', 'date_night', 'celebration', 'other',
] as const;
export type HostOccasion = (typeof HOST_OCCASIONS)[number];

export const HOST_RESERVATION_SOURCES = [
  'host', 'phone', 'online', 'walk_in', 'external',
] as const;
export type HostReservationSource = (typeof HOST_RESERVATION_SOURCES)[number];

export const HOST_WAITLIST_STATUSES = [
  'waiting', 'notified', 'seated', 'no_show', 'canceled', 'left',
] as const;
export type HostWaitlistStatus = (typeof HOST_WAITLIST_STATUSES)[number];

export const HOST_WAITLIST_SOURCES = ['host', 'qr_code', 'online'] as const;
export type HostWaitlistSource = (typeof HOST_WAITLIST_SOURCES)[number];

// ── State Machine ────────────────────────────────────────────────

export const RESERVATION_TRANSITIONS: Record<string, readonly string[]> = {
  booked:           ['confirmed', 'checked_in', 'canceled', 'no_show'],
  confirmed:        ['checked_in', 'canceled', 'no_show'],
  checked_in:       ['seated', 'partially_seated', 'canceled', 'no_show'],
  partially_seated: ['seated', 'canceled'],
  seated:           ['completed'],
  completed:        [],
  no_show:          ['booked'],
  canceled:         ['booked'],
};

export function validateReservationTransition(from: string, to: string): boolean {
  const allowed = RESERVATION_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export const WAITLIST_TRANSITIONS: Record<string, readonly string[]> = {
  waiting:  ['notified', 'seated', 'canceled', 'left', 'no_show'],
  notified: ['seated', 'canceled', 'left', 'no_show'],
  seated:   [],
  no_show:  [],
  canceled: [],
  left:     [],
};

export function validateWaitlistTransition(from: string, to: string): boolean {
  const allowed = WAITLIST_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ── Phone validation (E.164-ish) ─────────────────────────────────

const phoneRegex = /^\+?[1-9]\d{1,14}$/;

// ── Reservation Schemas ──────────────────────────────────────────

export const hostCreateReservationSchema = z.object({
  guestName: z.string().min(1).max(200),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().regex(phoneRegex, 'Invalid phone number format').optional(),
  customerId: z.string().optional(),
  partySize: z.number().int().min(1).max(99),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  mealPeriod: z.enum(MEAL_PERIODS).optional(),
  source: z.enum(HOST_RESERVATION_SOURCES).default('host'),
  specialRequests: z.string().max(1000).optional(),
  occasion: z.enum(HOST_OCCASIONS).optional(),
  tags: z.array(z.string()).default([]),
  seatingPreference: z.enum(HOST_SEATING_PREFERENCES).optional(),
  tableIds: z.array(z.string()).optional(),
  serverId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type HostCreateReservationInput = z.input<typeof hostCreateReservationSchema>;

export const hostUpdateReservationSchema = z.object({
  guestName: z.string().min(1).max(200).optional(),
  guestEmail: z.string().email().nullable().optional(),
  guestPhone: z.string().regex(phoneRegex).nullable().optional(),
  partySize: z.number().int().min(1).max(99).optional(),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mealPeriod: z.enum(MEAL_PERIODS).optional(),
  specialRequests: z.string().max(1000).nullable().optional(),
  occasion: z.enum(HOST_OCCASIONS).nullable().optional(),
  tags: z.array(z.string()).optional(),
  seatingPreference: z.enum(HOST_SEATING_PREFERENCES).nullable().optional(),
  tableIds: z.array(z.string()).optional(),
  serverId: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  expectedVersion: z.number().int().optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type HostUpdateReservationInput = z.input<typeof hostUpdateReservationSchema>;

export const seatReservationSchema = z.object({
  tableIds: z.array(z.string()).min(1),
  adjustedPartySize: z.number().int().min(1).max(99).optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type SeatReservationInput = z.input<typeof seatReservationSchema>;

export const cancelReservationV2Schema = z.object({
  reason: z.string().max(500).optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type CancelReservationV2Input = z.input<typeof cancelReservationV2Schema>;

export const confirmReservationSchema = z.object({
  sendConfirmation: z.boolean().default(false),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type ConfirmReservationInput = z.input<typeof confirmReservationSchema>;

export const completeReservationSchema = z.object({
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type CompleteReservationInput = z.input<typeof completeReservationSchema>;

export const markNoShowSchema = z.object({
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type MarkNoShowInput = z.input<typeof markNoShowSchema>;

export const checkInReservationV2Schema = z.object({
  tableId: z.string().optional(),
  serverUserId: z.string().optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type CheckInReservationV2Input = z.input<typeof checkInReservationV2Schema>;

// ── Waitlist Schemas ─────────────────────────────────────────────

export const hostAddToWaitlistSchema = z.object({
  guestName: z.string().min(1).max(200),
  guestPhone: z.string().regex(phoneRegex, 'Phone required for waitlist notifications'),
  customerId: z.string().optional(),
  partySize: z.number().int().min(1).max(99),
  seatingPreference: z.enum(HOST_SEATING_PREFERENCES).optional(),
  specialRequests: z.string().max(1000).optional(),
  source: z.enum(HOST_WAITLIST_SOURCES).default('host'),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type HostAddToWaitlistInput = z.input<typeof hostAddToWaitlistSchema>;

export const hostUpdateWaitlistEntrySchema = z.object({
  guestName: z.string().min(1).max(200).optional(),
  guestPhone: z.string().regex(phoneRegex).optional(),
  partySize: z.number().int().min(1).max(99).optional(),
  seatingPreference: z.enum(HOST_SEATING_PREFERENCES).nullable().optional(),
  specialRequests: z.string().max(1000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type HostUpdateWaitlistEntryInput = z.input<typeof hostUpdateWaitlistEntrySchema>;

export const hostSeatFromWaitlistSchema = z.object({
  tableIds: z.array(z.string()).min(1),
  serverUserId: z.string().optional(),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type HostSeatFromWaitlistInput = z.input<typeof hostSeatFromWaitlistSchema>;

export const hostNotifyWaitlistSchema = z.object({
  method: z.enum(['sms', 'manual']).default('manual'),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type HostNotifyWaitlistInput = z.input<typeof hostNotifyWaitlistSchema>;

export const hostRemoveFromWaitlistSchema = z.object({
  reason: z.enum(['canceled', 'left', 'no_show']).default('canceled'),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type HostRemoveFromWaitlistInput = z.input<typeof hostRemoveFromWaitlistSchema>;

// ── Turn Log & Notification Schemas ──────────────────────────────

export const recordTableTurnSchema = z.object({
  tableId: z.string().min(1),
  clientRequestId: z.string().min(1).max(128).optional(),
});
export type RecordTableTurnInput = z.input<typeof recordTableTurnSchema>;

export const sendGuestNotificationSchema = z.object({
  referenceType: z.enum(['reservation', 'waitlist']),
  referenceId: z.string().min(1),
  notificationType: z.enum([
    'confirmation', 'reminder', 'table_ready',
    'running_late', 'cancellation', 'custom',
  ]),
  channel: z.enum(['sms', 'email', 'push']),
  recipientPhone: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  messageBody: z.string().min(1).max(1000),
});
export type SendGuestNotificationInput = z.input<typeof sendGuestNotificationSchema>;

// ── Query Filter Schemas ─────────────────────────────────────────

export const hostListReservationsFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealPeriod: z.enum(MEAL_PERIODS).optional(),
  status: z.enum(HOST_RESERVATION_STATUSES).optional(),
  search: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type HostListReservationsFilterInput = z.input<typeof hostListReservationsFilterSchema>;

export const hostGetUpcomingReservationsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
});
export type HostGetUpcomingReservationsInput = z.input<typeof hostGetUpcomingReservationsSchema>;

export const hostListWaitlistFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
});
export type HostListWaitlistFilterInput = z.input<typeof hostListWaitlistFilterSchema>;

export const hostGetDashboardMetricsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
});
export type HostGetDashboardMetricsInput = z.input<typeof hostGetDashboardMetricsSchema>;

export const hostGetTableTurnStatsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  days: z.number().int().min(1).max(90).default(28),
});
export type HostGetTableTurnStatsInput = z.input<typeof hostGetTableTurnStatsSchema>;

export const hostGetPreShiftReportSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealPeriod: z.enum(MEAL_PERIODS),
});
export type HostGetPreShiftReportInput = z.input<typeof hostGetPreShiftReportSchema>;

export const hostGetAnalyticsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  mealPeriod: z.enum(MEAL_PERIODS).optional(),
});
export type HostGetAnalyticsInput = z.input<typeof hostGetAnalyticsSchema>;
