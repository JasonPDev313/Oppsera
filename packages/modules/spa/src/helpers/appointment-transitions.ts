import { AppError } from '@oppsera/shared';
import { SPA_EVENTS } from '../events/types';

// ══════════════════════════════════════════════════════════════════
// Appointment Status State Machine
// ══════════════════════════════════════════════════════════════════
//
// scheduled ──→ confirmed ──→ checked_in ──→ in_service ──→ completed ──→ checked_out
//     │              │             │
//     ├──→ canceled   ├──→ canceled  ├──→ canceled (late cancel)
//     ├──→ no_show    ├──→ no_show
//     └──→ checked_in (walk-in, skip confirm)
//
// Terminal states: checked_out, canceled, no_show

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_service'
  | 'completed'
  | 'checked_out'
  | 'canceled'
  | 'no_show';

/**
 * Valid transitions for each appointment status.
 * Keys are the current status; values are the statuses that can be transitioned TO.
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'canceled', 'no_show', 'checked_in'],
  confirmed: ['checked_in', 'canceled', 'no_show'],
  checked_in: ['in_service', 'canceled'],
  in_service: ['completed'],
  completed: ['checked_out'],
  checked_out: [], // terminal
  canceled: [],    // terminal
  no_show: [],     // terminal
};

/**
 * Statuses that represent an active (in-progress) appointment.
 * Used for conflict detection — appointments in these statuses occupy provider/resource time.
 */
export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_service',
];

/**
 * Statuses that are terminal — no further transitions are possible.
 */
export const TERMINAL_STATUSES: AppointmentStatus[] = [
  'checked_out',
  'canceled',
  'no_show',
];

/**
 * Statuses that should be excluded from scheduling conflict checks.
 * Canceled and no-show appointments do not block time slots.
 */
export const CONFLICT_EXCLUDED_STATUSES: AppointmentStatus[] = [
  'canceled',
  'no_show',
  'checked_out',
];

/**
 * Check whether a transition from one status to another is allowed.
 */
export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus): boolean {
  const allowed = APPOINTMENT_TRANSITIONS[from];
  return allowed != null && allowed.includes(to);
}

/**
 * Assert that a transition is valid. Throws AppError (409) if not.
 */
export function assertAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransitionAppointment(from, to)) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `Cannot transition appointment from '${from}' to '${to}'`,
      409,
    );
  }
}

/**
 * Check whether a status is terminal (no further transitions allowed).
 */
export function isTerminalStatus(status: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[status]?.length === 0;
}

/**
 * Check whether a status is active (occupies provider/resource time).
 */
export function isActiveStatus(status: AppointmentStatus): boolean {
  return ACTIVE_APPOINTMENT_STATUSES.includes(status);
}

/**
 * Maps a target appointment status to the corresponding SPA event type.
 * Returns null for statuses that don't have a direct event mapping
 * (e.g., 'scheduled' — that's the initial creation event, not a transition).
 */
export function getEventTypeForTransition(to: AppointmentStatus): string | null {
  switch (to) {
    case 'confirmed':
      return SPA_EVENTS.APPOINTMENT_CONFIRMED;
    case 'checked_in':
      return SPA_EVENTS.APPOINTMENT_CHECKED_IN;
    case 'in_service':
      return SPA_EVENTS.APPOINTMENT_SERVICE_STARTED;
    case 'completed':
      return SPA_EVENTS.APPOINTMENT_COMPLETED;
    case 'checked_out':
      return SPA_EVENTS.APPOINTMENT_CHECKED_OUT;
    case 'canceled':
      return SPA_EVENTS.APPOINTMENT_CANCELED;
    case 'no_show':
      return SPA_EVENTS.APPOINTMENT_NO_SHOW;
    default:
      return null;
  }
}

/**
 * Returns a human-readable label for an appointment status.
 */
export function getStatusLabel(status: AppointmentStatus): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'confirmed':
      return 'Confirmed';
    case 'checked_in':
      return 'Checked In';
    case 'in_service':
      return 'In Service';
    case 'completed':
      return 'Completed';
    case 'checked_out':
      return 'Checked Out';
    case 'canceled':
      return 'Canceled';
    case 'no_show':
      return 'No Show';
    default:
      return status;
  }
}
