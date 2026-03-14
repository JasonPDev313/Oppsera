/**
 * Tests for useKdsLocation pure resolution logic.
 *
 * Imports the real exported functions from use-kds-location.ts so the test
 * exercises actual hook logic, not a mirrored copy.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveLocationId,
  computeLocationFellBack,
  computeLocationDefaulted,
} from '@/hooks/use-kds-location';

// ── Test data ───────────────────────────────────────────────────

const RESORT = { id: 'loc-as5', name: 'Resort' };
const SUNSET = { id: 'loc-as4', name: 'Sunset Golf Resort' };
const SPA = { id: 'loc-as6', name: 'Spa' };
const MULTI_LOCATIONS = [RESORT, SPA, SUNSET]; // alphabetical first = Resort
const SINGLE_LOCATION = [SUNSET];

// ── Tests ───────────────────────────────────────────────────────

describe('resolveLocationId', () => {
  it('uses valid URL param when provided', () => {
    expect(resolveLocationId('loc-as4', MULTI_LOCATIONS, 'loc-as5', '')).toBe('loc-as4');
  });

  it('ignores invalid URL param and falls back to terminal session', () => {
    expect(resolveLocationId('loc-invalid', MULTI_LOCATIONS, 'loc-as6', '')).toBe('loc-as6');
  });

  it('falls back to first location when no URL and no terminal session', () => {
    expect(resolveLocationId(null, MULTI_LOCATIONS, undefined, '')).toBe('loc-as5');
  });

  it('uses fallback when no locations exist', () => {
    expect(resolveLocationId(null, [], undefined, 'default')).toBe('default');
  });

  it('prefers terminal session over first location', () => {
    expect(resolveLocationId(null, MULTI_LOCATIONS, 'loc-as4', '')).toBe('loc-as4');
  });
});

describe('computeLocationFellBack', () => {
  it('returns false when no URL param', () => {
    expect(computeLocationFellBack(null, MULTI_LOCATIONS)).toBe(false);
  });

  it('returns false when URL param matches a known location', () => {
    expect(computeLocationFellBack('loc-as4', MULTI_LOCATIONS)).toBe(false);
  });

  it('returns true when URL param does not match any known location', () => {
    expect(computeLocationFellBack('loc-invalid', MULTI_LOCATIONS)).toBe(true);
  });
});

describe('computeLocationDefaulted', () => {
  it('returns false when valid URL param is provided', () => {
    expect(computeLocationDefaulted('loc-as4', MULTI_LOCATIONS, undefined)).toBe(false);
  });

  it('returns false when terminal session provides locationId', () => {
    expect(computeLocationDefaulted(null, MULTI_LOCATIONS, 'loc-as4')).toBe(false);
  });

  it('returns true when no URL, no session, and multiple locations (the ghost-empty scenario)', () => {
    expect(computeLocationDefaulted(null, MULTI_LOCATIONS, undefined)).toBe(true);
  });

  it('returns false for single-location tenant (no confusion possible)', () => {
    expect(computeLocationDefaulted(null, SINGLE_LOCATION, undefined)).toBe(false);
  });

  it('returns false when URL is invalid but terminal session exists', () => {
    expect(computeLocationDefaulted('loc-invalid', MULTI_LOCATIONS, 'loc-as4')).toBe(false);
  });

  it('returns true when URL is invalid and no session (multi-location)', () => {
    expect(computeLocationDefaulted('loc-invalid', MULTI_LOCATIONS, undefined)).toBe(true);
  });
});
