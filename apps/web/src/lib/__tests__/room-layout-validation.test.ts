import { describe, it, expect } from 'vitest';
import {
  validateRoom,
  validateObjects,
  validateForPublish,
  hasErrors,
  hasWarnings,
} from '../room-layout-validation';
import type { CanvasObject } from '@oppsera/shared';

// ── Helper ─────────────────────────────────────────────────────────
function makeTable(overrides: Partial<CanvasObject> = {}): CanvasObject {
  return {
    id: 'tbl-1',
    type: 'table',
    x: 5,
    y: 5,
    width: 60,
    height: 60,
    rotation: 0,
    layerId: 'default',
    zIndex: 0,
    locked: false,
    visible: true,
    name: 'Table 1',
    properties: { tableNumber: 'T1', seats: 4 },
    style: { fill: '#ffffff', stroke: '#000000', strokeWidth: 1, opacity: 1 },
    ...overrides,
  };
}

function makeWall(overrides: Partial<CanvasObject> = {}): CanvasObject {
  return {
    id: 'wall-1',
    type: 'wall',
    x: 0,
    y: 0,
    width: 200,
    height: 10,
    rotation: 0,
    layerId: 'default',
    zIndex: 0,
    locked: false,
    visible: true,
    name: 'Wall 1',
    properties: {},
    style: { fill: '#4b5563', stroke: '#374151', strokeWidth: 1, opacity: 1 },
    ...overrides,
  };
}

// ── Room Validation ────────────────────────────────────────────────

describe('validateRoom', () => {
  const validRoom = { name: 'Main Dining', widthFt: 40, heightFt: 30, gridSizeFt: 1, scalePxPerFt: 20 };

  it('returns no issues for valid room', () => {
    expect(validateRoom(validRoom)).toEqual([]);
  });

  it('requires name', () => {
    const issues = validateRoom({ ...validRoom, name: '' });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe('error');
    expect(issues[0]!.field).toBe('name');
  });

  it('rejects name > 100 chars', () => {
    const issues = validateRoom({ ...validRoom, name: 'a'.repeat(101) });
    expect(hasErrors(issues)).toBe(true);
  });

  it('rejects width < 5', () => {
    const issues = validateRoom({ ...validRoom, widthFt: 3 });
    expect(hasErrors(issues)).toBe(true);
    expect(issues[0]!.field).toBe('widthFt');
  });

  it('rejects width > 500', () => {
    const issues = validateRoom({ ...validRoom, widthFt: 600 });
    expect(hasErrors(issues)).toBe(true);
  });

  it('rejects height < 5', () => {
    const issues = validateRoom({ ...validRoom, heightFt: 2 });
    expect(hasErrors(issues)).toBe(true);
  });

  it('rejects height > 500', () => {
    const issues = validateRoom({ ...validRoom, heightFt: 501 });
    expect(hasErrors(issues)).toBe(true);
  });

  it('rejects grid size < 0.25', () => {
    const issues = validateRoom({ ...validRoom, gridSizeFt: 0.1 });
    expect(hasErrors(issues)).toBe(true);
  });

  it('rejects grid size > 10', () => {
    const issues = validateRoom({ ...validRoom, gridSizeFt: 15 });
    expect(hasErrors(issues)).toBe(true);
  });

  it('rejects scale < 5', () => {
    const issues = validateRoom({ ...validRoom, scalePxPerFt: 2 });
    expect(hasErrors(issues)).toBe(true);
  });

  it('rejects scale > 100', () => {
    const issues = validateRoom({ ...validRoom, scalePxPerFt: 120 });
    expect(hasErrors(issues)).toBe(true);
  });

  it('accepts boundary values', () => {
    const boundary = { name: 'X', widthFt: 5, heightFt: 500, gridSizeFt: 0.25, scalePxPerFt: 100 };
    expect(validateRoom(boundary)).toEqual([]);
  });
});

// ── Object Validation ──────────────────────────────────────────────

describe('validateObjects', () => {
  it('returns no issues for valid objects', () => {
    const issues = validateObjects([makeTable()], 40, 30);
    expect(issues).toEqual([]);
  });

  it('detects duplicate IDs', () => {
    const objects = [makeTable({ id: 'dup' }), makeWall({ id: 'dup' })];
    const issues = validateObjects(objects, 40, 30);
    expect(hasErrors(issues)).toBe(true);
    expect(issues[0]!.message).toContain('Duplicate');
  });

  it('warns when object is outside room bounds', () => {
    const obj = makeTable({ x: 50 }); // widthFt is 40
    const issues = validateObjects([obj], 40, 30);
    expect(hasWarnings(issues)).toBe(true);
    expect(issues[0]!.level).toBe('warning');
    expect(issues[0]!.message).toContain('outside room bounds');
  });

  it('warns when table has no seats', () => {
    const obj = makeTable({ properties: { tableNumber: 'T1' } });
    const issues = validateObjects([obj], 40, 30);
    expect(hasWarnings(issues)).toBe(true);
    expect(issues[0]!.message).toContain('at least 1 seat');
  });

  it('handles empty objects array', () => {
    expect(validateObjects([], 40, 30)).toEqual([]);
  });

  it('accepts valid non-table objects without seat requirement', () => {
    const issues = validateObjects([makeWall()], 40, 30);
    expect(issues).toEqual([]);
  });
});

// ── Publish Validation ─────────────────────────────────────────────

describe('validateForPublish', () => {
  it('errors when no objects', () => {
    const issues = validateForPublish([], 40, 30);
    expect(hasErrors(issues)).toBe(true);
    expect(issues[0]!.message).toContain('at least 1 object');
  });

  it('warns when table has no table number', () => {
    const obj = makeTable({ properties: { seats: 4 } });
    const issues = validateForPublish([obj], 40, 30);
    expect(hasWarnings(issues)).toBe(true);
    expect(issues.some((i) => i.message.includes('no table number'))).toBe(true);
  });

  it('warns when capacity is 0 with tables', () => {
    const obj = makeTable({ properties: { tableNumber: 'T1' } }); // no seats
    const issues = validateForPublish([obj], 40, 30);
    expect(issues.some((i) => i.message.includes('capacity is 0'))).toBe(true);
  });

  it('detects overlapping tables', () => {
    const t1 = makeTable({ id: 't1', x: 5, y: 5, width: 60, height: 60, properties: { tableNumber: 'T1', seats: 4 } });
    const t2 = makeTable({ id: 't2', x: 6, y: 6, width: 60, height: 60, name: 'Table 2', properties: { tableNumber: 'T2', seats: 4 } });
    const issues = validateForPublish([t1, t2], 40, 30);
    expect(issues.some((i) => i.message.includes('overlap'))).toBe(true);
  });

  it('passes for valid layout', () => {
    const t1 = makeTable({ id: 't1', x: 5, y: 5, properties: { tableNumber: 'T1', seats: 4 } });
    const t2 = makeTable({ id: 't2', x: 20, y: 20, name: 'Table 2', properties: { tableNumber: 'T2', seats: 6 } });
    const issues = validateForPublish([t1, t2], 40, 30);
    expect(hasErrors(issues)).toBe(false);
  });

  it('allows non-overlapping tables', () => {
    const t1 = makeTable({ id: 't1', x: 0, y: 0, width: 3, height: 3, properties: { tableNumber: 'T1', seats: 4 } });
    const t2 = makeTable({ id: 't2', x: 10, y: 10, width: 3, height: 3, name: 'Table 2', properties: { tableNumber: 'T2', seats: 4 } });
    const issues = validateForPublish([t1, t2], 40, 30);
    expect(issues.filter((i) => i.message.includes('overlap'))).toHaveLength(0);
  });

  it('includes object validation issues in publish check', () => {
    const objects = [makeTable({ id: 'dup' }), makeWall({ id: 'dup' })];
    const issues = validateForPublish(objects, 40, 30);
    expect(issues.some((i) => i.message.includes('Duplicate'))).toBe(true);
  });
});

// ── Helpers ────────────────────────────────────────────────────────

describe('hasErrors / hasWarnings', () => {
  it('hasErrors returns true for error-level issues', () => {
    expect(hasErrors([{ level: 'error', field: 'x', message: 'err' }])).toBe(true);
  });

  it('hasErrors returns false for warning-only issues', () => {
    expect(hasErrors([{ level: 'warning', field: 'x', message: 'warn' }])).toBe(false);
  });

  it('hasWarnings returns true for warning-level issues', () => {
    expect(hasWarnings([{ level: 'warning', field: 'x', message: 'warn' }])).toBe(true);
  });

  it('hasWarnings returns false for error-only issues', () => {
    expect(hasWarnings([{ level: 'error', field: 'x', message: 'err' }])).toBe(false);
  });

  it('handles empty array', () => {
    expect(hasErrors([])).toBe(false);
    expect(hasWarnings([])).toBe(false);
  });
});
