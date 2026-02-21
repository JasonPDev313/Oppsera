import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type {
  CloseBatchStartedPayload,
  ServerCheckedOutPayload,
  CloseBatchReconciledPayload,
  CloseBatchPostedPayload,
  DepositRecordedPayload,
} from '../events/types';

describe('Session 10 Events', () => {
  it('has all Session 10 event constants', () => {
    expect(FNB_EVENTS.CLOSE_BATCH_STARTED).toBe('fnb.close_batch.started.v1');
    expect(FNB_EVENTS.SERVER_CHECKED_OUT).toBe('fnb.close_batch.server_checked_out.v1');
    expect(FNB_EVENTS.CLOSE_BATCH_RECONCILED).toBe('fnb.close_batch.reconciled.v1');
    expect(FNB_EVENTS.CLOSE_BATCH_POSTED).toBe('fnb.close_batch.posted.v1');
    expect(FNB_EVENTS.DEPOSIT_RECORDED).toBe('fnb.close_batch.deposit_recorded.v1');
  });

  it('event constants follow naming convention', () => {
    const s10Events = [
      FNB_EVENTS.CLOSE_BATCH_STARTED,
      FNB_EVENTS.SERVER_CHECKED_OUT,
      FNB_EVENTS.CLOSE_BATCH_RECONCILED,
      FNB_EVENTS.CLOSE_BATCH_POSTED,
      FNB_EVENTS.DEPOSIT_RECORDED,
    ];
    for (const evt of s10Events) {
      expect(evt).toMatch(/^fnb\.[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/);
    }
  });

  it('payload interfaces are structurally valid', () => {
    const batchStarted: CloseBatchStartedPayload = {
      closeBatchId: 'batch-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      startedBy: 'user-1',
      startingFloatCents: 50000,
    };
    expect(batchStarted.startingFloatCents).toBe(50000);

    const serverCheckedOut: ServerCheckedOutPayload = {
      checkoutId: 'co-1',
      closeBatchId: 'batch-1',
      serverUserId: 'user-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      totalSalesCents: 150000,
      cashOwedToHouseCents: 12000,
    };
    expect(serverCheckedOut.totalSalesCents).toBe(150000);

    const batchReconciled: CloseBatchReconciledPayload = {
      closeBatchId: 'batch-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      reconciledBy: 'mgr-1',
      cashOverShortCents: -500,
    };
    expect(batchReconciled.cashOverShortCents).toBe(-500);

    const batchPosted: CloseBatchPostedPayload = {
      closeBatchId: 'batch-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      postedBy: 'mgr-1',
      glJournalEntryId: 'je-1',
    };
    expect(batchPosted.glJournalEntryId).toBe('je-1');

    const depositRecorded: DepositRecordedPayload = {
      depositId: 'dep-1',
      closeBatchId: 'batch-1',
      locationId: 'loc-1',
      depositAmountCents: 100000,
      depositDate: '2026-02-22',
    };
    expect(depositRecorded.depositAmountCents).toBe(100000);
  });
});
