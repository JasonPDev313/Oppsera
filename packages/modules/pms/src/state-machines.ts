import type { ReservationStatus, RoomStatus } from './types';
import { InvalidStatusTransitionError } from './errors';

// ══════════════════════════════════════════════════════════════════
// Reservation State Machine
// ══════════════════════════════════════════════════════════════════
//
// HOLD → CONFIRMED, CANCELLED
// CONFIRMED → CHECKED_IN, CANCELLED, NO_SHOW
// CHECKED_IN → CHECKED_OUT
// CHECKED_OUT → (terminal)
// CANCELLED → (terminal)
// NO_SHOW → (terminal)

export const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  HOLD: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Statuses that occupy rooms (have active room blocks) */
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ['HOLD', 'CONFIRMED', 'CHECKED_IN'];

/** Statuses that cannot be moved or resized on the calendar */
export const IMMOVABLE_STATUSES: ReservationStatus[] = ['CANCELLED', 'NO_SHOW', 'CHECKED_OUT'];

export function canTransitionReservation(from: string, to: string): boolean {
  return RESERVATION_TRANSITIONS[from as ReservationStatus]?.includes(to as ReservationStatus) ?? false;
}

export function assertReservationTransition(from: string, to: string): void {
  if (!canTransitionReservation(from, to)) {
    throw new InvalidStatusTransitionError('reservation', from, to);
  }
}

// ══════════════════════════════════════════════════════════════════
// Room Status State Machine
// ══════════════════════════════════════════════════════════════════
//
// VACANT_CLEAN → OCCUPIED (check-in), VACANT_DIRTY (manual), OUT_OF_ORDER
// VACANT_DIRTY → VACANT_CLEAN (cleaned), OUT_OF_ORDER
// OCCUPIED → VACANT_DIRTY (check-out), OUT_OF_ORDER (emergency)
// OUT_OF_ORDER → VACANT_DIRTY (returned to service), VACANT_CLEAN (returned cleaned)

export const ROOM_STATUS_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  VACANT_CLEAN: ['OCCUPIED', 'VACANT_DIRTY', 'OUT_OF_ORDER'],
  VACANT_DIRTY: ['VACANT_CLEAN', 'OUT_OF_ORDER'],
  OCCUPIED: ['VACANT_DIRTY', 'OUT_OF_ORDER'],
  OUT_OF_ORDER: ['VACANT_DIRTY', 'VACANT_CLEAN'],
};

export function canTransitionRoom(from: string, to: string): boolean {
  return ROOM_STATUS_TRANSITIONS[from as RoomStatus]?.includes(to as RoomStatus) ?? false;
}

export function assertRoomTransition(from: string, to: string): void {
  if (!canTransitionRoom(from, to)) {
    throw new InvalidStatusTransitionError('room', from, to);
  }
}
