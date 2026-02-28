export const ACCOUNTING_EVENTS = {
  JOURNAL_POSTED: 'accounting.journal.posted.v1',
  JOURNAL_DRAFTED: 'accounting.journal.drafted.v1',
  JOURNAL_VOIDED: 'accounting.journal.voided.v1',
  PERIOD_LOCKED: 'accounting.period.locked.v1',
  POSTING_SKIPPED: 'accounting.posting.skipped.v1',
  PERIOD_CLOSED: 'accounting.period.closed.v1',
  BUDGET_CREATED: 'accounting.budget.created.v1',
  BUDGET_UPDATED: 'accounting.budget.updated.v1',
  BUDGET_APPROVED: 'accounting.budget.approved.v1',
  BUDGET_LOCKED: 'accounting.budget.locked.v1',
  BUDGET_LINES_UPDATED: 'accounting.budget.lines_updated.v1',
  FIXED_ASSET_CREATED: 'accounting.fixed_asset.created.v1',
  FIXED_ASSET_UPDATED: 'accounting.fixed_asset.updated.v1',
  FIXED_ASSET_DEPRECIATED: 'accounting.fixed_asset.depreciated.v1',
  FIXED_ASSET_DISPOSED: 'accounting.fixed_asset.disposed.v1',
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
