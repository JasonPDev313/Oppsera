import { describe, it, expect } from 'vitest';
import { classifyTenant } from '../tier-classifier';
import type { TenantMetrics } from '../tier-classifier';
import { TIER_THRESHOLDS } from '@oppsera/shared';

describe('classifyTenant', () => {
  it('returns SMB for zero metrics', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 0,
      locationCount: 0,
      userCount: 0,
      glAccountCount: 0,
    };
    // SMB thresholds are all 0, so 0 meets them — tier iteration starts at ENTERPRISE
    // ENTERPRISE needs >=10M rev, >=20 locs, >=50 users, >=200 GL — no match
    // MID_MARKET needs >=2M rev, >=5 locs, >=20 users, >=100 GL — no match
    // SMB needs >=0 — match! But the loop uses OR, so even 0 >= 0 matches SMB
    expect(classifyTenant(metrics)).toBe('SMB');
  });

  it('returns MID_MARKET when revenue exceeds $2M', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 2_500_000,
      locationCount: 1,
      userCount: 5,
      glAccountCount: 20,
    };
    expect(classifyTenant(metrics)).toBe('MID_MARKET');
  });

  it('returns MID_MARKET when location count >= 5', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 500_000,
      locationCount: 5,
      userCount: 3,
      glAccountCount: 10,
    };
    expect(classifyTenant(metrics)).toBe('MID_MARKET');
  });

  it('returns MID_MARKET when user count >= 20', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 100_000,
      locationCount: 1,
      userCount: 20,
      glAccountCount: 5,
    };
    expect(classifyTenant(metrics)).toBe('MID_MARKET');
  });

  it('returns MID_MARKET when GL account count >= 100', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 100_000,
      locationCount: 1,
      userCount: 5,
      glAccountCount: 100,
    };
    expect(classifyTenant(metrics)).toBe('MID_MARKET');
  });

  it('returns ENTERPRISE when revenue exceeds $10M', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 12_000_000,
      locationCount: 1,
      userCount: 5,
      glAccountCount: 20,
    };
    expect(classifyTenant(metrics)).toBe('ENTERPRISE');
  });

  it('returns ENTERPRISE when location count >= 20', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 500_000,
      locationCount: 20,
      userCount: 3,
      glAccountCount: 10,
    };
    expect(classifyTenant(metrics)).toBe('ENTERPRISE');
  });

  it('returns ENTERPRISE when user count >= 50', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 100_000,
      locationCount: 1,
      userCount: 50,
      glAccountCount: 5,
    };
    expect(classifyTenant(metrics)).toBe('ENTERPRISE');
  });

  it('returns ENTERPRISE when GL accounts >= 200', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 100_000,
      locationCount: 1,
      userCount: 5,
      glAccountCount: 200,
    };
    expect(classifyTenant(metrics)).toBe('ENTERPRISE');
  });

  it('returns highest matching tier when multiple metrics cross thresholds', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 15_000_000, // ENTERPRISE
      locationCount: 10,          // MID_MARKET
      userCount: 30,              // MID_MARKET
      glAccountCount: 150,        // MID_MARKET
    };
    expect(classifyTenant(metrics)).toBe('ENTERPRISE');
  });

  it('uses OR logic (any single metric can trigger a tier)', () => {
    // Only GL accounts are at MID_MARKET level, everything else is SMB-level
    const metrics: TenantMetrics = {
      annualRevenue: 50_000,
      locationCount: 1,
      userCount: 2,
      glAccountCount: 100,
    };
    expect(classifyTenant(metrics)).toBe('MID_MARKET');
  });

  it('checks tiers from highest to lowest', () => {
    // Exactly at ENTERPRISE thresholds
    const metrics: TenantMetrics = {
      annualRevenue: TIER_THRESHOLDS.ENTERPRISE.annualRevenue,
      locationCount: 0,
      userCount: 0,
      glAccountCount: 0,
    };
    expect(classifyTenant(metrics)).toBe('ENTERPRISE');
  });

  it('returns SMB for metrics just below MID_MARKET thresholds', () => {
    const metrics: TenantMetrics = {
      annualRevenue: 1_999_999,
      locationCount: 4,
      userCount: 19,
      glAccountCount: 99,
    };
    // None of these meet any non-SMB threshold
    // But SMB thresholds are all 0, so anything >= 0 matches SMB
    expect(classifyTenant(metrics)).toBe('SMB');
  });
});
