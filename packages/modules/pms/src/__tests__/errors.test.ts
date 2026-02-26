import { describe, it, expect } from 'vitest';
import {
  RoomAlreadyBookedError,
  RoomOutOfOrderError,
  InvalidStatusTransitionError,
  ConcurrencyConflictError,
  ReservationNotMovableError,
  FolioNotOpenError,
} from '../errors';

describe('PMS Error Classes', () => {
  describe('RoomAlreadyBookedError', () => {
    it('sets correct code and message', () => {
      const err = new RoomAlreadyBookedError('r1', '2026-04-01', '2026-04-05');
      expect(err.code).toBe('ROOM_ALREADY_BOOKED');
      expect(err.message).toBe('Room r1 is already booked for 2026-04-01–2026-04-05');
    });

    it('is an instance of Error', () => {
      const err = new RoomAlreadyBookedError('r1', '2026-04-01', '2026-04-05');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('RoomOutOfOrderError', () => {
    it('sets correct code and message', () => {
      const err = new RoomOutOfOrderError('r2');
      expect(err.code).toBe('ROOM_OUT_OF_ORDER');
      expect(err.message).toBe('Room r2 is out of order');
    });
  });

  describe('InvalidStatusTransitionError', () => {
    it('sets correct code and message for reservation', () => {
      const err = new InvalidStatusTransitionError('reservation', 'CANCELLED', 'CHECKED_IN');
      expect(err.code).toBe('INVALID_STATUS_TRANSITION');
      expect(err.message).toBe('Cannot transition reservation from CANCELLED to CHECKED_IN');
    });

    it('sets correct code and message for room', () => {
      const err = new InvalidStatusTransitionError('room', 'OCCUPIED', 'VACANT_CLEAN');
      expect(err.code).toBe('INVALID_STATUS_TRANSITION');
      expect(err.message).toBe('Cannot transition room from OCCUPIED to VACANT_CLEAN');
    });
  });

  describe('ConcurrencyConflictError', () => {
    it('sets correct code and message', () => {
      const err = new ConcurrencyConflictError('entity-123');
      expect(err.code).toBe('CONCURRENCY_CONFLICT');
      expect(err.message).toContain('entity-123');
      expect(err.message).toContain('modified by another user');
    });
  });

  describe('ReservationNotMovableError', () => {
    it('sets correct code and lowercased status', () => {
      const err = new ReservationNotMovableError('CANCELLED');
      expect(err.code).toBe('RESERVATION_NOT_MOVABLE');
      expect(err.message).toBe('Cannot move a cancelled reservation');
    });

    it('lowercases any status', () => {
      const err = new ReservationNotMovableError('CHECKED_OUT');
      expect(err.message).toContain('checked_out');
    });
  });

  describe('FolioNotOpenError', () => {
    it('sets correct code and message', () => {
      const err = new FolioNotOpenError('folio-abc');
      expect(err.code).toBe('FOLIO_NOT_OPEN');
      expect(err.message).toBe('Folio folio-abc is already closed');
    });
  });

  describe('error codes are unique', () => {
    it('all error classes have distinct codes', () => {
      const codes = [
        new RoomAlreadyBookedError('r', '2026-01-01', '2026-01-02').code,
        new RoomOutOfOrderError('r').code,
        new InvalidStatusTransitionError('e', 'a', 'b').code,
        new ConcurrencyConflictError('e').code,
        new ReservationNotMovableError('s').code,
        new FolioNotOpenError('f').code,
      ];
      expect(new Set(codes).size).toBe(codes.length);
    });
  });
});
