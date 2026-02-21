import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';

describe('Session 4 Events', () => {
  const session4Events = [
    'TICKET_CREATED',
    'TICKET_STATUS_CHANGED',
    'TICKET_ITEM_STATUS_CHANGED',
    'TICKET_VOIDED',
    'DELTA_CHIT_CREATED',
  ] as const;

  it('defines all session 4 events', () => {
    for (const key of session4Events) {
      expect(FNB_EVENTS[key]).toBeDefined();
    }
  });

  it('follows naming convention: fnb.{entity}.{action}.v1', () => {
    for (const key of session4Events) {
      const value = FNB_EVENTS[key];
      expect(value).toMatch(/^fnb\.[a-z_]+\.[a-z_]+\.v1$/);
    }
  });

  it('has unique event values across all sessions', () => {
    const allValues = Object.values(FNB_EVENTS);
    const unique = new Set(allValues);
    expect(unique.size).toBe(allValues.length);
  });

  it('has correct event domains', () => {
    expect(FNB_EVENTS.TICKET_CREATED).toBe('fnb.ticket.created.v1');
    expect(FNB_EVENTS.TICKET_STATUS_CHANGED).toBe('fnb.ticket.status_changed.v1');
    expect(FNB_EVENTS.TICKET_ITEM_STATUS_CHANGED).toBe('fnb.ticket_item.status_changed.v1');
    expect(FNB_EVENTS.TICKET_VOIDED).toBe('fnb.ticket.voided.v1');
    expect(FNB_EVENTS.DELTA_CHIT_CREATED).toBe('fnb.delta_chit.created.v1');
  });
});
