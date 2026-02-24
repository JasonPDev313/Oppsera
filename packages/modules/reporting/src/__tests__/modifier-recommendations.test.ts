import { describe, it, expect } from 'vitest';
import { computeModifierGroupHealth } from '../helpers/modifier-recommendations';
import type { ModifierGroupHealthInput } from '../helpers/modifier-recommendations';

// ── Test helper ──────────────────────────────────────────────────────

function makeGroup(overrides: Partial<ModifierGroupHealthInput> = {}): ModifierGroupHealthInput {
  return {
    modifierGroupId: 'grp-1',
    groupName: 'Test Group',
    isRequired: false,
    eligibleLineCount: 100,
    linesWithSelection: 60,
    totalSelections: 80,
    uniqueModifiers: 3,
    revenueImpactDollars: 50,
    voidCount: 0,
    ...overrides,
  };
}

/** Reference date used for "new" detection tests. */
const REF_DATE = new Date('2026-02-24T12:00:00Z');

// ── Metric computation ───────────────────────────────────────────────

describe('computeModifierGroupHealth', () => {
  describe('metric computation', () => {
    it('computes attachRate = linesWithSelection / eligibleLineCount', () => {
      const [result] = computeModifierGroupHealth(
        [makeGroup({ eligibleLineCount: 200, linesWithSelection: 50 })],
        { referenceDate: REF_DATE },
      );
      expect(result!.attachRate).toBe(0.25);
    });

    it('returns attachRate = 0 when eligibleLineCount = 0', () => {
      const [result] = computeModifierGroupHealth(
        [makeGroup({ eligibleLineCount: 0, linesWithSelection: 0 })],
        { referenceDate: REF_DATE },
      );
      expect(result!.attachRate).toBe(0);
    });

    it('computes avgSelectionsPerCheck = totalSelections / linesWithSelection', () => {
      const [result] = computeModifierGroupHealth(
        [makeGroup({ totalSelections: 120, linesWithSelection: 40 })],
        { referenceDate: REF_DATE },
      );
      expect(result!.avgSelectionsPerCheck).toBe(3);
    });

    it('returns avgSelectionsPerCheck = 0 when linesWithSelection = 0', () => {
      const [result] = computeModifierGroupHealth(
        [makeGroup({ linesWithSelection: 0, totalSelections: 0, eligibleLineCount: 0 })],
        { referenceDate: REF_DATE },
      );
      expect(result!.avgSelectionsPerCheck).toBe(0);
    });

    it('computes voidRate = voidCount / (linesWithSelection || 1)', () => {
      const [result] = computeModifierGroupHealth(
        [makeGroup({ voidCount: 10, linesWithSelection: 50 })],
        { referenceDate: REF_DATE },
      );
      expect(result!.voidRate).toBe(0.2);
    });

    it('uses 1 as denominator for voidRate when linesWithSelection = 0', () => {
      const [result] = computeModifierGroupHealth(
        [makeGroup({ voidCount: 3, linesWithSelection: 0, eligibleLineCount: 0 })],
        { referenceDate: REF_DATE },
      );
      // voidRate = 3 / 1 = 3
      expect(result!.voidRate).toBe(3);
    });
  });

  // ── Recommendation rules ─────────────────────────────────────────

  describe('recommendation rules', () => {
    it('returns "new" for group created < 14 days ago', () => {
      const [result] = computeModifierGroupHealth(
        [makeGroup({ createdAt: '2026-02-15T00:00:00Z' })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('new');
      expect(result!.recommendationLabel).toContain('New');
      expect(result!.recommendationLabel).toContain('Collecting Data');
    });

    it('does NOT return "new" for group created >= 14 days ago', () => {
      const [result] = computeModifierGroupHealth(
        [makeGroup({ createdAt: '2026-02-01T00:00:00Z' })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).not.toBe('new');
    });

    it('returns "investigate" for voidRate > 0.15', () => {
      // voidRate = 20 / 60 = 0.333
      const [result] = computeModifierGroupHealth(
        [makeGroup({ voidCount: 20, linesWithSelection: 60 })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('investigate');
      expect(result!.recommendationLabel).toContain('Investigate');
    });

    it('returns "review_prompt" for required group with attachRate < 0.5', () => {
      // attachRate = 30 / 100 = 0.3
      const [result] = computeModifierGroupHealth(
        [makeGroup({ isRequired: true, linesWithSelection: 30, totalSelections: 30 })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('review_prompt');
      expect(result!.recommendationLabel).toContain('Review Prompt');
    });

    it('returns "remove" for optional group with attachRate < 0.1 and >= 50 eligible lines', () => {
      // attachRate = 5 / 100 = 0.05
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          isRequired: false,
          eligibleLineCount: 100,
          linesWithSelection: 5,
          totalSelections: 5,
          revenueImpactDollars: 2,
        })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('remove');
      expect(result!.recommendationLabel).toContain('Removing');
    });

    it('does NOT return "remove" for required groups even with low attach rate', () => {
      // attachRate = 5 / 100 = 0.05, but isRequired = true
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          isRequired: true,
          eligibleLineCount: 100,
          linesWithSelection: 5,
          totalSelections: 5,
        })],
        { referenceDate: REF_DATE },
      );
      // Should hit rule 3 (review_prompt) instead of rule 4 (remove)
      expect(result!.recommendation).not.toBe('remove');
      expect(result!.recommendation).toBe('review_prompt');
    });

    it('returns "keep" for attachRate >= 0.6 with positive revenue', () => {
      // attachRate = 70 / 100 = 0.7
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          linesWithSelection: 70,
          totalSelections: 90,
          revenueImpactDollars: 100,
        })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('keep');
      expect(result!.recommendationLabel).toBe('High-Performing');
    });

    it('returns "optimize" for mid-range attach rate (0.3 - 0.6)', () => {
      // attachRate = 40 / 100 = 0.4
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          linesWithSelection: 40,
          totalSelections: 50,
          revenueImpactDollars: 0,
        })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('optimize');
      expect(result!.recommendationLabel).toContain('Optimize');
    });
  });

  // ── Priority testing ─────────────────────────────────────────────

  describe('priority ordering', () => {
    it('"investigate" (void) takes priority over "keep" (high attach)', () => {
      // attachRate = 70/100 = 0.7 (would be "keep")
      // voidRate = 20/70 ≈ 0.286 (triggers "investigate")
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          linesWithSelection: 70,
          totalSelections: 90,
          revenueImpactDollars: 100,
          voidCount: 20,
        })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('investigate');
    });

    it('"new" takes priority over everything else', () => {
      // This group has high void rate (would be "investigate") AND is new
      // voidRate = 30/60 = 0.5
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          createdAt: '2026-02-20T00:00:00Z',
          voidCount: 30,
          linesWithSelection: 60,
        })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('new');
    });

    it('"review_prompt" takes priority over "remove" for required groups', () => {
      // attachRate = 5/100 = 0.05 (< 0.1 threshold for "remove")
      // But isRequired = true, so rule 3 fires before rule 4
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          isRequired: true,
          eligibleLineCount: 100,
          linesWithSelection: 5,
          totalSelections: 5,
        })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('review_prompt');
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const results = computeModifierGroupHealth([], { referenceDate: REF_DATE });
      expect(results).toEqual([]);
    });

    it('processes multiple groups independently', () => {
      const results = computeModifierGroupHealth(
        [
          makeGroup({
            modifierGroupId: 'grp-a',
            linesWithSelection: 70,
            revenueImpactDollars: 100,
          }),
          makeGroup({
            modifierGroupId: 'grp-b',
            eligibleLineCount: 100,
            linesWithSelection: 5,
            totalSelections: 5,
            revenueImpactDollars: 1,
          }),
        ],
        { referenceDate: REF_DATE },
      );

      expect(results).toHaveLength(2);
      expect(results[0]!.modifierGroupId).toBe('grp-a');
      expect(results[0]!.recommendation).toBe('keep');
      expect(results[1]!.modifierGroupId).toBe('grp-b');
      expect(results[1]!.recommendation).toBe('remove');
    });

    it('preserves all original input fields in the result', () => {
      const input = makeGroup({ groupName: 'Extra Cheese', uniqueModifiers: 5 });
      const [result] = computeModifierGroupHealth([input], { referenceDate: REF_DATE });

      expect(result!.modifierGroupId).toBe(input.modifierGroupId);
      expect(result!.groupName).toBe('Extra Cheese');
      expect(result!.uniqueModifiers).toBe(5);
      expect(result!.eligibleLineCount).toBe(input.eligibleLineCount);
    });

    it('defaults to "optimize" when no specific rule matches', () => {
      // attachRate = 20/100 = 0.2 (between 0.1 and 0.3 — no rule matches except default)
      // Not required, not new, no voids, revenue = 0
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          linesWithSelection: 20,
          totalSelections: 25,
          revenueImpactDollars: 0,
          voidCount: 0,
        })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).toBe('optimize');
      expect(result!.recommendationLabel).toBe('Needs Attention');
    });

    it('does not return "remove" when eligible lines < 50 (insufficient data)', () => {
      // attachRate = 2/30 = 0.067 (< 0.1) but eligibleLineCount < 50
      const [result] = computeModifierGroupHealth(
        [makeGroup({
          isRequired: false,
          eligibleLineCount: 30,
          linesWithSelection: 2,
          totalSelections: 2,
          revenueImpactDollars: 0,
        })],
        { referenceDate: REF_DATE },
      );
      expect(result!.recommendation).not.toBe('remove');
    });
  });
});
