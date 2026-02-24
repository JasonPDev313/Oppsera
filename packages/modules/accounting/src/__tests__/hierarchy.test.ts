/**
 * Hierarchy Helpers Tests
 *
 * Tests for GL account hierarchy computation: depth, materialized path,
 * circular reference detection, and descendant traversal.
 */

import { describe, it, expect } from 'vitest';
import {
  computeDepth,
  computePath,
  detectCircularReference,
  getDescendants,
} from '../services/hierarchy-helpers';
import type { AccountNode } from '../services/hierarchy-helpers';

// ── Test fixtures ────────────────────────────────────────────────

const makeAccounts = (): AccountNode[] => [
  { id: 'root-1', accountNumber: '10000', parentAccountId: null },
  { id: 'child-1', accountNumber: '10010', parentAccountId: 'root-1' },
  { id: 'grandchild-1', accountNumber: '10020', parentAccountId: 'child-1' },
  { id: 'root-2', accountNumber: '20000', parentAccountId: null },
  { id: 'child-2', accountNumber: '20010', parentAccountId: 'root-2' },
  { id: 'child-3', accountNumber: '10011', parentAccountId: 'root-1' },
];

// ── computeDepth ────────────────────────────────────────────────

describe('computeDepth', () => {
  const accounts = makeAccounts();

  it('returns 0 for root accounts', () => {
    expect(computeDepth('root-1', accounts)).toBe(0);
    expect(computeDepth('root-2', accounts)).toBe(0);
  });

  it('returns 1 for direct children', () => {
    expect(computeDepth('child-1', accounts)).toBe(1);
    expect(computeDepth('child-2', accounts)).toBe(1);
  });

  it('returns 2 for grandchildren', () => {
    expect(computeDepth('grandchild-1', accounts)).toBe(2);
  });

  it('returns 0 for unknown account', () => {
    expect(computeDepth('nonexistent', accounts)).toBe(0);
  });
});

// ── computePath ─────────────────────────────────────────────────

describe('computePath', () => {
  const accounts = makeAccounts();

  it('returns single segment for root accounts', () => {
    expect(computePath('root-1', accounts)).toBe('10000');
  });

  it('returns two segments for children', () => {
    expect(computePath('child-1', accounts)).toBe('10000.10010');
  });

  it('returns three segments for grandchildren', () => {
    expect(computePath('grandchild-1', accounts)).toBe('10000.10010.10020');
  });

  it('returns empty string for unknown account', () => {
    expect(computePath('nonexistent', accounts)).toBe('');
  });
});

// ── detectCircularReference ─────────────────────────────────────

describe('detectCircularReference', () => {
  const accounts = makeAccounts();

  it('detects direct self-reference', () => {
    expect(detectCircularReference('root-1', 'root-1', accounts)).toBe(true);
  });

  it('detects indirect cycle (child → grandchild as parent)', () => {
    // Setting child-1's parent to grandchild-1 would create: grandchild-1 → child-1 → grandchild-1
    expect(detectCircularReference('child-1', 'grandchild-1', accounts)).toBe(true);
  });

  it('returns false when no cycle', () => {
    // Setting root-1's parent to root-2 is fine (no cycle)
    expect(detectCircularReference('root-1', 'root-2', accounts)).toBe(false);
  });

  it('returns false for root setting parent to another root', () => {
    expect(detectCircularReference('root-2', 'root-1', accounts)).toBe(false);
  });

  it('detects deep cycle', () => {
    // root-1 → child-1 → grandchild-1 — setting root-1 parent to grandchild-1 creates cycle
    expect(detectCircularReference('root-1', 'grandchild-1', accounts)).toBe(true);
  });
});

// ── getDescendants ──────────────────────────────────────────────

describe('getDescendants', () => {
  const accounts = makeAccounts();

  it('returns all descendants for root', () => {
    const descendants = getDescendants('root-1', accounts);
    const ids = descendants.map((d) => d.id).sort();
    expect(ids).toEqual(['child-1', 'child-3', 'grandchild-1']);
  });

  it('returns children recursively', () => {
    const descendants = getDescendants('child-1', accounts);
    expect(descendants).toHaveLength(1);
    expect(descendants[0]!.id).toBe('grandchild-1');
  });

  it('returns empty for leaf node', () => {
    const descendants = getDescendants('grandchild-1', accounts);
    expect(descendants).toHaveLength(0);
  });

  it('returns empty for unknown account', () => {
    const descendants = getDescendants('nonexistent', accounts);
    expect(descendants).toHaveLength(0);
  });

  it('returns only direct children subtree, not siblings', () => {
    const descendants = getDescendants('root-2', accounts);
    expect(descendants).toHaveLength(1);
    expect(descendants[0]!.id).toBe('child-2');
  });
});
