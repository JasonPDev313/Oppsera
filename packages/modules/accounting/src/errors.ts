import { AppError } from '@oppsera/shared';

export class UnbalancedJournalError extends AppError {
  constructor(debitTotal: number, creditTotal: number) {
    super(
      'UNBALANCED_JOURNAL',
      `Journal entry is unbalanced: debits=${debitTotal}, credits=${creditTotal}`,
      400,
    );
  }
}

export class PeriodLockedError extends AppError {
  constructor(period: string) {
    super('PERIOD_LOCKED', `Posting period ${period} is locked`, 409);
  }
}

export class ImmutableEntryError extends AppError {
  constructor(entryId: string) {
    super('IMMUTABLE_ENTRY', `Journal entry ${entryId} is posted and cannot be modified`, 409);
  }
}

export class ControlAccountError extends AppError {
  constructor(accountId: string, reason: string) {
    super('CONTROL_ACCOUNT_RESTRICTED', `Control account ${accountId}: ${reason}`, 403);
  }
}

export class MissingMappingError extends AppError {
  constructor(entityType: string, entityId: string) {
    super('MISSING_GL_MAPPING', `No GL mapping found for ${entityType} ${entityId}`, 400);
  }
}

export class CurrencyMismatchError extends AppError {
  constructor(provided: string, base: string) {
    super(
      'CURRENCY_MISMATCH',
      `Multi-currency is not yet supported. Provided: ${provided}, base: ${base}`,
      400,
    );
  }
}
