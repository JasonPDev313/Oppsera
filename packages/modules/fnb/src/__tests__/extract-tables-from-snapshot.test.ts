import { describe, it, expect } from 'vitest';
import { extractTablesFromSnapshot } from '../helpers/extract-tables-from-snapshot';

describe('extractTablesFromSnapshot', () => {
  const makeSnapshot = (objects: any[]) => ({
    formatVersion: 1,
    objects,
    layers: [{ id: 'default', name: 'Main', visible: true, locked: false, sortOrder: 0 }],
    metadata: { lastEditedAt: '2026-01-01T00:00:00Z', lastEditedBy: 'user1', objectCount: objects.length, totalCapacity: 0 },
  });

  it('extracts table objects from snapshot', () => {
    const snapshot = makeSnapshot([
      {
        id: 'obj-1',
        type: 'table',
        x: 5,
        y: 10,
        width: 100,
        height: 100,
        rotation: 0,
        name: 'Table 1',
        properties: {
          tableNumber: '1',
          shape: 'round',
          seats: 4,
          minSeats: 2,
          maxSeats: 6,
          isJoinable: true,
        },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default',
        zIndex: 0,
        locked: false,
        visible: true,
      },
      {
        id: 'obj-2',
        type: 'table',
        x: 15,
        y: 20,
        width: 80,
        height: 120,
        rotation: 45,
        name: 'Table 2',
        properties: {
          tableNumber: '2',
          shape: 'rectangle',
          seats: 8,
          minSeats: 4,
          maxSeats: 10,
          isJoinable: false,
        },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default',
        zIndex: 1,
        locked: false,
        visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);

    expect(tables).toHaveLength(2);

    expect(tables[0]).toEqual({
      floorPlanObjectId: 'obj-1',
      tableNumber: 1,
      displayLabel: 'Table 1',
      capacityMin: 2,
      capacityMax: 6,
      shape: 'round',
      isCombinable: true,
      positionX: 5,
      positionY: 10,
      width: 100,
      height: 100,
      rotation: 0,
    });

    expect(tables[1]).toEqual({
      floorPlanObjectId: 'obj-2',
      tableNumber: 2,
      displayLabel: 'Table 2',
      capacityMin: 4,
      capacityMax: 10,
      shape: 'rectangle',
      isCombinable: false,
      positionX: 15,
      positionY: 20,
      width: 80,
      height: 120,
      rotation: 45,
    });
  });

  it('filters out non-table objects', () => {
    const snapshot = makeSnapshot([
      {
        id: 'wall-1',
        type: 'wall',
        x: 0, y: 0, width: 200, height: 10, rotation: 0,
        name: 'Wall',
        properties: {},
        style: { fill: '#333', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
      {
        id: 'tbl-1',
        type: 'table',
        x: 5, y: 5, width: 60, height: 60, rotation: 0,
        name: 'Table 1',
        properties: { tableNumber: '1', seats: 4, shape: 'square' },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 1, locked: false, visible: true,
      },
      {
        id: 'door-1',
        type: 'door',
        x: 0, y: 50, width: 30, height: 5, rotation: 0,
        name: 'Main Door',
        properties: {},
        style: { fill: '#8B4513', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 2, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.floorPlanObjectId).toBe('tbl-1');
  });

  it('handles empty snapshot', () => {
    const tables = extractTablesFromSnapshot({ formatVersion: 1, objects: [], layers: [], metadata: {} });
    expect(tables).toEqual([]);
  });

  it('handles missing objects array', () => {
    const tables = extractTablesFromSnapshot({} as any);
    expect(tables).toEqual([]);
  });

  it('auto-assigns table numbers when missing', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-no-num',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'Unnamed',
        properties: { seats: 4, shape: 'round' },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.tableNumber).toBe(1);
    expect(tables[0]!.displayLabel).toBe('Unnamed');
  });

  it('auto-assigns numbers that skip explicit numbers', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-explicit',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'Table 1',
        properties: { tableNumber: '1', seats: 4, shape: 'round' },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
      {
        id: 'tbl-auto',
        type: 'table',
        x: 100, y: 0, width: 60, height: 60, rotation: 0,
        name: '',
        properties: { seats: 4, shape: 'round' },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 1, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables).toHaveLength(2);
    expect(tables[0]!.tableNumber).toBe(1); // explicit
    expect(tables[1]!.tableNumber).toBe(2); // auto-assigned, skipped 1
    expect(tables[1]!.displayLabel).toBe('Table 2');
  });

  it('normalizes shape names', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-1',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'T1',
        properties: { tableNumber: '1', shape: 'circle', seats: 4 },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
      {
        id: 'tbl-2',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'T2',
        properties: { tableNumber: '2', shape: 'rect', seats: 6 },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 1, locked: false, visible: true,
      },
      {
        id: 'tbl-3',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'T3',
        properties: { tableNumber: '3', shape: 'ellipse', seats: 4 },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 2, locked: false, visible: true,
      },
      {
        id: 'tbl-4',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'T4',
        properties: { tableNumber: '4', shape: 'hexagon', seats: 6 },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 3, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables[0]!.shape).toBe('round');     // circle → round
    expect(tables[1]!.shape).toBe('rectangle');  // rect → rectangle
    expect(tables[2]!.shape).toBe('oval');       // ellipse → oval
    expect(tables[3]!.shape).toBe('square');     // unknown → square (default)
  });

  it('defaults capacityMin to 1', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-1',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'Table 1',
        properties: { tableNumber: '1', seats: 8, shape: 'round', minSeats: 0 },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables[0]!.capacityMin).toBe(1); // min capped at 1
  });

  it('uses seats as fallback for maxSeats', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-1',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'Table 1',
        properties: { tableNumber: '1', seats: 6, shape: 'round' },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables[0]!.capacityMax).toBe(6);
  });

  it('uses object name as fallback displayLabel', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-1',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'VIP Booth',
        properties: { tableNumber: '10', seats: 4, shape: 'square' },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables[0]!.displayLabel).toBe('VIP Booth');
  });

  it('generates displayLabel when name is empty', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-1',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: '',
        properties: { tableNumber: '7', seats: 4, shape: 'square' },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables[0]!.displayLabel).toBe('Table 7');
  });

  it('defaults isCombinable to true when isJoinable is undefined', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-1',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'T1',
        properties: { tableNumber: '1', seats: 4, shape: 'round' },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables[0]!.isCombinable).toBe(true);
  });

  it('respects isJoinable=false', () => {
    const snapshot = makeSnapshot([
      {
        id: 'tbl-1',
        type: 'table',
        x: 0, y: 0, width: 60, height: 60, rotation: 0,
        name: 'T1',
        properties: { tableNumber: '1', seats: 4, shape: 'round', isJoinable: false },
        style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
        layerId: 'default', zIndex: 0, locked: false, visible: true,
      },
    ]);

    const tables = extractTablesFromSnapshot(snapshot);
    expect(tables[0]!.isCombinable).toBe(false);
  });
});
