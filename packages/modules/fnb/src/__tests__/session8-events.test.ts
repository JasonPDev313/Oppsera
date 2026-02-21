import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type {
  PreauthCreatedPayload,
  PreauthCapturedPayload,
  TipAdjustedPayload,
  TipFinalizedPayload,
  TabWalkoutPayload,
} from '../events/types';

describe('Session 8 Events', () => {
  it('has all Session 8 event constants', () => {
    expect(FNB_EVENTS.PREAUTH_CREATED).toBe('fnb.preauth.created.v1');
    expect(FNB_EVENTS.PREAUTH_CAPTURED).toBe('fnb.preauth.captured.v1');
    expect(FNB_EVENTS.TIP_ADJUSTED).toBe('fnb.preauth.tip_adjusted.v1');
    expect(FNB_EVENTS.TIP_FINALIZED).toBe('fnb.preauth.tip_finalized.v1');
    expect(FNB_EVENTS.TAB_WALKOUT).toBe('fnb.tab.walkout.v1');
  });

  it('event constants follow naming convention', () => {
    const s8Events = [
      FNB_EVENTS.PREAUTH_CREATED,
      FNB_EVENTS.PREAUTH_CAPTURED,
      FNB_EVENTS.TIP_ADJUSTED,
      FNB_EVENTS.TIP_FINALIZED,
      FNB_EVENTS.TAB_WALKOUT,
    ];
    for (const evt of s8Events) {
      expect(evt).toMatch(/^fnb\.[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/);
    }
  });

  it('payload interfaces are structurally valid', () => {
    const preauthCreated: PreauthCreatedPayload = {
      preauthId: 'pre-1',
      tabId: 'tab-1',
      locationId: 'loc-1',
      authAmountCents: 5000,
      cardLast4: '4242',
      cardBrand: 'visa',
      expiresAt: '2026-02-22T00:00:00Z',
    };
    expect(preauthCreated.authAmountCents).toBe(5000);

    const preauthCaptured: PreauthCapturedPayload = {
      preauthId: 'pre-1',
      tabId: 'tab-1',
      locationId: 'loc-1',
      authAmountCents: 5000,
      capturedAmountCents: 4500,
      tipAmountCents: 900,
    };
    expect(preauthCaptured.capturedAmountCents).toBe(4500);

    const tipAdjusted: TipAdjustedPayload = {
      adjustmentId: 'adj-1',
      tabId: 'tab-1',
      locationId: 'loc-1',
      preauthId: 'pre-1',
      tenderId: null,
      originalTipCents: 500,
      adjustedTipCents: 1000,
    };
    expect(tipAdjusted.adjustedTipCents).toBe(1000);

    const tipFinalized: TipFinalizedPayload = {
      tabId: 'tab-1',
      locationId: 'loc-1',
      adjustmentCount: 2,
      totalFinalizedTipCents: 1500,
    };
    expect(tipFinalized.totalFinalizedTipCents).toBe(1500);

    const tabWalkout: TabWalkoutPayload = {
      tabId: 'tab-1',
      locationId: 'loc-1',
      preauthId: 'pre-1',
      capturedAmountCents: 5000,
      autoGratuityPercentage: 20,
    };
    expect(tabWalkout.capturedAmountCents).toBe(5000);
  });
});
