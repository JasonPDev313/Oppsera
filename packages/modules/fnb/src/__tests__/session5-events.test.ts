import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';

describe('Session 5 Events', () => {
  const session5Events = [
    'STATION_CREATED',
    'STATION_UPDATED',
    'ITEM_BUMPED',
    'ITEM_RECALLED',
    'TICKET_BUMPED',
    'ITEM_CALLED_BACK',
  ] as const;

  it('defines all session 5 events', () => {
    for (const key of session5Events) {
      expect(FNB_EVENTS[key]).toBeDefined();
    }
  });

  it('follows naming convention: fnb.{entity}.{action}.v1', () => {
    for (const key of session5Events) {
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
    expect(FNB_EVENTS.STATION_CREATED).toBe('fnb.station.created.v1');
    expect(FNB_EVENTS.STATION_UPDATED).toBe('fnb.station.updated.v1');
    expect(FNB_EVENTS.ITEM_BUMPED).toBe('fnb.kds.item_bumped.v1');
    expect(FNB_EVENTS.ITEM_RECALLED).toBe('fnb.kds.item_recalled.v1');
    expect(FNB_EVENTS.TICKET_BUMPED).toBe('fnb.kds.ticket_bumped.v1');
    expect(FNB_EVENTS.ITEM_CALLED_BACK).toBe('fnb.kds.item_called_back.v1');
  });
});
