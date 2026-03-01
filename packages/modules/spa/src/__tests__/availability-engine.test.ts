import { describe, it, expect, beforeEach } from 'vitest';
import {
  timeToMinutes,
  dateWithMinutes,
  formatDateStr,
  dayStartUtc,
  dayEndUtc,
  enumerateDates,
  subtractWindows,
  generateSlots,
  findAvailableResource,
  BLOCKING_STATUSES,
  type TimeWindow,
  type ResourceRequirement,
  type ResourceInfo,
} from '../helpers/availability-engine';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a UTC Date from an ISO-like string */
function _utc(iso: string): Date {
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z');
}

/** Shorthand to create a TimeWindow from HH:MM strings on a given date */
function tw(dateStr: string, startHM: string, endHM: string): TimeWindow {
  return {
    start: dateWithMinutes(dateStr, timeToMinutes(startHM)),
    end: dateWithMinutes(dateStr, timeToMinutes(endHM)),
  };
}

function makeResource(overrides: Partial<ResourceInfo> = {}): ResourceInfo {
  return {
    id: overrides.id ?? 'res-1',
    name: overrides.name ?? 'Room A',
    resourceType: overrides.resourceType ?? 'treatment_room',
    locationId: overrides.locationId ?? null,
    isActive: overrides.isActive ?? true,
  };
}

function makeRequirement(
  overrides: Partial<ResourceRequirement> = {},
): ResourceRequirement {
  return {
    resourceId: overrides.resourceId ?? null,
    resourceType: overrides.resourceType ?? 'treatment_room',
    quantity: overrides.quantity ?? 1,
    isMandatory: overrides.isMandatory ?? true,
  };
}

// ── timeToMinutes ───────────────────────────────────────────────────────

describe('timeToMinutes', () => {
  it('parses midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('parses noon', () => {
    expect(timeToMinutes('12:00')).toBe(720);
  });

  it('parses end of day', () => {
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('parses single-digit hours', () => {
    expect(timeToMinutes('09:30')).toBe(570);
  });

  it('parses 1:00 AM', () => {
    expect(timeToMinutes('01:00')).toBe(60);
  });

  it('handles 6:45 PM (18:45)', () => {
    expect(timeToMinutes('18:45')).toBe(1125);
  });
});

// ── dateWithMinutes ─────────────────────────────────────────────────────

describe('dateWithMinutes', () => {
  it('creates midnight for 0 minutes', () => {
    const d = dateWithMinutes('2026-03-15', 0);
    expect(d.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('creates 9:00 AM for 540 minutes', () => {
    const d = dateWithMinutes('2026-03-15', 540);
    expect(d.getUTCHours()).toBe(9);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it('creates 14:30 for 870 minutes', () => {
    const d = dateWithMinutes('2026-03-15', 870);
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(30);
  });

  it('creates 23:59 for 1439 minutes', () => {
    const d = dateWithMinutes('2026-03-15', 1439);
    expect(d.getUTCHours()).toBe(23);
    expect(d.getUTCMinutes()).toBe(59);
  });

  it('wraps past midnight into next day for >1440 minutes', () => {
    const d = dateWithMinutes('2026-03-15', 1500); // 25:00 = next day 01:00
    expect(d.getUTCDate()).toBe(16);
    expect(d.getUTCHours()).toBe(1);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

// ── formatDateStr ───────────────────────────────────────────────────────

describe('formatDateStr', () => {
  it('formats a UTC date', () => {
    expect(formatDateStr(new Date('2026-03-15T10:30:00Z'))).toBe('2026-03-15');
  });

  it('formats midnight', () => {
    expect(formatDateStr(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('formats end of day', () => {
    expect(formatDateStr(new Date('2026-12-31T23:59:59.999Z'))).toBe(
      '2026-12-31',
    );
  });
});

// ── dayStartUtc / dayEndUtc ─────────────────────────────────────────────

describe('dayStartUtc', () => {
  it('returns midnight UTC', () => {
    const d = dayStartUtc('2026-03-15');
    expect(d.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });
});

describe('dayEndUtc', () => {
  it('returns 23:59:59.999 UTC', () => {
    const d = dayEndUtc('2026-03-15');
    expect(d.toISOString()).toBe('2026-03-15T23:59:59.999Z');
  });
});

// ── enumerateDates ──────────────────────────────────────────────────────

describe('enumerateDates', () => {
  it('returns a single date when start == end', () => {
    expect(enumerateDates('2026-03-15', '2026-03-15')).toEqual(['2026-03-15']);
  });

  it('returns consecutive dates inclusive', () => {
    expect(enumerateDates('2026-03-13', '2026-03-16')).toEqual([
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
      '2026-03-16',
    ]);
  });

  it('returns empty array when start > end', () => {
    expect(enumerateDates('2026-03-16', '2026-03-13')).toEqual([]);
  });

  it('handles month boundary', () => {
    const result = enumerateDates('2026-01-30', '2026-02-02');
    expect(result).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('handles year boundary', () => {
    const result = enumerateDates('2025-12-30', '2026-01-02');
    expect(result).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('handles leap year Feb 28-29', () => {
    // 2028 is a leap year
    const result = enumerateDates('2028-02-28', '2028-03-01');
    expect(result).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });
});

// ── subtractWindows ─────────────────────────────────────────────────────

describe('subtractWindows', () => {
  const DATE = '2026-03-15';

  it('returns available windows unchanged when no blocks', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const result = subtractWindows(avail, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.start.getTime()).toBe(avail[0]!.start.getTime());
    expect(result[0]!.end.getTime()).toBe(avail[0]!.end.getTime());
  });

  it('returns empty when block covers entire window', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '09:00', '17:00')];
    expect(subtractWindows(avail, blocked)).toHaveLength(0);
  });

  it('returns empty when block is larger than window', () => {
    const avail = [tw(DATE, '10:00', '14:00')];
    const blocked = [tw(DATE, '08:00', '18:00')];
    expect(subtractWindows(avail, blocked)).toHaveLength(0);
  });

  it('splits a window into two when block is in the middle', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '12:00', '13:00')]; // lunch break
    const result = subtractWindows(avail, blocked);

    expect(result).toHaveLength(2);
    // Before block: 09:00 - 12:00
    expect(result[0]!.start.getTime()).toBe(tw(DATE, '09:00', '12:00').start.getTime());
    expect(result[0]!.end.getTime()).toBe(tw(DATE, '09:00', '12:00').end.getTime());
    // After block: 13:00 - 17:00
    expect(result[1]!.start.getTime()).toBe(tw(DATE, '13:00', '17:00').start.getTime());
    expect(result[1]!.end.getTime()).toBe(tw(DATE, '13:00', '17:00').end.getTime());
  });

  it('trims start of window when block overlaps beginning', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '08:00', '10:00')];
    const result = subtractWindows(avail, blocked);

    expect(result).toHaveLength(1);
    expect(result[0]!.start.getTime()).toBe(tw(DATE, '10:00', '17:00').start.getTime());
    expect(result[0]!.end.getTime()).toBe(tw(DATE, '10:00', '17:00').end.getTime());
  });

  it('trims end of window when block overlaps end', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '16:00', '18:00')];
    const result = subtractWindows(avail, blocked);

    expect(result).toHaveLength(1);
    expect(result[0]!.start.getTime()).toBe(tw(DATE, '09:00', '16:00').start.getTime());
    expect(result[0]!.end.getTime()).toBe(tw(DATE, '09:00', '16:00').end.getTime());
  });

  it('leaves window unchanged when block is entirely before', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '07:00', '08:00')];
    const result = subtractWindows(avail, blocked);

    expect(result).toHaveLength(1);
    expect(result[0]!.start.getTime()).toBe(avail[0]!.start.getTime());
  });

  it('leaves window unchanged when block is entirely after', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '18:00', '20:00')];
    const result = subtractWindows(avail, blocked);

    expect(result).toHaveLength(1);
    expect(result[0]!.end.getTime()).toBe(avail[0]!.end.getTime());
  });

  it('handles multiple blocks that divide a window into three parts', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [
      tw(DATE, '10:00', '10:30'), // 30 min break
      tw(DATE, '14:00', '14:30'), // another 30 min break
    ];
    const result = subtractWindows(avail, blocked);

    expect(result).toHaveLength(3);
    // 09:00-10:00, 10:30-14:00, 14:30-17:00
    expect(result[0]!.end.getTime()).toBe(dateWithMinutes(DATE, 600).getTime()); // 10:00
    expect(result[1]!.start.getTime()).toBe(dateWithMinutes(DATE, 630).getTime()); // 10:30
    expect(result[1]!.end.getTime()).toBe(dateWithMinutes(DATE, 840).getTime()); // 14:00
    expect(result[2]!.start.getTime()).toBe(dateWithMinutes(DATE, 870).getTime()); // 14:30
  });

  it('handles multiple available windows with one block', () => {
    const avail = [
      tw(DATE, '09:00', '12:00'),
      tw(DATE, '13:00', '17:00'),
    ];
    // Block that overlaps end of first window and start of second
    const blocked = [tw(DATE, '11:30', '13:30')];
    const result = subtractWindows(avail, blocked);

    expect(result).toHaveLength(2);
    // First window trimmed: 09:00-11:30
    expect(result[0]!.end.getTime()).toBe(dateWithMinutes(DATE, 690).getTime());
    // Second window trimmed: 13:30-17:00
    expect(result[1]!.start.getTime()).toBe(dateWithMinutes(DATE, 810).getTime());
  });

  it('handles adjacent blocks (no gap)', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [
      tw(DATE, '09:00', '12:00'),
      tw(DATE, '12:00', '17:00'),
    ];
    const result = subtractWindows(avail, blocked);
    expect(result).toHaveLength(0);
  });

  it('handles block ending at window start (no overlap)', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '08:00', '09:00')]; // ends exactly at window start
    const result = subtractWindows(avail, blocked);

    // [start, end) semantics: block.end == window.start means no overlap
    expect(result).toHaveLength(1);
    expect(result[0]!.start.getTime()).toBe(avail[0]!.start.getTime());
  });

  it('handles block starting at window end (no overlap)', () => {
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '17:00', '18:00')]; // starts exactly at window end
    const result = subtractWindows(avail, blocked);

    expect(result).toHaveLength(1);
    expect(result[0]!.end.getTime()).toBe(avail[0]!.end.getTime());
  });

  it('returns empty array for empty available windows', () => {
    expect(subtractWindows([], [tw(DATE, '09:00', '17:00')])).toHaveLength(0);
  });
});

// ── generateSlots ───────────────────────────────────────────────────────

describe('generateSlots', () => {
  const DATE = '2026-03-15';

  it('generates 15-min interval slots for a 60-min service in a 4-hour window', () => {
    const windows = [tw(DATE, '09:00', '13:00')]; // 4 hours = 240 min
    const slots = generateSlots(windows, 60, 15);

    // First slot: 09:00-10:00, last slot: 12:00-13:00
    // Cursor starts at 09:00, increments by 15 min
    // Valid starts: 09:00, 09:15, 09:30, 09:45, 10:00, ..., 12:00
    // 12:00 + 60 min = 13:00 <= 13:00 => valid
    // 12:15 + 60 min = 13:15 > 13:00 => invalid
    // Count: (12:00 - 09:00) / 15 + 1 = 180 / 15 + 1 = 13
    expect(slots).toHaveLength(13);
    expect(slots[0]!.start.getUTCHours()).toBe(9);
    expect(slots[0]!.start.getUTCMinutes()).toBe(0);
    expect(slots[slots.length - 1]!.start.getUTCHours()).toBe(12);
    expect(slots[slots.length - 1]!.start.getUTCMinutes()).toBe(0);
  });

  it('generates 30-min interval slots for a 60-min service', () => {
    const windows = [tw(DATE, '09:00', '13:00')];
    const slots = generateSlots(windows, 60, 30);

    // Valid starts: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00
    expect(slots).toHaveLength(7);
  });

  it('returns empty when window is shorter than service duration', () => {
    const windows = [tw(DATE, '09:00', '09:30')]; // 30 min window
    const slots = generateSlots(windows, 60, 15); // 60 min service
    expect(slots).toHaveLength(0);
  });

  it('returns exactly one slot when window matches duration exactly', () => {
    const windows = [tw(DATE, '09:00', '10:00')]; // 60 min
    const slots = generateSlots(windows, 60, 15);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.start.getUTCHours()).toBe(9);
    expect(slots[0]!.end.getUTCHours()).toBe(10);
  });

  it('generates slots across multiple windows', () => {
    const windows = [
      tw(DATE, '09:00', '10:00'), // 1 hour
      tw(DATE, '14:00', '15:00'), // 1 hour
    ];
    const slots = generateSlots(windows, 30, 30);

    // Each window fits 2 slots of 30 min at 30 min interval
    // Window 1: 09:00-09:30, 09:30-10:00
    // Window 2: 14:00-14:30, 14:30-15:00
    expect(slots).toHaveLength(4);
    expect(slots[0]!.start.getUTCHours()).toBe(9);
    expect(slots[2]!.start.getUTCHours()).toBe(14);
  });

  it('returns empty for empty windows array', () => {
    expect(generateSlots([], 60, 15)).toHaveLength(0);
  });

  it('slot end time equals start + duration', () => {
    const windows = [tw(DATE, '09:00', '17:00')];
    const slots = generateSlots(windows, 90, 30); // 90 min service

    for (const slot of slots) {
      const durationMs = slot.end.getTime() - slot.start.getTime();
      expect(durationMs).toBe(90 * 60_000);
    }
  });

  it('handles interval larger than duration', () => {
    const windows = [tw(DATE, '09:00', '13:00')]; // 4 hours
    const slots = generateSlots(windows, 30, 60); // 30 min service, 60 min intervals

    // Starts: 09:00, 10:00, 11:00, 12:00 (12:00 + 30 = 12:30 <= 13:00)
    // 13:00 + 30 = 13:30 > 13:00 => invalid
    expect(slots).toHaveLength(4);
  });

  it('handles interval equal to duration', () => {
    const windows = [tw(DATE, '09:00', '11:00')]; // 2 hours
    const slots = generateSlots(windows, 60, 60); // 60 min service, 60 min interval

    // 09:00-10:00, 10:00-11:00
    expect(slots).toHaveLength(2);
  });

  it('handles very small intervals (5 min)', () => {
    const windows = [tw(DATE, '09:00', '09:30')]; // 30 min window
    const slots = generateSlots(windows, 15, 5); // 15 min service, 5 min intervals

    // Starts: 09:00, 09:05, 09:10, 09:15
    // 09:15 + 15 = 09:30 <= 09:30 => valid
    // 09:20 + 15 = 09:35 > 09:30 => invalid
    expect(slots).toHaveLength(4);
  });
});

// ── findAvailableResource ───────────────────────────────────────────────

describe('findAvailableResource', () => {
  const DATE = '2026-03-15';
  let slot: TimeWindow;

  beforeEach(() => {
    slot = tw(DATE, '10:00', '11:00');
  });

  it('returns first free resource when one is available', () => {
    const requirements = [makeRequirement({ resourceType: 'treatment_room' })];
    const resources = [
      makeResource({ id: 'room-1', name: 'Room 1' }),
      makeResource({ id: 'room-2', name: 'Room 2' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-1');
  });

  it('returns null when all resources are busy', () => {
    const requirements = [makeRequirement({ resourceType: 'treatment_room' })];
    const resources = [makeResource({ id: 'room-1' })];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    // Room is booked during the slot
    appointmentsByResource.set('room-1', [tw(DATE, '09:30', '10:30')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).toBeNull();
  });

  it('returns the second resource when first is busy', () => {
    const requirements = [makeRequirement({ resourceType: 'treatment_room' })];
    const resources = [
      makeResource({ id: 'room-1', name: 'Room 1' }),
      makeResource({ id: 'room-2', name: 'Room 2' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    appointmentsByResource.set('room-1', [tw(DATE, '10:00', '11:00')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-2');
  });

  it('returns null when not enough resources for quantity requirement', () => {
    const requirements = [
      makeRequirement({ resourceType: 'treatment_room', quantity: 2 }),
    ];
    const resources = [
      makeResource({ id: 'room-1' }),
      makeResource({ id: 'room-2' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    // Both rooms busy
    appointmentsByResource.set('room-1', [tw(DATE, '10:00', '11:00')]);
    appointmentsByResource.set('room-2', [tw(DATE, '10:00', '11:00')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).toBeNull();
  });

  it('returns resource when quantity=2 and 2 are free', () => {
    const requirements = [
      makeRequirement({ resourceType: 'treatment_room', quantity: 2 }),
    ];
    const resources = [
      makeResource({ id: 'room-1', name: 'Room 1' }),
      makeResource({ id: 'room-2', name: 'Room 2' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-1');
  });

  it('skips non-mandatory requirements for null result', () => {
    // Only non-mandatory requirements, no matching resources
    const requirements = [
      makeRequirement({ resourceType: 'hot_tub', isMandatory: false }),
    ];
    const resources: ResourceInfo[] = []; // No matching resources

    const result = findAvailableResource(
      requirements,
      resources,
      new Map(),
      slot,
    );

    // No mandatory requirements, no matching optional resources
    expect(result).toBeNull();
  });

  it('filters resources by specific resourceId', () => {
    const requirements = [
      makeRequirement({ resourceId: 'room-specific', resourceType: null }),
    ];
    const resources = [
      makeResource({ id: 'room-1', name: 'Room 1' }),
      makeResource({ id: 'room-specific', name: 'VIP Room' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-specific');
    expect(result!.name).toBe('VIP Room');
  });

  it('returns null when specific resource is busy', () => {
    const requirements = [
      makeRequirement({ resourceId: 'room-specific', resourceType: null }),
    ];
    const resources = [
      makeResource({ id: 'room-specific', name: 'VIP Room' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    appointmentsByResource.set('room-specific', [tw(DATE, '09:00', '11:30')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).toBeNull();
  });

  it('considers resource free when existing appointment ends before slot', () => {
    const requirements = [makeRequirement({ resourceType: 'treatment_room' })];
    const resources = [makeResource({ id: 'room-1', name: 'Room 1' })];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    // Appointment ends at slot start (no overlap per [start, end))
    appointmentsByResource.set('room-1', [tw(DATE, '08:00', '10:00')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-1');
  });

  it('considers resource free when existing appointment starts at slot end', () => {
    const requirements = [makeRequirement({ resourceType: 'treatment_room' })];
    const resources = [makeResource({ id: 'room-1', name: 'Room 1' })];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    // Appointment starts exactly when slot ends
    appointmentsByResource.set('room-1', [tw(DATE, '11:00', '12:00')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).not.toBeNull();
  });

  it('considers resource busy when appointment overlaps slot by 1 minute', () => {
    const requirements = [makeRequirement({ resourceType: 'treatment_room' })];
    const resources = [makeResource({ id: 'room-1' })];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    // Overlaps slot end by 1 minute
    appointmentsByResource.set('room-1', [tw(DATE, '10:59', '12:00')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).toBeNull();
  });

  it('handles non-mandatory resource with optional match', () => {
    const requirements = [
      makeRequirement({
        resourceType: 'treatment_room',
        isMandatory: false,
      }),
    ];
    const resources = [makeResource({ id: 'room-1', name: 'Room 1' })];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    // Non-mandatory, but a matching free resource exists — returns it
    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-1');
  });

  it('handles mixed mandatory and non-mandatory requirements', () => {
    const requirements = [
      makeRequirement({
        resourceType: 'treatment_room',
        isMandatory: true,
        quantity: 1,
      }),
      makeRequirement({
        resourceType: 'hot_tub',
        isMandatory: false,
        quantity: 1,
      }),
    ];
    const resources = [
      makeResource({ id: 'room-1', name: 'Room 1', resourceType: 'treatment_room' }),
      // No hot_tub resources
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    // Mandatory requirement (treatment_room) is satisfied, non-mandatory (hot_tub) has no candidates
    // The function returns the mandatory match
    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-1');
  });

  it('returns null when mandatory requirement has no matching resource type', () => {
    const requirements = [
      makeRequirement({ resourceType: 'sauna', isMandatory: true }),
    ];
    const resources = [
      makeResource({ id: 'room-1', resourceType: 'treatment_room' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    // No 'sauna' type resource exists
    expect(result).toBeNull();
  });

  it('handles empty requirements array', () => {
    const resources = [makeResource({ id: 'room-1' })];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      [],
      resources,
      appointmentsByResource,
      slot,
    );

    // No requirements at all — null (no resource needed)
    expect(result).toBeNull();
  });

  it('handles multiple busy time windows on same resource', () => {
    const requirements = [makeRequirement({ resourceType: 'treatment_room' })];
    const resources = [makeResource({ id: 'room-1' })];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    // Multiple non-overlapping appointments on same resource
    appointmentsByResource.set('room-1', [
      tw(DATE, '08:00', '09:00'),
      tw(DATE, '10:30', '11:30'), // overlaps with slot 10:00-11:00
    ]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    expect(result).toBeNull();
  });
});

// ── BLOCKING_STATUSES ───────────────────────────────────────────────────

describe('BLOCKING_STATUSES', () => {
  it('includes all appointment statuses that should block slots', () => {
    expect(BLOCKING_STATUSES).toContain('draft');
    expect(BLOCKING_STATUSES).toContain('reserved');
    expect(BLOCKING_STATUSES).toContain('confirmed');
    expect(BLOCKING_STATUSES).toContain('checked_in');
    expect(BLOCKING_STATUSES).toContain('in_service');
    expect(BLOCKING_STATUSES).toContain('completed');
    expect(BLOCKING_STATUSES).toContain('checked_out');
  });

  it('does not include canceled or no_show', () => {
    expect(BLOCKING_STATUSES).not.toContain('canceled');
    expect(BLOCKING_STATUSES).not.toContain('no_show');
  });
});

// ── Integration-style tests: subtractWindows + generateSlots ────────────

describe('subtractWindows + generateSlots integration', () => {
  const DATE = '2026-03-15';

  it('generates correct slots after subtracting an appointment block', () => {
    // Provider available 09:00-17:00
    let windows: TimeWindow[] = [tw(DATE, '09:00', '17:00')];

    // Existing appointment from 10:00-11:00 with 15 min buffer
    const apptBlocks: TimeWindow[] = [tw(DATE, '09:45', '11:15')]; // 10:00-11:00 + 15 min each side

    windows = subtractWindows(windows, apptBlocks);
    // Should be: 09:00-09:45, 11:15-17:00

    expect(windows).toHaveLength(2);

    // Generate 60-min service slots at 15-min intervals
    const slots = generateSlots(windows, 60, 15);

    // First window (09:00-09:45): too short for 60-min service => 0 slots
    // Second window (11:15-17:00): 345 min
    // First valid: 11:15, last valid: 16:00 (16:00+60=17:00)
    // Count: (16:00-11:15)/15 + 1 = 285/15 + 1 = 20
    expect(slots).toHaveLength(20);
    expect(slots[0]!.start.getUTCHours()).toBe(11);
    expect(slots[0]!.start.getUTCMinutes()).toBe(15);
  });

  it('subtracting time-off for full day yields no slots', () => {
    let windows: TimeWindow[] = [tw(DATE, '09:00', '17:00')];
    const timeOff: TimeWindow[] = [
      { start: dayStartUtc(DATE), end: dayEndUtc(DATE) },
    ];

    windows = subtractWindows(windows, timeOff);
    expect(windows).toHaveLength(0);

    const slots = generateSlots(windows, 60, 15);
    expect(slots).toHaveLength(0);
  });

  it('handles split shift with lunch break and two appointments', () => {
    // Morning: 09:00-12:00, Afternoon: 13:00-17:00
    let windows: TimeWindow[] = [
      tw(DATE, '09:00', '12:00'),
      tw(DATE, '13:00', '17:00'),
    ];

    // Two existing appointments with 0-min buffer
    const apptBlocks: TimeWindow[] = [
      tw(DATE, '09:00', '10:00'), // morning appt
      tw(DATE, '15:00', '16:00'), // afternoon appt
    ];

    windows = subtractWindows(windows, apptBlocks);
    // Should be: 10:00-12:00, 13:00-15:00, 16:00-17:00

    expect(windows).toHaveLength(3);

    // 30-min service at 30-min intervals
    const slots = generateSlots(windows, 30, 30);

    // Window 10:00-12:00 (120 min): starts 10:00, 10:30, 11:00, 11:30 => 4 slots
    // Window 13:00-15:00 (120 min): starts 13:00, 13:30, 14:00, 14:30 => 4 slots
    // Window 16:00-17:00 (60 min): starts 16:00, 16:30 => 2 slots
    expect(slots).toHaveLength(10);
  });

  it('no slots when all available time is consumed by appointments', () => {
    let windows: TimeWindow[] = [tw(DATE, '09:00', '11:00')];

    // Two back-to-back appointments fill the entire window
    const apptBlocks: TimeWindow[] = [
      tw(DATE, '09:00', '10:00'),
      tw(DATE, '10:00', '11:00'),
    ];

    windows = subtractWindows(windows, apptBlocks);
    expect(windows).toHaveLength(0);

    const slots = generateSlots(windows, 30, 15);
    expect(slots).toHaveLength(0);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('midnight-crossing availability window handles correctly with dateWithMinutes', () => {
    // A provider works late: dateWithMinutes with >1440 crosses into next day
    const d = dateWithMinutes('2026-03-15', 1500); // 1500 min = 25:00 = next day 01:00
    expect(d.getUTCDate()).toBe(16);
    expect(d.getUTCHours()).toBe(1);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it('generateSlots with 1-minute service at 1-minute interval', () => {
    const DATE = '2026-03-15';
    const windows = [tw(DATE, '10:00', '10:05')]; // 5 min window
    const slots = generateSlots(windows, 1, 1);
    expect(slots).toHaveLength(5); // 10:00, 10:01, 10:02, 10:03, 10:04
  });

  it('generateSlots where interval causes last slot to not fit', () => {
    const DATE = '2026-03-15';
    const windows = [tw(DATE, '09:00', '10:00')]; // 60 min
    const slots = generateSlots(windows, 45, 30); // 45 min service, 30 min interval

    // 09:00 + 45 = 09:45 <= 10:00 => valid
    // 09:30 + 45 = 10:15 > 10:00 => invalid
    expect(slots).toHaveLength(1);
  });

  it('subtractWindows with zero-length block splits into two contiguous windows', () => {
    const DATE = '2026-03-15';
    const avail = [tw(DATE, '09:00', '17:00')];
    const blocked = [tw(DATE, '12:00', '12:00')]; // zero-length
    const result = subtractWindows(avail, blocked);

    // Zero-length block at 12:00 is treated as overlapping (start < end and end > start
    // of the window). It splits into two contiguous windows:
    // block.start(12:00) > window.start(09:00) => before piece 09:00-12:00
    // block.end(12:00) < window.end(17:00) => after piece 12:00-17:00
    expect(result).toHaveLength(2);
    expect(result[0]!.end.getTime()).toBe(result[1]!.start.getTime());
    expect(result[0]!.start.getTime()).toBe(dateWithMinutes(DATE, 540).getTime()); // 09:00
    expect(result[0]!.end.getTime()).toBe(dateWithMinutes(DATE, 720).getTime()); // 12:00
    expect(result[1]!.start.getTime()).toBe(dateWithMinutes(DATE, 720).getTime()); // 12:00
    expect(result[1]!.end.getTime()).toBe(dateWithMinutes(DATE, 1020).getTime()); // 17:00
  });

  it('enumerateDates handles a full week', () => {
    const result = enumerateDates('2026-03-09', '2026-03-15');
    expect(result).toHaveLength(7);
  });

  it('timeToMinutes handles 00:01', () => {
    expect(timeToMinutes('00:01')).toBe(1);
  });

  it('formatDateStr preserves leading zeros', () => {
    const d = new Date('2026-01-05T00:00:00Z');
    expect(formatDateStr(d)).toBe('2026-01-05');
  });
});

// ── Resource conflict scenarios ─────────────────────────────────────────

describe('resource conflict scenarios', () => {
  const DATE = '2026-03-15';
  const slot = tw(DATE, '10:00', '11:00');

  it('returns first mandatory match even when later mandatory requirements have no candidates', () => {
    // NOTE: findAvailableResource processes mandatory requirements sequentially
    // and returns immediately when the first is satisfied. This means subsequent
    // mandatory requirements are NOT validated. This is a known behavior — the
    // function returns the first free resource for the first satisfied requirement.
    const requirements = [
      makeRequirement({
        resourceType: 'treatment_room',
        isMandatory: true,
        quantity: 1,
      }),
      makeRequirement({
        resourceType: 'massage_table',
        isMandatory: true,
        quantity: 1,
      }),
    ];
    const resources = [
      makeResource({ id: 'room-1', resourceType: 'treatment_room' }),
      // No massage_table resources
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    // First mandatory (treatment_room) is satisfied and returns immediately
    // The function does NOT check the second mandatory requirement
    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-1');
  });

  it('returns null when first mandatory requirement has no candidates', () => {
    // When the first mandatory requirement fails, null is returned immediately
    // without checking later requirements
    const requirements = [
      makeRequirement({
        resourceType: 'massage_table',
        isMandatory: true,
        quantity: 1,
      }),
      makeRequirement({
        resourceType: 'treatment_room',
        isMandatory: true,
        quantity: 1,
      }),
    ];
    const resources = [
      makeResource({ id: 'room-1', resourceType: 'treatment_room' }),
      // No massage_table resources
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    // First mandatory (massage_table) has 0 matching candidates => freeCount=0 < quantity=1
    expect(result).toBeNull();
  });

  it('resource with appointment that ends exactly when slot starts', () => {
    const requirements = [makeRequirement({ resourceType: 'treatment_room' })];
    const resources = [makeResource({ id: 'room-1', name: 'Room 1' })];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    appointmentsByResource.set('room-1', [tw(DATE, '09:00', '10:00')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    // [start, end) semantics: 09:00-10:00 does not overlap 10:00-11:00
    expect(result).not.toBeNull();
  });

  it('quantity=3 with only 2 free resources returns null', () => {
    const requirements = [
      makeRequirement({ resourceType: 'treatment_room', quantity: 3 }),
    ];
    const resources = [
      makeResource({ id: 'room-1', resourceType: 'treatment_room' }),
      makeResource({ id: 'room-2', resourceType: 'treatment_room' }),
      makeResource({ id: 'room-3', resourceType: 'treatment_room' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    appointmentsByResource.set('room-1', [tw(DATE, '10:00', '11:00')]);

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    // room-1 busy, room-2 and room-3 free => freeCount=2, need 3
    expect(result).toBeNull();
  });

  it('quantity=2 with exactly 2 free resources returns first free', () => {
    const requirements = [
      makeRequirement({ resourceType: 'treatment_room', quantity: 2 }),
    ];
    const resources = [
      makeResource({ id: 'room-1', name: 'Room 1', resourceType: 'treatment_room' }),
      makeResource({ id: 'room-2', name: 'Room 2', resourceType: 'treatment_room' }),
      makeResource({ id: 'room-3', name: 'Room 3', resourceType: 'treatment_room' }),
    ];
    const appointmentsByResource = new Map<string, TimeWindow[]>();
    appointmentsByResource.set('room-1', [tw(DATE, '10:00', '11:00')]); // busy

    const result = findAvailableResource(
      requirements,
      resources,
      appointmentsByResource,
      slot,
    );

    // room-2 and room-3 free => freeCount=2, need 2 => returns first free (room-2)
    expect(result).not.toBeNull();
    expect(result!.id).toBe('room-2');
  });
});

// ── Service duration composition ────────────────────────────────────────

describe('service duration composition (setup + service + cleanup)', () => {
  const DATE = '2026-03-15';

  it('total duration includes setup and cleanup', () => {
    // setup=10, service=60, cleanup=5 => total=75 min
    const windows = [tw(DATE, '09:00', '12:00')]; // 180 min
    const totalDuration = 10 + 60 + 5; // 75 min
    const slots = generateSlots(windows, totalDuration, 15);

    // Each slot is 75 min. Last valid start:
    // 12:00 - 75 min = 10:45 => valid starts: 09:00 to 10:45 at 15 min intervals
    // (10:45 - 09:00) / 15 + 1 = 105/15 + 1 = 8
    expect(slots).toHaveLength(8);

    // Verify each slot is 75 minutes
    for (const s of slots) {
      expect(s.end.getTime() - s.start.getTime()).toBe(75 * 60_000);
    }
  });

  it('buffer time extends appointment blocks when subtracting', () => {
    let windows: TimeWindow[] = [tw(DATE, '09:00', '17:00')];

    // Appointment from 12:00-13:00 with 15 min buffer
    const bufferMs = 15 * 60_000;
    const apptBlocks: TimeWindow[] = [
      {
        start: new Date(dateWithMinutes(DATE, 720).getTime() - bufferMs), // 11:45
        end: new Date(dateWithMinutes(DATE, 780).getTime() + bufferMs), // 13:15
      },
    ];

    windows = subtractWindows(windows, apptBlocks);

    expect(windows).toHaveLength(2);
    // Before: 09:00 - 11:45
    expect(windows[0]!.end.getUTCHours()).toBe(11);
    expect(windows[0]!.end.getUTCMinutes()).toBe(45);
    // After: 13:15 - 17:00
    expect(windows[1]!.start.getUTCHours()).toBe(13);
    expect(windows[1]!.start.getUTCMinutes()).toBe(15);
  });
});
