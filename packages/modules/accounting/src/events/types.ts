export const ACCOUNTING_EVENTS = {
  JOURNAL_POSTED: 'accounting.journal.posted.v1',
  JOURNAL_DRAFTED: 'accounting.journal.drafted.v1',
  JOURNAL_VOIDED: 'accounting.journal.voided.v1',
  PERIOD_LOCKED: 'accounting.period.locked.v1',
  POSTING_SKIPPED: 'accounting.posting.skipped.v1',
  PERIOD_CLOSED: 'accounting.period.closed.v1',
} as const;

export interface JournalPostedPayload {
  journalEntryId: string;
  journalNumber: number;
  sourceModule: string;
  sourceReferenceId: string | null;
  businessDate: string;
  totalAmount: number;
  lineCount: number;
}

export interface JournalVoidedPayload {
  journalEntryId: string;
  reversalEntryId: string;
  reason: string;
}

export interface PeriodLockedPayload {
  period: string;
}

export interface PostingSkippedPayload {
  sourceModule: string;
  sourceReferenceId: string;
  reason: string;
}

export interface PeriodClosedPayload {
  period: string;
  closedBy: string;
}
