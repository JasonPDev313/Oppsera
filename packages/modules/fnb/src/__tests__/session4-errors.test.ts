import { describe, it, expect } from 'vitest';
import {
  TicketNotFoundError,
  TicketStatusConflictError,
  TicketItemNotFoundError,
  TicketVersionConflictError,
  RoutingRuleNotFoundError,
} from '../errors';

describe('Session 4 Errors', () => {
  describe('TicketNotFoundError', () => {
    it('creates with correct properties', () => {
      const err = new TicketNotFoundError('ticket-123');
      expect(err.code).toBe('TICKET_NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain('ticket-123');
    });
  });

  describe('TicketStatusConflictError', () => {
    it('creates with correct properties', () => {
      const err = new TicketStatusConflictError('ticket-1', 'served', 'void');
      expect(err.code).toBe('TICKET_STATUS_CONFLICT');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('served');
      expect(err.message).toContain('void');
    });
  });

  describe('TicketItemNotFoundError', () => {
    it('creates with correct properties', () => {
      const err = new TicketItemNotFoundError('item-456');
      expect(err.code).toBe('TICKET_ITEM_NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain('item-456');
    });
  });

  describe('TicketVersionConflictError', () => {
    it('creates with correct properties', () => {
      const err = new TicketVersionConflictError('ticket-1');
      expect(err.code).toBe('TICKET_VERSION_CONFLICT');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('modified by another user');
    });
  });

  describe('RoutingRuleNotFoundError', () => {
    it('creates with correct properties', () => {
      const err = new RoutingRuleNotFoundError('rule-789');
      expect(err.code).toBe('ROUTING_RULE_NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain('rule-789');
    });
  });
});
