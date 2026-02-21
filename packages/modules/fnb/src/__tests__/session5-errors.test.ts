import { describe, it, expect } from 'vitest';
import {
  StationNotFoundError,
  DuplicateStationNameError,
  TicketNotReadyError,
} from '../errors';

describe('Session 5 Errors', () => {
  describe('StationNotFoundError', () => {
    it('creates with correct properties', () => {
      const err = new StationNotFoundError('station-123');
      expect(err.code).toBe('STATION_NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain('station-123');
    });
  });

  describe('DuplicateStationNameError', () => {
    it('creates with correct properties', () => {
      const err = new DuplicateStationNameError('grill');
      expect(err.code).toBe('DUPLICATE_STATION_NAME');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('grill');
    });
  });

  describe('TicketNotReadyError', () => {
    it('creates with correct properties', () => {
      const err = new TicketNotReadyError('ticket-456');
      expect(err.code).toBe('TICKET_NOT_READY');
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('ticket-456');
      expect(err.message).toContain('are ready');
    });
  });
});
