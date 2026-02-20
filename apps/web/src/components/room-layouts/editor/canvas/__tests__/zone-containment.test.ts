import { describe, it, expect } from 'vitest';

// Pure utility: check if a table's center point is inside a zone rect
function isTableInZone(
  table: { x: number; y: number; width: number; height: number },
  zone: { x: number; y: number; width: number; height: number },
  scalePxPerFt: number,
): boolean {
  // Table center in feet
  const tableCenterX = table.x + (table.width / scalePxPerFt) / 2;
  const tableCenterY = table.y + (table.height / scalePxPerFt) / 2;

  // Zone bounds in feet
  const zoneLeft = zone.x;
  const zoneRight = zone.x + zone.width / scalePxPerFt;
  const zoneTop = zone.y;
  const zoneBottom = zone.y + zone.height / scalePxPerFt;

  return (
    tableCenterX >= zoneLeft &&
    tableCenterX <= zoneRight &&
    tableCenterY >= zoneTop &&
    tableCenterY <= zoneBottom
  );
}

function getTablesInZone(
  tables: Array<{ id: string; x: number; y: number; width: number; height: number }>,
  zone: { x: number; y: number; width: number; height: number },
  scalePxPerFt: number,
): string[] {
  return tables
    .filter((t) => isTableInZone(t, zone, scalePxPerFt))
    .map((t) => t.id);
}

describe('Service zone containment', () => {
  const scalePxPerFt = 20;

  it('detects table inside zone', () => {
    const table = { id: 't1', x: 5, y: 5, width: 48, height: 48 }; // center: 5+1.2=6.2, 5+1.2=6.2
    const zone = { x: 0, y: 0, width: 200, height: 200 }; // 0-10ft x 0-10ft

    expect(isTableInZone(table, zone, scalePxPerFt)).toBe(true);
  });

  it('detects table outside zone', () => {
    const table = { id: 't1', x: 15, y: 15, width: 48, height: 48 }; // center: 15+1.2=16.2, 15+1.2=16.2
    const zone = { x: 0, y: 0, width: 200, height: 200 }; // 0-10ft x 0-10ft

    expect(isTableInZone(table, zone, scalePxPerFt)).toBe(false);
  });

  it('detects table on zone boundary (center on edge)', () => {
    const table = { id: 't1', x: 10 - 1.2, y: 5, width: 48, height: 48 }; // center: exactly 10, 6.2
    const zone = { x: 0, y: 0, width: 200, height: 200 }; // 0-10ft x 0-10ft

    expect(isTableInZone(table, zone, scalePxPerFt)).toBe(true);
  });

  it('finds all tables in a zone', () => {
    const tables = [
      { id: 't1', x: 2, y: 2, width: 48, height: 48 }, // inside
      { id: 't2', x: 7, y: 7, width: 48, height: 48 }, // inside
      { id: 't3', x: 20, y: 20, width: 48, height: 48 }, // outside
    ];
    const zone = { x: 0, y: 0, width: 200, height: 200 }; // 0-10ft x 0-10ft

    const result = getTablesInZone(tables, zone, scalePxPerFt);
    expect(result).toEqual(['t1', 't2']);
  });

  it('returns empty for zone with no tables', () => {
    const tables = [
      { id: 't1', x: 20, y: 20, width: 48, height: 48 },
    ];
    const zone = { x: 0, y: 0, width: 100, height: 100 }; // 0-5ft x 0-5ft

    const result = getTablesInZone(tables, zone, scalePxPerFt);
    expect(result).toEqual([]);
  });

  it('handles overlapping zones (table in multiple zones)', () => {
    const table = { id: 't1', x: 5, y: 5, width: 48, height: 48 };
    const zone1 = { x: 0, y: 0, width: 200, height: 200 };
    const zone2 = { x: 4, y: 4, width: 100, height: 100 };

    expect(isTableInZone(table, zone1, scalePxPerFt)).toBe(true);
    expect(isTableInZone(table, zone2, scalePxPerFt)).toBe(true);
  });
});

describe('Station marker types', () => {
  const STATION_TYPES = ['pos_terminal', 'wait_station', 'bus_station', 'host_stand', 'bar_station'] as const;

  it('all station types are valid strings', () => {
    for (const t of STATION_TYPES) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it('station types are unique', () => {
    const unique = new Set(STATION_TYPES);
    expect(unique.size).toBe(STATION_TYPES.length);
  });
});

describe('Room mode utilities', () => {
  const validateModeName = (name: string): boolean => {
    if (!name.trim()) return false;
    if (name.length > 50) return false;
    return /^[a-zA-Z0-9_\s-]+$/.test(name);
  };

  it('accepts valid mode names', () => {
    expect(validateModeName('dining')).toBe(true);
    expect(validateModeName('Lunch Service')).toBe(true);
    expect(validateModeName('event-layout')).toBe(true);
    expect(validateModeName('private_party')).toBe(true);
  });

  it('rejects empty mode names', () => {
    expect(validateModeName('')).toBe(false);
    expect(validateModeName('   ')).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(validateModeName('mode/1')).toBe(false);
    expect(validateModeName('mode.test')).toBe(false);
    expect(validateModeName('mode@!')).toBe(false);
  });

  it('rejects names over 50 chars', () => {
    const long = 'a'.repeat(51);
    expect(validateModeName(long)).toBe(false);
  });
});
