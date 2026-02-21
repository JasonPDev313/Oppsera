import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type {
  TipCollectedPayload,
  TipDeclaredPayload,
  TipPoolDistributedPayload,
  TipOutRecordedPayload,
} from '../events/types';

describe('Session 9 Events', () => {
  it('has all Session 9 event constants', () => {
    expect(FNB_EVENTS.TIP_COLLECTED).toBe('fnb.tip.collected.v1');
    expect(FNB_EVENTS.TIP_DECLARED).toBe('fnb.tip.declared.v1');
    expect(FNB_EVENTS.TIP_POOL_DISTRIBUTED).toBe('fnb.tip.pool_distributed.v1');
    expect(FNB_EVENTS.TIP_OUT_RECORDED).toBe('fnb.tip.tip_out_recorded.v1');
  });

  it('event constants follow naming convention', () => {
    const s9Events = [
      FNB_EVENTS.TIP_COLLECTED,
      FNB_EVENTS.TIP_DECLARED,
      FNB_EVENTS.TIP_POOL_DISTRIBUTED,
      FNB_EVENTS.TIP_OUT_RECORDED,
    ];
    for (const evt of s9Events) {
      expect(evt).toMatch(/^fnb\.[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/);
    }
  });

  it('payload interfaces are structurally valid', () => {
    const tipCollected: TipCollectedPayload = {
      tabId: 'tab-1',
      locationId: 'loc-1',
      serverUserId: 'user-1',
      tipAmountCents: 1000,
      source: 'card',
    };
    expect(tipCollected.tipAmountCents).toBe(1000);

    const tipDeclared: TipDeclaredPayload = {
      declarationId: 'decl-1',
      serverUserId: 'user-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      cashTipsDeclaredCents: 5000,
      meetsMinimumThreshold: true,
    };
    expect(tipDeclared.cashTipsDeclaredCents).toBe(5000);

    const poolDistributed: TipPoolDistributedPayload = {
      distributionId: 'dist-1',
      poolId: 'pool-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      totalPoolAmountCents: 25000,
      participantCount: 5,
    };
    expect(poolDistributed.totalPoolAmountCents).toBe(25000);

    const tipOutRecorded: TipOutRecordedPayload = {
      tipOutId: 'out-1',
      fromServerUserId: 'user-1',
      toEmployeeId: 'user-2',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      amountCents: 1500,
      calculationMethod: 'fixed',
    };
    expect(tipOutRecorded.amountCents).toBe(1500);
  });
});
