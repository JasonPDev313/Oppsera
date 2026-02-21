import { describe, it, expect } from 'vitest';
import { snapToGrid } from '../snap';

describe('snapToGrid', () => {
  it('snaps to nearest grid increment', () => {
    expect(snapToGrid(2.3, 1)).toBe(2);
    expect(snapToGrid(2.7, 1)).toBe(3);
    expect(snapToGrid(2.5, 1)).toBe(3);
  });

  it('snaps with half-foot grid', () => {
    expect(snapToGrid(2.3, 0.5)).toBe(2.5);
    expect(snapToGrid(2.1, 0.5)).toBe(2);
    expect(snapToGrid(2.74, 0.5)).toBe(2.5);
    expect(snapToGrid(2.76, 0.5)).toBe(3);
  });

  it('snaps with quarter-foot grid', () => {
    expect(snapToGrid(2.12, 0.25)).toBe(2.0);
    expect(snapToGrid(2.37, 0.25)).toBe(2.25);
    expect(snapToGrid(2.38, 0.25)).toBe(2.5);
  });

  it('returns exact value when on grid', () => {
    expect(snapToGrid(3, 1)).toBe(3);
    expect(snapToGrid(4.5, 0.5)).toBe(4.5);
  });

  it('handles zero grid size', () => {
    expect(snapToGrid(2.3, 0)).toBe(2.3);
  });

  it('handles negative grid size', () => {
    expect(snapToGrid(2.3, -1)).toBe(2.3);
  });

  it('handles negative values', () => {
    expect(snapToGrid(-2.3, 1)).toBe(-2);
    expect(snapToGrid(-2.7, 1)).toBe(-3);
  });

  it('handles large grid sizes', () => {
    expect(snapToGrid(7, 5)).toBe(5);
    expect(snapToGrid(8, 5)).toBe(10);
  });
});
