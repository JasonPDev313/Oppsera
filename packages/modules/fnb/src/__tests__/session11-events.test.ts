import { describe, it, expect } from 'vitest';
import { FNB_EVENTS } from '../events/types';
import type {
  GlPostingCreatedPayload,
  GlPostingReversedPayload,
  GlPostingFailedPayload,
} from '../events/types';

describe('Session 11 Events', () => {
  it('has all Session 11 event constants', () => {
    expect(FNB_EVENTS.GL_POSTING_CREATED).toBe('fnb.gl.posting_created.v1');
    expect(FNB_EVENTS.GL_POSTING_REVERSED).toBe('fnb.gl.posting_reversed.v1');
    expect(FNB_EVENTS.GL_POSTING_FAILED).toBe('fnb.gl.posting_failed.v1');
  });

  it('event constants follow naming convention', () => {
    const s11Events = [
      FNB_EVENTS.GL_POSTING_CREATED,
      FNB_EVENTS.GL_POSTING_REVERSED,
      FNB_EVENTS.GL_POSTING_FAILED,
    ];
    for (const evt of s11Events) {
      expect(evt).toMatch(/^fnb\.[a-z][a-z_]*(\.[a-z][a-z_]*)+\.v\d+$/);
    }
  });

  it('payload interfaces are structurally valid', () => {
    const postingCreated: GlPostingCreatedPayload = {
      closeBatchId: 'batch-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      glJournalEntryId: 'je-1',
      totalDebitCents: 150000,
      totalCreditCents: 150000,
      lineCount: 8,
    };
    expect(postingCreated.totalDebitCents).toBe(150000);

    const postingReversed: GlPostingReversedPayload = {
      closeBatchId: 'batch-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      originalGlJournalEntryId: 'je-1',
      reversalGlJournalEntryId: 'je-2',
      reason: 'Incorrect classification',
    };
    expect(postingReversed.reason).toBe('Incorrect classification');

    const postingFailed: GlPostingFailedPayload = {
      closeBatchId: 'batch-1',
      locationId: 'loc-1',
      businessDate: '2026-02-21',
      errorCode: 'UNBALANCED_JOURNAL',
      errorMessage: 'Debits do not equal credits',
    };
    expect(postingFailed.errorCode).toBe('UNBALANCED_JOURNAL');
  });
});
