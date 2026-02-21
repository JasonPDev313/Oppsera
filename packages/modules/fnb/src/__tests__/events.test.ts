import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';

describe('FNB_EVENTS', () => {
  it('has correct event naming convention', () => {
    const eventNames = Object.values(FNB_EVENTS);
    for (const name of eventNames) {
      // Must match pattern: {domain}.{entity}.{action}.v{N}
      expect(name).toMatch(/^[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/);
    }
  });

  it('all events are in the fnb domain', () => {
    const eventNames = Object.values(FNB_EVENTS);
    for (const name of eventNames) {
      expect(name.startsWith('fnb.')).toBe(true);
    }
  });

  it('has all Session 1 events', () => {
    expect(FNB_EVENTS.TABLE_STATUS_CHANGED).toBe('fnb.table.status_changed.v1');
    expect(FNB_EVENTS.TABLES_SYNCED).toBe('fnb.table.synced_from_floor_plan.v1');
    expect(FNB_EVENTS.TABLE_COMBINED).toBe('fnb.table.combined.v1');
    expect(FNB_EVENTS.TABLE_UNCOMBINED).toBe('fnb.table.uncombined.v1');
    expect(FNB_EVENTS.TABLE_CREATED).toBe('fnb.table.created.v1');
    expect(FNB_EVENTS.TABLE_UPDATED).toBe('fnb.table.updated.v1');
  });

  it('has no duplicate event values', () => {
    const values = Object.values(FNB_EVENTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
