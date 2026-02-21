import { describe, it, expect } from 'vitest';
import { computeSnapshotStats, generateRoomSlug, reassignObjectIds } from '../helpers';

describe('computeSnapshotStats', () => {
  it('returns zero counts for empty snapshot', () => {
    const result = computeSnapshotStats({ formatVersion: 1, objects: [], layers: [], metadata: {} });
    expect(result.objectCount).toBe(0);
    expect(result.totalCapacity).toBe(0);
  });

  it('counts all objects', () => {
    const result = computeSnapshotStats({
      formatVersion: 1,
      objects: [
        { id: '1', type: 'table', properties: { seats: 4 } },
        { id: '2', type: 'wall', properties: {} },
        { id: '3', type: 'table', properties: { seats: 8 } },
      ],
      layers: [],
      metadata: {},
    });
    expect(result.objectCount).toBe(3);
    expect(result.totalCapacity).toBe(12);
  });

  it('handles tables without seats property', () => {
    const result = computeSnapshotStats({
      formatVersion: 1,
      objects: [
        { id: '1', type: 'table', properties: {} },
      ],
      layers: [],
      metadata: {},
    });
    expect(result.totalCapacity).toBe(0);
  });

  it('handles missing objects array', () => {
    const result = computeSnapshotStats({ formatVersion: 1 });
    expect(result.objectCount).toBe(0);
    expect(result.totalCapacity).toBe(0);
  });
});

describe('generateRoomSlug', () => {
  it('converts name to slug', () => {
    expect(generateRoomSlug('Main Dining')).toBe('main-dining');
  });

  it('handles special characters', () => {
    expect(generateRoomSlug("O'Brien's Patio")).toBe('obriens-patio');
  });

  it('trims whitespace', () => {
    expect(generateRoomSlug('  Banquet Hall  ')).toBe('banquet-hall');
  });

  it('handles multiple spaces and special chars', () => {
    expect(generateRoomSlug('Room  #1 (VIP)')).toBe('room-1-vip');
  });
});

describe('reassignObjectIds', () => {
  it('generates new IDs for all objects', () => {
    const snapshot = {
      formatVersion: 1,
      objects: [
        { id: 'old-1', type: 'table', layerId: 'layer-1' },
        { id: 'old-2', type: 'wall', layerId: 'layer-1' },
      ],
      layers: [{ id: 'layer-1', name: 'Main' }],
      metadata: { objectCount: 2 },
    };

    const result = reassignObjectIds(snapshot) as any;

    // Objects have new IDs
    expect(result.objects[0].id).not.toBe('old-1');
    expect(result.objects[1].id).not.toBe('old-2');

    // Object IDs are unique
    expect(result.objects[0].id).not.toBe(result.objects[1].id);

    // Layers have new IDs
    expect(result.layers[0].id).not.toBe('layer-1');

    // Object layerId remapped
    expect(result.objects[0].layerId).toBe(result.layers[0].id);
    expect(result.objects[1].layerId).toBe(result.layers[0].id);
  });

  it('preserves other object properties', () => {
    const snapshot = {
      formatVersion: 1,
      objects: [
        { id: 'old-1', type: 'table', x: 10, y: 20, width: 4, height: 4, layerId: 'layer-1' },
      ],
      layers: [{ id: 'layer-1', name: 'Main', visible: true }],
      metadata: {},
    };

    const result = reassignObjectIds(snapshot) as any;
    expect(result.objects[0].type).toBe('table');
    expect(result.objects[0].x).toBe(10);
    expect(result.objects[0].y).toBe(20);
    expect(result.layers[0].name).toBe('Main');
    expect(result.layers[0].visible).toBe(true);
  });

  it('handles empty snapshot', () => {
    const snapshot = {
      formatVersion: 1,
      objects: [],
      layers: [],
      metadata: {},
    };

    const result = reassignObjectIds(snapshot) as any;
    expect(result.objects).toHaveLength(0);
    expect(result.layers).toHaveLength(0);
  });
});
