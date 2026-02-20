import { describe, it, expect } from 'vitest';
import {
  alignLeft,
  alignRight,
  alignTop,
  alignBottom,
  alignCenterH,
  alignMiddle,
  distributeH,
  distributeV,
} from '../align-utils';
import type { CanvasObject } from '@oppsera/shared';

const SCALE = 20; // scalePxPerFt

const makeObj = (id: string, x: number, y: number, widthFt: number, heightFt: number): CanvasObject => ({
  id,
  type: 'table',
  x,
  y,
  width: widthFt * SCALE,
  height: heightFt * SCALE,
  rotation: 0,
  layerId: 'default',
  zIndex: 0,
  locked: false,
  visible: true,
  name: id,
  properties: {},
  style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
});

describe('Alignment functions', () => {
  const objs = [
    makeObj('a', 2, 3, 2, 2),  // x: 2, right: 4
    makeObj('b', 6, 1, 3, 3),  // x: 6, right: 9
    makeObj('c', 10, 5, 2, 2), // x: 10, right: 12
  ];

  it('alignLeft aligns to leftmost x', () => {
    const result = alignLeft(objs);
    expect(result.every((r) => r.changes.x === 2)).toBe(true);
  });

  it('alignRight aligns to rightmost edge', () => {
    const result = alignRight(objs, SCALE);
    // rightmost edge = 10 + 2 = 12
    expect(result.find((r) => r.id === 'a')!.changes.x).toBe(10); // 12 - 2
    expect(result.find((r) => r.id === 'b')!.changes.x).toBe(9);  // 12 - 3
    expect(result.find((r) => r.id === 'c')!.changes.x).toBe(10); // 12 - 2
  });

  it('alignTop aligns to topmost y', () => {
    const result = alignTop(objs);
    expect(result.every((r) => r.changes.y === 1)).toBe(true);
  });

  it('alignBottom aligns to bottommost edge', () => {
    const result = alignBottom(objs, SCALE);
    // bottommost = 5 + 2 = 7
    expect(result.find((r) => r.id === 'a')!.changes.y).toBe(5); // 7 - 2
    expect(result.find((r) => r.id === 'b')!.changes.y).toBe(4); // 7 - 3
    expect(result.find((r) => r.id === 'c')!.changes.y).toBe(5); // 7 - 2
  });

  it('alignCenterH aligns to average center', () => {
    const result = alignCenterH(objs, SCALE);
    // centers: a=2+1=3, b=6+1.5=7.5, c=10+1=11 → avg = 7.166...
    const avgCenter = (3 + 7.5 + 11) / 3;
    expect(result.find((r) => r.id === 'a')!.changes.x).toBeCloseTo(avgCenter - 1, 5);
    expect(result.find((r) => r.id === 'b')!.changes.x).toBeCloseTo(avgCenter - 1.5, 5);
  });

  it('alignMiddle aligns to average vertical center', () => {
    const result = alignMiddle(objs, SCALE);
    // centers: a=3+1=4, b=1+1.5=2.5, c=5+1=6 → avg = 4.166...
    const avgCenter = (4 + 2.5 + 6) / 3;
    expect(result.find((r) => r.id === 'a')!.changes.y).toBeCloseTo(avgCenter - 1, 5);
    expect(result.find((r) => r.id === 'b')!.changes.y).toBeCloseTo(avgCenter - 1.5, 5);
  });
});

describe('Distribution functions', () => {
  const objs = [
    makeObj('a', 0, 0, 2, 2),
    makeObj('b', 5, 5, 2, 2),
    makeObj('c', 10, 10, 2, 2),
  ];

  it('distributeH distributes with equal spacing', () => {
    const result = distributeH(objs, SCALE);
    // span = (10 + 2) - 0 = 12, objectsWidth = 2+2+2 = 6, gap = (12-6)/2 = 3
    expect(result).toHaveLength(3);
    expect(result[0]!.changes.x).toBe(0);
    expect(result[1]!.changes.x).toBe(5); // 0 + 2 + 3
    expect(result[2]!.changes.x).toBe(10); // 5 + 2 + 3
  });

  it('distributeV distributes with equal spacing', () => {
    const result = distributeV(objs, SCALE);
    // span = (10 + 2) - 0 = 12, objectsHeight = 6, gap = 3
    expect(result).toHaveLength(3);
    expect(result[0]!.changes.y).toBe(0);
    expect(result[1]!.changes.y).toBe(5);
    expect(result[2]!.changes.y).toBe(10);
  });

  it('distributeH returns empty for fewer than 3 objects', () => {
    const result = distributeH(objs.slice(0, 2), SCALE);
    expect(result).toHaveLength(0);
  });
});
