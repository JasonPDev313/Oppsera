import { describe, it, expect } from 'vitest';
import {
  RESERVATION_TRANSITIONS,
  ACTIVE_RESERVATION_STATUSES,
  IMMOVABLE_STATUSES,
  canTransitionReservation,
  assertReservationTransition,
  ROOM_STATUS_TRANSITIONS,
  canTransitionRoom,
  assertRoomTransition,
} from '../state-machines';
import { InvalidStatusTransitionError } from '../errors';

describe('Reservation State Machine', () => {
  describe('RESERVATION_TRANSITIONS map', () => {
    it('HOLD can transition to CONFIRMED or CANCELLED', () => {
      expect(RESERVATION_TRANSITIONS.HOLD).toEqual(['CONFIRMED', 'CANCELLED']);
    });

    it('CONFIRMED can transition to CHECKED_IN, CANCELLED, or NO_SHOW', () => {
      expect(RESERVATION_TRANSITIONS.CONFIRMED).toEqual(['CHECKED_IN', 'CANCELLED', 'NO_SHOW']);
    });

    it('CHECKED_IN can only transition to CHECKED_OUT', () => {
      expect(RESERVATION_TRANSITIONS.CHECKED_IN).toEqual(['CHECKED_OUT']);
    });

    it('terminal statuses have no transitions', () => {
      expect(RESERVATION_TRANSITIONS.CHECKED_OUT).toEqual([]);
      expect(RESERVATION_TRANSITIONS.CANCELLED).toEqual([]);
      expect(RESERVATION_TRANSITIONS.NO_SHOW).toEqual([]);
    });
  });

  describe('ACTIVE_RESERVATION_STATUSES', () => {
    it('includes HOLD, CONFIRMED, CHECKED_IN', () => {
      expect(ACTIVE_RESERVATION_STATUSES).toContain('HOLD');
      expect(ACTIVE_RESERVATION_STATUSES).toContain('CONFIRMED');
      expect(ACTIVE_RESERVATION_STATUSES).toContain('CHECKED_IN');
    });

    it('does not include terminal statuses', () => {
      expect(ACTIVE_RESERVATION_STATUSES).not.toContain('CHECKED_OUT');
      expect(ACTIVE_RESERVATION_STATUSES).not.toContain('CANCELLED');
      expect(ACTIVE_RESERVATION_STATUSES).not.toContain('NO_SHOW');
    });
  });

  describe('IMMOVABLE_STATUSES', () => {
    it('includes only terminal statuses', () => {
      expect(IMMOVABLE_STATUSES).toContain('CANCELLED');
      expect(IMMOVABLE_STATUSES).toContain('NO_SHOW');
      expect(IMMOVABLE_STATUSES).toContain('CHECKED_OUT');
      expect(IMMOVABLE_STATUSES).not.toContain('HOLD');
      expect(IMMOVABLE_STATUSES).not.toContain('CONFIRMED');
      expect(IMMOVABLE_STATUSES).not.toContain('CHECKED_IN');
    });
  });

  describe('canTransitionReservation', () => {
    const valid: [string, string][] = [
      ['HOLD', 'CONFIRMED'],
      ['HOLD', 'CANCELLED'],
      ['CONFIRMED', 'CHECKED_IN'],
      ['CONFIRMED', 'CANCELLED'],
      ['CONFIRMED', 'NO_SHOW'],
      ['CHECKED_IN', 'CHECKED_OUT'],
    ];
    it.each(valid)('%s → %s is valid', (from, to) => {
      expect(canTransitionReservation(from, to)).toBe(true);
    });

    const invalid: [string, string][] = [
      ['HOLD', 'CHECKED_IN'],
      ['HOLD', 'CHECKED_OUT'],
      ['CONFIRMED', 'CHECKED_OUT'],
      ['CHECKED_IN', 'CANCELLED'],
      ['CHECKED_OUT', 'CONFIRMED'],
      ['CANCELLED', 'CONFIRMED'],
      ['NO_SHOW', 'CHECKED_IN'],
    ];
    it.each(invalid)('%s → %s is invalid', (from, to) => {
      expect(canTransitionReservation(from, to)).toBe(false);
    });

    it('returns false for unknown status', () => {
      expect(canTransitionReservation('UNKNOWN', 'CONFIRMED')).toBe(false);
    });

    it('returns false for self-transition', () => {
      expect(canTransitionReservation('CONFIRMED', 'CONFIRMED')).toBe(false);
    });
  });

  describe('assertReservationTransition', () => {
    it('does not throw for valid transitions', () => {
      expect(() => assertReservationTransition('HOLD', 'CONFIRMED')).not.toThrow();
      expect(() => assertReservationTransition('CONFIRMED', 'CHECKED_IN')).not.toThrow();
      expect(() => assertReservationTransition('CHECKED_IN', 'CHECKED_OUT')).not.toThrow();
    });

    it('throws InvalidStatusTransitionError for invalid transition', () => {
      expect(() => assertReservationTransition('HOLD', 'CHECKED_OUT')).toThrow(InvalidStatusTransitionError);
    });

    it('error message includes entity, from, and to', () => {
      try {
        assertReservationTransition('CANCELLED', 'CONFIRMED');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidStatusTransitionError);
        expect((err as Error).message).toContain('reservation');
        expect((err as Error).message).toContain('CANCELLED');
        expect((err as Error).message).toContain('CONFIRMED');
      }
    });
  });
});

describe('Room Status State Machine', () => {
  describe('ROOM_STATUS_TRANSITIONS map', () => {
    it('VACANT_CLEAN → OCCUPIED, VACANT_DIRTY, OUT_OF_ORDER', () => {
      expect(ROOM_STATUS_TRANSITIONS.VACANT_CLEAN).toEqual(['OCCUPIED', 'VACANT_DIRTY', 'OUT_OF_ORDER']);
    });

    it('VACANT_DIRTY → VACANT_CLEAN, OUT_OF_ORDER', () => {
      expect(ROOM_STATUS_TRANSITIONS.VACANT_DIRTY).toEqual(['VACANT_CLEAN', 'OUT_OF_ORDER']);
    });

    it('OCCUPIED → VACANT_DIRTY, OUT_OF_ORDER', () => {
      expect(ROOM_STATUS_TRANSITIONS.OCCUPIED).toEqual(['VACANT_DIRTY', 'OUT_OF_ORDER']);
    });

    it('OUT_OF_ORDER → VACANT_DIRTY, VACANT_CLEAN', () => {
      expect(ROOM_STATUS_TRANSITIONS.OUT_OF_ORDER).toEqual(['VACANT_DIRTY', 'VACANT_CLEAN']);
    });
  });

  describe('canTransitionRoom', () => {
    const valid: [string, string][] = [
      ['VACANT_CLEAN', 'OCCUPIED'],
      ['VACANT_CLEAN', 'VACANT_DIRTY'],
      ['VACANT_CLEAN', 'OUT_OF_ORDER'],
      ['OCCUPIED', 'VACANT_DIRTY'],
      ['OCCUPIED', 'OUT_OF_ORDER'],
      ['VACANT_DIRTY', 'VACANT_CLEAN'],
      ['VACANT_DIRTY', 'OUT_OF_ORDER'],
      ['OUT_OF_ORDER', 'VACANT_DIRTY'],
      ['OUT_OF_ORDER', 'VACANT_CLEAN'],
    ];
    it.each(valid)('%s → %s is valid', (from, to) => {
      expect(canTransitionRoom(from, to)).toBe(true);
    });

    const invalid: [string, string][] = [
      ['VACANT_DIRTY', 'OCCUPIED'],
      ['OCCUPIED', 'VACANT_CLEAN'],
      ['OUT_OF_ORDER', 'OCCUPIED'],
    ];
    it.each(invalid)('%s → %s is invalid', (from, to) => {
      expect(canTransitionRoom(from, to)).toBe(false);
    });

    it('returns false for unknown or self-transition', () => {
      expect(canTransitionRoom('UNKNOWN', 'OCCUPIED')).toBe(false);
      expect(canTransitionRoom('OCCUPIED', 'OCCUPIED')).toBe(false);
    });
  });

  describe('assertRoomTransition', () => {
    it('does not throw for valid transitions', () => {
      expect(() => assertRoomTransition('VACANT_CLEAN', 'OCCUPIED')).not.toThrow();
      expect(() => assertRoomTransition('OCCUPIED', 'VACANT_DIRTY')).not.toThrow();
    });

    it('throws InvalidStatusTransitionError for invalid transition', () => {
      expect(() => assertRoomTransition('VACANT_DIRTY', 'OCCUPIED')).toThrow(InvalidStatusTransitionError);
    });

    it('error includes "room" entity type', () => {
      try {
        assertRoomTransition('OCCUPIED', 'VACANT_CLEAN');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('room');
      }
    });
  });
});

describe('Full Lifecycle Paths', () => {
  it('happy path: HOLD → CONFIRMED → CHECKED_IN → CHECKED_OUT', () => {
    expect(canTransitionReservation('HOLD', 'CONFIRMED')).toBe(true);
    expect(canTransitionReservation('CONFIRMED', 'CHECKED_IN')).toBe(true);
    expect(canTransitionReservation('CHECKED_IN', 'CHECKED_OUT')).toBe(true);
  });

  it('cancellation paths', () => {
    expect(canTransitionReservation('HOLD', 'CANCELLED')).toBe(true);
    expect(canTransitionReservation('CONFIRMED', 'CANCELLED')).toBe(true);
  });

  it('no-show path: CONFIRMED → NO_SHOW', () => {
    expect(canTransitionReservation('CONFIRMED', 'NO_SHOW')).toBe(true);
  });

  it('room turnover: VACANT_CLEAN → OCCUPIED → VACANT_DIRTY → VACANT_CLEAN', () => {
    expect(canTransitionRoom('VACANT_CLEAN', 'OCCUPIED')).toBe(true);
    expect(canTransitionRoom('OCCUPIED', 'VACANT_DIRTY')).toBe(true);
    expect(canTransitionRoom('VACANT_DIRTY', 'VACANT_CLEAN')).toBe(true);
  });

  it('OOO lifecycle: VACANT_CLEAN → OUT_OF_ORDER → VACANT_DIRTY → VACANT_CLEAN', () => {
    expect(canTransitionRoom('VACANT_CLEAN', 'OUT_OF_ORDER')).toBe(true);
    expect(canTransitionRoom('OUT_OF_ORDER', 'VACANT_DIRTY')).toBe(true);
    expect(canTransitionRoom('VACANT_DIRTY', 'VACANT_CLEAN')).toBe(true);
  });
});
