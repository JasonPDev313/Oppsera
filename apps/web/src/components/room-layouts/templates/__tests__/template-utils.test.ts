import { describe, it, expect } from 'vitest';

// Pure utility tests for template-related logic (no store deps)

describe('Template thumbnail scaling', () => {
  const computeFitScale = (
    roomW: number, roomH: number, scale: number, thumbW: number, thumbH: number,
  ) => {
    const roomPxW = roomW * scale;
    const roomPxH = roomH * scale;
    const scaleX = thumbW / roomPxW;
    const scaleY = thumbH / roomPxH;
    return Math.min(scaleX, scaleY) * 0.9;
  };

  it('scales landscape room to fit thumbnail', () => {
    // 40x30 room at 20px/ft = 800x600px → fit in 200x150
    const fitScale = computeFitScale(40, 30, 20, 200, 150);
    expect(fitScale).toBeCloseTo(0.225, 3); // min(200/800, 150/600) * 0.9 = 0.25 * 0.9
  });

  it('scales portrait room to fit thumbnail', () => {
    // 20x40 room at 20px/ft = 400x800px → fit in 200x150
    const fitScale = computeFitScale(20, 40, 20, 200, 150);
    expect(fitScale).toBeCloseTo(0.16875, 3); // min(200/400, 150/800) * 0.9 = 0.1875 * 0.9
  });

  it('scales square room correctly', () => {
    const fitScale = computeFitScale(30, 30, 20, 200, 150);
    // 600x600 → min(200/600, 150/600) * 0.9 = 0.25 * 0.9
    expect(fitScale).toBeCloseTo(0.225, 3);
  });
});

describe('Template snapshot object count', () => {
  const countObjectsByType = (objects: Array<{ type: string }>) => {
    const counts: Record<string, number> = {};
    for (const obj of objects) {
      counts[obj.type] = (counts[obj.type] ?? 0) + 1;
    }
    return counts;
  };

  it('counts objects by type', () => {
    const objects = [
      { type: 'table' },
      { type: 'table' },
      { type: 'wall' },
      { type: 'door' },
      { type: 'table' },
      { type: 'chair' },
    ];
    expect(countObjectsByType(objects)).toEqual({
      table: 3,
      wall: 1,
      door: 1,
      chair: 1,
    });
  });

  it('handles empty objects', () => {
    expect(countObjectsByType([])).toEqual({});
  });
});

describe('Template capacity calculation', () => {
  const computeCapacity = (objects: Array<{ type: string; properties?: { seats?: number } }>) => {
    return objects.reduce((sum, obj) => {
      if (obj.type === 'table' && obj.properties?.seats) {
        return sum + obj.properties.seats;
      }
      return sum;
    }, 0);
  };

  it('sums seats from tables', () => {
    const objects = [
      { type: 'table', properties: { seats: 4 } },
      { type: 'table', properties: { seats: 6 } },
      { type: 'wall' },
      { type: 'table', properties: { seats: 2 } },
    ];
    expect(computeCapacity(objects)).toBe(12);
  });

  it('ignores non-table objects', () => {
    const objects = [
      { type: 'chair', properties: { seats: 1 } },
      { type: 'wall' },
    ];
    expect(computeCapacity(objects)).toBe(0);
  });

  it('handles tables without seats', () => {
    const objects = [
      { type: 'table', properties: {} },
      { type: 'table', properties: { seats: 4 } },
    ];
    expect(computeCapacity(objects)).toBe(4);
  });
});

describe('Room duplication: new ID generation', () => {
  const reassignIds = <T extends { id: string }>(objects: T[]) => {
    let counter = 0;
    return objects.map((obj) => ({
      ...obj,
      id: `new-${++counter}`,
    }));
  };

  it('generates new IDs for all objects', () => {
    const originals = [
      { id: 'orig-1', type: 'table', x: 5 },
      { id: 'orig-2', type: 'wall', x: 10 },
      { id: 'orig-3', type: 'door', x: 15 },
    ];

    const duplicated = reassignIds(originals);

    // All new IDs
    expect(duplicated.map((o) => o.id)).toEqual(['new-1', 'new-2', 'new-3']);

    // No ID collisions with originals
    const origIds = new Set(originals.map((o) => o.id));
    for (const obj of duplicated) {
      expect(origIds.has(obj.id)).toBe(false);
    }

    // Data preserved
    expect(duplicated[0]!.type).toBe('table');
    expect(duplicated[0]!.x).toBe(5);
  });

  it('ensures no duplicate IDs in result', () => {
    const objects = Array.from({ length: 50 }, (_, i) => ({ id: `old-${i}`, type: 'table' }));
    const duplicated = reassignIds(objects);
    const ids = new Set(duplicated.map((o) => o.id));
    expect(ids.size).toBe(50);
  });
});
