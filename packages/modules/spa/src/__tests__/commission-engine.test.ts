// ══════════════════════════════════════════════════════════════════
// Commission Engine Tests — Pure Business Logic
// ══════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';

import {
  type CommissionRule,
  type CommissionInput,
  isRuleEffective,
  resolveCommissionRule,
  getResolutionLevel,
  getResolutionDescription,
  calculateCommission,
  computeAppointmentCommissions,
} from '../helpers/commission-engine.js';

// ── Test Helpers ──────────────────────────────────────────────────

function makeRule(overrides: Partial<CommissionRule> = {}): CommissionRule {
  return {
    id: 'rule-1',
    name: 'Default Commission',
    providerId: null,
    serviceId: null,
    serviceCategory: null,
    commissionType: 'percentage',
    rate: 40,
    flatAmount: null,
    tiers: null,
    appliesTo: 'all',
    effectiveFrom: '2025-01-01',
    effectiveUntil: null,
    isActive: true,
    priority: 10,
    ...overrides,
  };
}

function makeInput(overrides: Partial<CommissionInput> = {}): CommissionInput {
  return {
    providerId: 'provider-1',
    serviceId: 'svc-1',
    serviceCategory: 'haircuts',
    appliesTo: 'service',
    baseAmountCents: 10000, // $100.00
    appointmentDate: '2026-03-15',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════
// 1. isRuleEffective
// ══════════════════════════════════════════════════════════════════

describe('isRuleEffective', () => {
  it('returns true for an active rule with no end date and date after effectiveFrom', () => {
    const rule = makeRule({ effectiveFrom: '2025-01-01', effectiveUntil: null, isActive: true });
    expect(isRuleEffective(rule, '2026-03-15')).toBe(true);
  });

  it('returns false for a rule with future effectiveFrom', () => {
    const rule = makeRule({ effectiveFrom: '2027-01-01', isActive: true });
    expect(isRuleEffective(rule, '2026-03-15')).toBe(false);
  });

  it('returns false for a rule with past effectiveUntil', () => {
    const rule = makeRule({
      effectiveFrom: '2025-01-01',
      effectiveUntil: '2025-12-31',
      isActive: true,
    });
    expect(isRuleEffective(rule, '2026-03-15')).toBe(false);
  });

  it('returns true when date is within valid range (effectiveFrom <= date <= effectiveUntil)', () => {
    const rule = makeRule({
      effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-12-31',
      isActive: true,
    });
    expect(isRuleEffective(rule, '2026-06-15')).toBe(true);
  });

  it('returns false for an inactive rule', () => {
    const rule = makeRule({ isActive: false, effectiveFrom: '2020-01-01' });
    expect(isRuleEffective(rule, '2026-03-15')).toBe(false);
  });

  it('returns true on the exact effectiveFrom date', () => {
    const rule = makeRule({ effectiveFrom: '2026-03-15', isActive: true });
    expect(isRuleEffective(rule, '2026-03-15')).toBe(true);
  });

  it('returns true on the exact effectiveUntil date', () => {
    const rule = makeRule({
      effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-03-15',
      isActive: true,
    });
    expect(isRuleEffective(rule, '2026-03-15')).toBe(true);
  });

  it('returns false on the day after effectiveUntil', () => {
    const rule = makeRule({
      effectiveFrom: '2026-01-01',
      effectiveUntil: '2026-03-15',
      isActive: true,
    });
    expect(isRuleEffective(rule, '2026-03-16')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. resolveCommissionRule (priority resolution)
// ══════════════════════════════════════════════════════════════════

describe('resolveCommissionRule', () => {
  const input = makeInput();

  it('returns provider + specific service rule (level 1, highest priority)', () => {
    const providerServiceRule = makeRule({
      id: 'ps-rule',
      providerId: 'provider-1',
      serviceId: 'svc-1',
      appliesTo: 'service',
      priority: 5,
    });
    const tenantDefault = makeRule({
      id: 'tenant-default',
      providerId: null,
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
      priority: 100,
    });
    const result = resolveCommissionRule([tenantDefault, providerServiceRule], input);
    expect(result?.id).toBe('ps-rule');
  });

  it('falls back to provider + service category rule (level 2)', () => {
    const providerCategoryRule = makeRule({
      id: 'pc-rule',
      providerId: 'provider-1',
      serviceId: null,
      serviceCategory: 'haircuts',
      appliesTo: 'service',
      priority: 5,
    });
    const tenantDefault = makeRule({
      id: 'tenant-default',
      providerId: null,
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
      priority: 100,
    });
    const result = resolveCommissionRule([tenantDefault, providerCategoryRule], input);
    expect(result?.id).toBe('pc-rule');
  });

  it('falls back to provider catch-all (level 3)', () => {
    const providerAll = makeRule({
      id: 'p-all',
      providerId: 'provider-1',
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
      priority: 5,
    });
    const tenantDefault = makeRule({
      id: 'tenant-default',
      providerId: null,
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
      priority: 100,
    });
    const result = resolveCommissionRule([tenantDefault, providerAll], input);
    expect(result?.id).toBe('p-all');
  });

  it('falls back to tenant + specific service default (level 4)', () => {
    const tenantService = makeRule({
      id: 'ts-rule',
      providerId: null,
      serviceId: 'svc-1',
      serviceCategory: null,
      appliesTo: 'service',
      priority: 5,
    });
    const tenantDefault = makeRule({
      id: 'tenant-default',
      providerId: null,
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
      priority: 100,
    });
    const result = resolveCommissionRule([tenantDefault, tenantService], input);
    expect(result?.id).toBe('ts-rule');
  });

  it('falls back to tenant + service category (level 5)', () => {
    const tenantCategory = makeRule({
      id: 'tc-rule',
      providerId: null,
      serviceId: null,
      serviceCategory: 'haircuts',
      appliesTo: 'service',
      priority: 5,
    });
    const tenantDefault = makeRule({
      id: 'tenant-default',
      providerId: null,
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
      priority: 100,
    });
    const result = resolveCommissionRule([tenantDefault, tenantCategory], input);
    expect(result?.id).toBe('tc-rule');
  });

  it('falls back to tenant catch-all (level 6)', () => {
    const tenantAll = makeRule({
      id: 'tenant-all',
      providerId: null,
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
      priority: 5,
    });
    const result = resolveCommissionRule([tenantAll], input);
    expect(result?.id).toBe('tenant-all');
  });

  it('only returns effective rules', () => {
    const expired = makeRule({
      id: 'expired',
      providerId: 'provider-1',
      serviceId: 'svc-1',
      appliesTo: 'service',
      effectiveUntil: '2025-12-31',
    });
    const result = resolveCommissionRule([expired], input);
    expect(result).toBeNull();
  });

  it('returns null when no rules match', () => {
    const unrelated = makeRule({
      id: 'unrelated',
      providerId: 'provider-999',
      serviceId: 'svc-999',
      appliesTo: 'service',
    });
    const result = resolveCommissionRule([unrelated], input);
    expect(result).toBeNull();
  });

  it('within same level, picks the highest priority rule', () => {
    const lowPri = makeRule({
      id: 'low',
      providerId: 'provider-1',
      serviceId: 'svc-1',
      appliesTo: 'service',
      priority: 1,
    });
    const highPri = makeRule({
      id: 'high',
      providerId: 'provider-1',
      serviceId: 'svc-1',
      appliesTo: 'service',
      priority: 99,
    });
    const result = resolveCommissionRule([lowPri, highPri], input);
    expect(result?.id).toBe('high');
  });

  it('matches rules with appliesTo = "all" for any input appliesTo', () => {
    const allRule = makeRule({
      id: 'all-rule',
      providerId: 'provider-1',
      serviceId: 'svc-1',
      appliesTo: 'all',
    });
    const serviceInput = makeInput({ appliesTo: 'service' });
    expect(resolveCommissionRule([allRule], serviceInput)?.id).toBe('all-rule');

    const tipInput = makeInput({ appliesTo: 'tip' });
    expect(resolveCommissionRule([allRule], tipInput)?.id).toBe('all-rule');
  });

  it('does not match a "service" rule for "tip" input', () => {
    const serviceOnlyRule = makeRule({
      id: 'svc-only',
      providerId: 'provider-1',
      serviceId: 'svc-1',
      appliesTo: 'service',
    });
    const tipInput = makeInput({ appliesTo: 'tip' });
    expect(resolveCommissionRule([serviceOnlyRule], tipInput)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. getResolutionLevel
// ══════════════════════════════════════════════════════════════════

describe('getResolutionLevel', () => {
  const input = makeInput();

  it('returns 1 for provider + specific service', () => {
    const rule = makeRule({ providerId: 'provider-1', serviceId: 'svc-1' });
    expect(getResolutionLevel(rule, input)).toBe(1);
  });

  it('returns 2 for provider + service category', () => {
    const rule = makeRule({
      providerId: 'provider-1',
      serviceId: null,
      serviceCategory: 'haircuts',
    });
    expect(getResolutionLevel(rule, input)).toBe(2);
  });

  it('returns 3 for provider catch-all', () => {
    const rule = makeRule({
      providerId: 'provider-1',
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
    });
    expect(getResolutionLevel(rule, input)).toBe(3);
  });

  it('returns 4 for tenant + specific service', () => {
    const rule = makeRule({ providerId: null, serviceId: 'svc-1' });
    expect(getResolutionLevel(rule, input)).toBe(4);
  });

  it('returns 5 for tenant + service category', () => {
    const rule = makeRule({
      providerId: null,
      serviceId: null,
      serviceCategory: 'haircuts',
    });
    expect(getResolutionLevel(rule, input)).toBe(5);
  });

  it('returns 6 for tenant catch-all', () => {
    const rule = makeRule({
      providerId: null,
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
    });
    expect(getResolutionLevel(rule, input)).toBe(6);
  });

  it('returns 0 for unknown/unmatched combination', () => {
    const rule = makeRule({
      providerId: 'other-provider',
      serviceId: null,
      serviceCategory: 'other-cat',
      appliesTo: 'service',
    });
    expect(getResolutionLevel(rule, input)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. calculateCommission
// ══════════════════════════════════════════════════════════════════

describe('calculateCommission', () => {
  describe('flat commission', () => {
    it('returns the flat dollar amount converted to cents', () => {
      const rule = makeRule({ commissionType: 'flat', flatAmount: 25 });
      const result = calculateCommission(rule, 10000);
      expect(result.amountCents).toBe(2500);
    });

    it('computes effective rate as a percentage of base', () => {
      const rule = makeRule({ commissionType: 'flat', flatAmount: 25 });
      const result = calculateCommission(rule, 10000); // $25 / $100 = 25%
      expect(result.rateApplied).toBe(25);
    });

    it('handles flat amount with decimal cents (e.g., $12.50)', () => {
      const rule = makeRule({ commissionType: 'flat', flatAmount: 12.5 });
      const result = calculateCommission(rule, 5000);
      expect(result.amountCents).toBe(1250);
    });

    it('returns 0 when flatAmount is null', () => {
      const rule = makeRule({ commissionType: 'flat', flatAmount: null });
      const result = calculateCommission(rule, 10000);
      expect(result.amountCents).toBe(0);
    });
  });

  describe('percentage commission', () => {
    it('calculates correct percentage of service price', () => {
      const rule = makeRule({ commissionType: 'percentage', rate: 40 });
      const result = calculateCommission(rule, 10000); // 40% of $100
      expect(result.amountCents).toBe(4000);
      expect(result.rateApplied).toBe(40);
    });

    it('rounds to nearest cent (e.g., 33.33% of $100 = $33.33)', () => {
      const rule = makeRule({ commissionType: 'percentage', rate: 33.33 });
      const result = calculateCommission(rule, 10000);
      // 10000 * 33.33 / 100 = 3333.0 -> rounds to 3333
      expect(result.amountCents).toBe(3333);
    });

    it('handles sub-cent rounding correctly (33% of $10.01)', () => {
      const rule = makeRule({ commissionType: 'percentage', rate: 33 });
      const result = calculateCommission(rule, 1001);
      // 1001 * 33 / 100 = 330.33 -> rounds to 330
      expect(result.amountCents).toBe(330);
    });

    it('returns 0 when rate is null', () => {
      const rule = makeRule({ commissionType: 'percentage', rate: null });
      const result = calculateCommission(rule, 10000);
      expect(result.amountCents).toBe(0);
    });

    it('returns rate applied matching the rule rate', () => {
      const rule = makeRule({ commissionType: 'percentage', rate: 55.5 });
      const result = calculateCommission(rule, 10000);
      expect(result.rateApplied).toBe(55.5);
    });
  });

  describe('tiered commission', () => {
    const tieredRule = makeRule({
      commissionType: 'tiered',
      tiers: [
        { threshold: 5000, rate: 30 },   // up to $50 -> 30%
        { threshold: 10000, rate: 40 },  // up to $100 -> 40%
        { threshold: 20000, rate: 50 },  // up to $200 -> 50%
      ],
    });

    it('applies the correct tier based on base amount (lowest tier)', () => {
      const result = calculateCommission(tieredRule, 3000); // $30 <= $50 -> 30%
      expect(result.amountCents).toBe(900); // 3000 * 30 / 100
      expect(result.rateApplied).toBe(30);
    });

    it('applies the correct tier based on base amount (middle tier)', () => {
      const result = calculateCommission(tieredRule, 8000); // $80, > $50, <= $100 -> 40%
      expect(result.amountCents).toBe(3200); // 8000 * 40 / 100
      expect(result.rateApplied).toBe(40);
    });

    it('applies the correct tier based on base amount (highest tier)', () => {
      const result = calculateCommission(tieredRule, 15000); // $150, > $100, <= $200 -> 50%
      expect(result.amountCents).toBe(7500); // 15000 * 50 / 100
      expect(result.rateApplied).toBe(50);
    });

    it('uses the last tier rate when above all thresholds', () => {
      const result = calculateCommission(tieredRule, 50000); // $500, > $200 -> 50%
      expect(result.amountCents).toBe(25000);
      expect(result.rateApplied).toBe(50);
    });

    it('applies first tier when base equals tier threshold', () => {
      const result = calculateCommission(tieredRule, 5000); // exactly $50 -> 30%
      expect(result.amountCents).toBe(1500);
      expect(result.rateApplied).toBe(30);
    });

    it('returns 0 when tiers is null', () => {
      const rule = makeRule({ commissionType: 'tiered', tiers: null });
      const result = calculateCommission(rule, 10000);
      expect(result.amountCents).toBe(0);
      expect(result.rateApplied).toBe(0);
    });

    it('returns 0 when tiers is empty', () => {
      const rule = makeRule({ commissionType: 'tiered', tiers: [] });
      const result = calculateCommission(rule, 10000);
      expect(result.amountCents).toBe(0);
      expect(result.rateApplied).toBe(0);
    });

    it('handles unsorted tiers (defensive sorting)', () => {
      const unsortedRule = makeRule({
        commissionType: 'tiered',
        tiers: [
          { threshold: 20000, rate: 50 },
          { threshold: 5000, rate: 30 },
          { threshold: 10000, rate: 40 },
        ],
      });
      const result = calculateCommission(unsortedRule, 3000);
      expect(result.rateApplied).toBe(30); // sorted: 5000 first
    });
  });

  describe('sliding_scale commission', () => {
    it('uses the same tier resolution as tiered', () => {
      const rule = makeRule({
        commissionType: 'sliding_scale',
        tiers: [
          { threshold: 5000, rate: 25 },
          { threshold: 10000, rate: 35 },
          { threshold: 20000, rate: 45 },
        ],
      });
      const result = calculateCommission(rule, 7500); // > 5000, <= 10000 -> 35%
      expect(result.amountCents).toBe(2625); // 7500 * 35 / 100
      expect(result.rateApplied).toBe(35);
    });
  });

  describe('zero / edge cases', () => {
    it('returns zero commission for zero base amount', () => {
      const rule = makeRule({ commissionType: 'percentage', rate: 50 });
      const result = calculateCommission(rule, 0);
      expect(result.amountCents).toBe(0);
      expect(result.rateApplied).toBe(0);
    });

    it('returns zero commission for negative base amount', () => {
      const rule = makeRule({ commissionType: 'percentage', rate: 50 });
      const result = calculateCommission(rule, -5000);
      expect(result.amountCents).toBe(0);
      expect(result.rateApplied).toBe(0);
    });

    it('handles zero-rate percentage commission', () => {
      const rule = makeRule({ commissionType: 'percentage', rate: 0 });
      const result = calculateCommission(rule, 10000);
      expect(result.amountCents).toBe(0);
      expect(result.rateApplied).toBe(0);
    });

    it('handles unknown commission type gracefully', () => {
      const rule = makeRule({ commissionType: 'unknown' as any });
      const result = calculateCommission(rule, 10000);
      expect(result.amountCents).toBe(0);
      expect(result.rateApplied).toBe(0);
    });

    it('integer cents arithmetic: no floating-point drift', () => {
      // 10% of $99.99 = $9.999 -> rounds to $10.00 (1000 cents)
      const rule = makeRule({ commissionType: 'percentage', rate: 10 });
      const result = calculateCommission(rule, 9999);
      expect(result.amountCents).toBe(1000); // Math.round(9999 * 10 / 100) = Math.round(999.9) = 1000
    });

    it('handles very large amounts without overflow', () => {
      // $1,000,000.00 = 100_000_000 cents, 50% = 50_000_000 cents
      const rule = makeRule({ commissionType: 'percentage', rate: 50 });
      const result = calculateCommission(rule, 100_000_000);
      expect(result.amountCents).toBe(50_000_000);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. computeAppointmentCommissions
// ══════════════════════════════════════════════════════════════════

describe('computeAppointmentCommissions', () => {
  it('computes commission for a single service with a single provider', () => {
    const rules = [
      makeRule({
        id: 'prov-all',
        providerId: 'provider-1',
        serviceId: null,
        serviceCategory: null,
        appliesTo: 'all',
        commissionType: 'percentage',
        rate: 40,
      }),
    ];
    const items = [
      { serviceId: 'svc-1', serviceCategory: 'haircuts', priceCents: 10000 },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.providerId).toBe('provider-1');
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]!.commissionAmountCents).toBe(4000);
    expect(result.totalBaseAmountCents).toBe(10000);
    expect(result.totalCommissionCents).toBe(4000);
    expect(result.effectiveRate).toBe(40);
  });

  it('computes commissions for multiple services', () => {
    const rules = [
      makeRule({
        id: 'rule-all',
        providerId: null,
        serviceId: null,
        serviceCategory: null,
        appliesTo: 'all',
        commissionType: 'percentage',
        rate: 50,
      }),
    ];
    const items = [
      { serviceId: 'svc-1', serviceCategory: 'haircuts', priceCents: 8000 },
      { serviceId: 'svc-2', serviceCategory: 'color', priceCents: 12000 },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(2);
    expect(result.totalBaseAmountCents).toBe(20000);
    expect(result.totalCommissionCents).toBe(10000); // 50% of each
    expect(result.effectiveRate).toBe(50);
  });

  it('applies different commission rules to different services', () => {
    const rules = [
      makeRule({
        id: 'haircut-rule',
        providerId: 'provider-1',
        serviceId: 'svc-haircut',
        appliesTo: 'service',
        commissionType: 'percentage',
        rate: 50,
        priority: 10,
      }),
      makeRule({
        id: 'color-rule',
        providerId: 'provider-1',
        serviceId: 'svc-color',
        appliesTo: 'service',
        commissionType: 'flat',
        flatAmount: 20,
        rate: null,
        priority: 10,
      }),
    ];
    const items = [
      { serviceId: 'svc-haircut', serviceCategory: 'haircuts', priceCents: 8000 },
      { serviceId: 'svc-color', serviceCategory: 'color', priceCents: 15000 },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(2);

    const haircutLine = result.lineItems.find((li) => li.ruleId === 'haircut-rule');
    expect(haircutLine?.commissionAmountCents).toBe(4000); // 50% of 8000

    const colorLine = result.lineItems.find((li) => li.ruleId === 'color-rule');
    expect(colorLine?.commissionAmountCents).toBe(2000); // flat $20
  });

  it('includes addon commissions when addon price is present', () => {
    // Level 1: provider + specific service rules, one for 'service' and one for 'addon'
    const rules = [
      makeRule({
        id: 'svc-rule',
        providerId: 'provider-1',
        serviceId: 'svc-1',
        serviceCategory: null,
        appliesTo: 'service',
        commissionType: 'percentage',
        rate: 40,
      }),
      makeRule({
        id: 'addon-rule',
        providerId: 'provider-1',
        serviceId: 'svc-1',
        serviceCategory: null,
        appliesTo: 'addon',
        commissionType: 'percentage',
        rate: 20,
      }),
    ];
    const items = [
      {
        serviceId: 'svc-1',
        serviceCategory: 'haircuts',
        priceCents: 10000,
        addonPriceCents: 2500,
      },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(2);

    const svcLine = result.lineItems.find((li) => li.ruleId === 'svc-rule');
    expect(svcLine?.commissionAmountCents).toBe(4000); // 40% of 10000

    const addonLine = result.lineItems.find((li) => li.ruleId === 'addon-rule');
    expect(addonLine?.commissionAmountCents).toBe(500); // 20% of 2500
  });

  it('includes tip commissions when tip is present', () => {
    const rules = [
      makeRule({
        id: 'all-rule',
        providerId: null,
        serviceId: null,
        serviceCategory: null,
        appliesTo: 'all',
        commissionType: 'percentage',
        rate: 100, // provider keeps 100% of tips
      }),
    ];
    const items = [
      {
        serviceId: 'svc-1',
        serviceCategory: 'haircuts',
        priceCents: 10000,
        tipCents: 2000,
      },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(2);
    // Service: 100% of 10000 = 10000
    // Tip: 100% of 2000 = 2000
    expect(result.totalCommissionCents).toBe(12000);
  });

  it('returns empty result when no rules match any items', () => {
    const rules = [
      makeRule({
        id: 'other-provider',
        providerId: 'provider-99',
        serviceId: 'svc-1',
        appliesTo: 'service',
      }),
    ];
    const items = [
      { serviceId: 'svc-1', serviceCategory: 'haircuts', priceCents: 10000 },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(0);
    expect(result.totalBaseAmountCents).toBe(0);
    expect(result.totalCommissionCents).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });

  it('handles mixed commission types (flat + percentage)', () => {
    const rules = [
      makeRule({
        id: 'flat-rule',
        providerId: 'provider-1',
        serviceId: 'svc-1',
        appliesTo: 'service',
        commissionType: 'flat',
        flatAmount: 30,
        priority: 10,
      }),
      makeRule({
        id: 'pct-rule',
        providerId: 'provider-1',
        serviceId: 'svc-2',
        appliesTo: 'service',
        commissionType: 'percentage',
        rate: 40,
        priority: 10,
      }),
    ];
    const items = [
      { serviceId: 'svc-1', serviceCategory: 'haircuts', priceCents: 8000 },
      { serviceId: 'svc-2', serviceCategory: 'color', priceCents: 15000 },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(2);
    expect(result.totalCommissionCents).toBe(3000 + 6000); // $30 flat + 40% of $150
  });

  it('computes summary totals and effective rate correctly', () => {
    const rules = [
      makeRule({
        id: 'rule',
        providerId: null,
        serviceId: null,
        serviceCategory: null,
        appliesTo: 'all',
        commissionType: 'percentage',
        rate: 33,
      }),
    ];
    const items = [
      { serviceId: 'svc-1', serviceCategory: 'haircuts', priceCents: 10000 },
      { serviceId: 'svc-2', serviceCategory: 'color', priceCents: 20000 },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    // 33% of 10000 = 3300, 33% of 20000 = 6600
    expect(result.totalBaseAmountCents).toBe(30000);
    expect(result.totalCommissionCents).toBe(9900);
    // effectiveRate = round(9900/30000 * 10000) / 100 = round(3300) / 100 = 33
    expect(result.effectiveRate).toBe(33);
  });

  it('skips items with zero service price', () => {
    const rules = [
      makeRule({
        id: 'rule',
        providerId: null,
        serviceId: null,
        serviceCategory: null,
        appliesTo: 'all',
        commissionType: 'percentage',
        rate: 50,
      }),
    ];
    const items = [
      { serviceId: 'svc-1', serviceCategory: 'haircuts', priceCents: 0 },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(0);
    expect(result.totalCommissionCents).toBe(0);
  });

  it('skips addons and tips when they are zero or absent', () => {
    // Use tenant + specific service rules (level 4) for each appliesTo type
    const rules = [
      makeRule({
        id: 'svc-rule',
        providerId: null,
        serviceId: 'svc-1',
        serviceCategory: null,
        appliesTo: 'service',
        commissionType: 'percentage',
        rate: 40,
      }),
      makeRule({
        id: 'addon-rule',
        providerId: null,
        serviceId: 'svc-1',
        serviceCategory: null,
        appliesTo: 'addon',
        commissionType: 'percentage',
        rate: 20,
      }),
      makeRule({
        id: 'tip-rule',
        providerId: null,
        serviceId: 'svc-1',
        serviceCategory: null,
        appliesTo: 'tip',
        commissionType: 'percentage',
        rate: 100,
      }),
    ];
    const items = [
      {
        serviceId: 'svc-1',
        serviceCategory: 'haircuts',
        priceCents: 10000,
        addonPriceCents: 0,
        tipCents: 0,
      },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    // Only the service line, addons and tips skipped due to zero amount
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]!.ruleId).toBe('svc-rule');
  });

  it('handles appointment with service + addon + tip all present', () => {
    // Use tenant + specific service rules (level 4) for each appliesTo type
    const rules = [
      makeRule({
        id: 'svc-rule',
        providerId: null,
        serviceId: 'svc-1',
        serviceCategory: null,
        appliesTo: 'service',
        commissionType: 'percentage',
        rate: 40,
      }),
      makeRule({
        id: 'addon-rule',
        providerId: null,
        serviceId: 'svc-1',
        serviceCategory: null,
        appliesTo: 'addon',
        commissionType: 'percentage',
        rate: 25,
      }),
      makeRule({
        id: 'tip-rule',
        providerId: null,
        serviceId: 'svc-1',
        serviceCategory: null,
        appliesTo: 'tip',
        commissionType: 'percentage',
        rate: 100,
      }),
    ];
    const items = [
      {
        serviceId: 'svc-1',
        serviceCategory: 'haircuts',
        priceCents: 10000,
        addonPriceCents: 3000,
        tipCents: 2000,
      },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(3);
    // Service: 40% of 10000 = 4000
    // Addon: 25% of 3000 = 750
    // Tip: 100% of 2000 = 2000
    expect(result.totalCommissionCents).toBe(6750);
    expect(result.totalBaseAmountCents).toBe(15000);
  });
});

// ══════════════════════════════════════════════════════════════════
// 6. getResolutionDescription
// ══════════════════════════════════════════════════════════════════

describe('getResolutionDescription', () => {
  it('returns readable description for level 1', () => {
    expect(getResolutionDescription(1)).toBe('Provider + specific service override');
  });

  it('returns readable description for level 2', () => {
    expect(getResolutionDescription(2)).toBe('Provider + service category default');
  });

  it('returns readable description for level 3', () => {
    expect(getResolutionDescription(3)).toBe('Provider catch-all (all services)');
  });

  it('returns readable description for level 4', () => {
    expect(getResolutionDescription(4)).toBe('Tenant + specific service default');
  });

  it('returns readable description for level 5', () => {
    expect(getResolutionDescription(5)).toBe('Tenant + service category default');
  });

  it('returns readable description for level 6', () => {
    expect(getResolutionDescription(6)).toBe('Tenant catch-all (all services)');
  });

  it('returns fallback for unknown level', () => {
    expect(getResolutionDescription(99)).toBe('Unknown resolution level (99)');
  });

  it('returns fallback for level 0', () => {
    expect(getResolutionDescription(0)).toBe('Unknown resolution level (0)');
  });
});

// ══════════════════════════════════════════════════════════════════
// 7. Edge Cases
// ══════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('resolveCommissionRule with empty rules array returns null', () => {
    const result = resolveCommissionRule([], makeInput());
    expect(result).toBeNull();
  });

  it('computeAppointmentCommissions with empty items returns empty summary', () => {
    const rules = [makeRule()];
    const result = computeAppointmentCommissions(rules, [], 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(0);
    expect(result.totalBaseAmountCents).toBe(0);
    expect(result.totalCommissionCents).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });

  it('computeAppointmentCommissions with both empty rules and items', () => {
    const result = computeAppointmentCommissions([], [], 'provider-1', '2026-03-15');
    expect(result.lineItems).toHaveLength(0);
    expect(result.effectiveRate).toBe(0);
  });

  it('very large commission amount does not overflow', () => {
    const rule = makeRule({
      commissionType: 'percentage',
      rate: 99.99,
      providerId: null,
      serviceId: null,
      serviceCategory: null,
      appliesTo: 'all',
    });
    // $10,000,000.00 = 1_000_000_000 cents
    const result = calculateCommission(rule, 1_000_000_000);
    expect(result.amountCents).toBe(999_900_000); // Math.round(1B * 99.99 / 100)
  });

  it('flat commission effective rate rounds to 2 decimal places', () => {
    // $7 flat on $30 base = 23.333...%
    const rule = makeRule({ commissionType: 'flat', flatAmount: 7 });
    const result = calculateCommission(rule, 3000);
    // Math.round((700 / 3000) * 10000) / 100 = Math.round(2333.33) / 100 = 2333 / 100 = 23.33
    expect(result.rateApplied).toBe(23.33);
  });

  it('tiered commission with single tier always uses that rate', () => {
    const rule = makeRule({
      commissionType: 'tiered',
      tiers: [{ threshold: 100000, rate: 45 }],
    });
    // Below threshold
    const low = calculateCommission(rule, 5000);
    expect(low.rateApplied).toBe(45);
    // Above threshold
    const high = calculateCommission(rule, 200000);
    expect(high.rateApplied).toBe(45);
  });

  it('commission result includes resolutionLevel and resolutionDescription', () => {
    const rules = [
      makeRule({
        id: 'level-6',
        providerId: null,
        serviceId: null,
        serviceCategory: null,
        appliesTo: 'all',
        commissionType: 'percentage',
        rate: 35,
      }),
    ];
    const items = [
      { serviceId: 'svc-1', serviceCategory: 'haircuts', priceCents: 10000 },
    ];

    const result = computeAppointmentCommissions(rules, items, 'provider-1', '2026-03-15');
    expect(result.lineItems[0]!.resolutionLevel).toBe(6);
    expect(result.lineItems[0]!.resolutionDescription).toBe('Tenant catch-all (all services)');
  });

  it('percentage commission on 1 cent base', () => {
    const rule = makeRule({ commissionType: 'percentage', rate: 50 });
    const result = calculateCommission(rule, 1);
    // Math.round(1 * 50 / 100) = Math.round(0.5) = 1 (rounds up)
    expect(result.amountCents).toBe(1);
  });

  it('resolveCommissionRule filters by appliesTo before resolution', () => {
    // Rule only applies to 'retail'
    const retailRule = makeRule({
      id: 'retail',
      providerId: 'provider-1',
      serviceId: 'svc-1',
      appliesTo: 'retail',
    });
    // Input asks for 'service' commission
    const input = makeInput({ appliesTo: 'service' });
    expect(resolveCommissionRule([retailRule], input)).toBeNull();
  });
});
