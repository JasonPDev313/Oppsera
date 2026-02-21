import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';

describe('Session 3 Events', () => {
  const session3Events = [
    'TAB_OPENED',
    'TAB_UPDATED',
    'TAB_CLOSED',
    'TAB_VOIDED',
    'TAB_TRANSFERRED',
    'TAB_REOPENED',
    'TAB_SPLIT',
    'COURSE_SENT',
    'COURSE_FIRED',
  ] as const;

  it('defines all session 3 events', () => {
    for (const key of session3Events) {
      expect(FNB_EVENTS[key]).toBeDefined();
    }
  });

  it('follows naming convention: fnb.{entity}.{action}.v1', () => {
    for (const key of session3Events) {
      const value = FNB_EVENTS[key];
      expect(value).toMatch(/^fnb\.[a-z]+\.[a-z_]+\.v1$/);
    }
  });

  it('has unique event values', () => {
    const allValues = Object.values(FNB_EVENTS);
    const unique = new Set(allValues);
    expect(unique.size).toBe(allValues.length);
  });

  it('has correct event domains', () => {
    expect(FNB_EVENTS.TAB_OPENED).toBe('fnb.tab.opened.v1');
    expect(FNB_EVENTS.TAB_CLOSED).toBe('fnb.tab.closed.v1');
    expect(FNB_EVENTS.TAB_VOIDED).toBe('fnb.tab.voided.v1');
    expect(FNB_EVENTS.TAB_TRANSFERRED).toBe('fnb.tab.transferred.v1');
    expect(FNB_EVENTS.TAB_REOPENED).toBe('fnb.tab.reopened.v1');
    expect(FNB_EVENTS.TAB_SPLIT).toBe('fnb.tab.split.v1');
    expect(FNB_EVENTS.COURSE_SENT).toBe('fnb.course.sent.v1');
    expect(FNB_EVENTS.COURSE_FIRED).toBe('fnb.course.fired.v1');
  });
});
