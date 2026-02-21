import { eq, and, inArray } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { glAccounts, accountingSettings } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import {
  UnbalancedJournalError,
  PeriodLockedError,
  ControlAccountError,
  CurrencyMismatchError,
} from '../errors';

export interface JournalLineInput {
  accountId: string;
  debitAmount?: string;
  creditAmount?: string;
  locationId?: string;
  departmentId?: string;
  customerId?: string;
  vendorId?: string;
  memo?: string;
}

interface ValidateJournalParams {
  tenantId: string;
  businessDate: string;
  currency?: string;
  lines: JournalLineInput[];
  sourceModule: string;
  hasControlAccountPermission?: boolean;
}

interface ValidatedJournal {
  postingPeriod: string;
  settings: {
    baseCurrency: string;
    autoPostMode: string;
    lockPeriodThrough: string | null;
    defaultRoundingAccountId: string | null;
    roundingToleranceCents: number;
  };
  validatedLines: Array<
    JournalLineInput & { debit: number; credit: number }
  >;
  roundingLine: { accountId: string; debitAmount: string; creditAmount: string } | null;
}

export async function validateJournal(
  tx: Database,
  params: ValidateJournalParams,
): Promise<ValidatedJournal> {
  const { tenantId, businessDate, currency, lines, sourceModule, hasControlAccountPermission } = params;

  // 1. Load settings
  const [settingsRow] = await tx
    .select()
    .from(accountingSettings)
    .where(eq(accountingSettings.tenantId, tenantId))
    .limit(1);

  const settings = settingsRow ?? {
    baseCurrency: 'USD',
    autoPostMode: 'auto_post',
    lockPeriodThrough: null,
    defaultRoundingAccountId: null,
    roundingToleranceCents: 5,
  };

  // 2. Currency check
  const entryCurrency = currency ?? 'USD';
  if (entryCurrency !== settings.baseCurrency) {
    throw new CurrencyMismatchError(entryCurrency, settings.baseCurrency);
  }

  // 3. Derive posting period
  const postingPeriod = businessDate.substring(0, 7); // 'YYYY-MM'

  // 4. Period lock check
  if (settings.lockPeriodThrough && postingPeriod <= settings.lockPeriodThrough) {
    throw new PeriodLockedError(postingPeriod);
  }

  // 5. Validate all accounts exist and are active
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await tx
    .select()
    .from(glAccounts)
    .where(and(eq(glAccounts.tenantId, tenantId), inArray(glAccounts.id, accountIds)));

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  for (const line of lines) {
    const account = accountMap.get(line.accountId);
    if (!account) {
      throw new NotFoundError('GL Account', line.accountId);
    }
    if (!account.isActive) {
      throw new NotFoundError('GL Account (inactive)', line.accountId);
    }
  }

  // 6. Control account enforcement
  for (const line of lines) {
    const account = accountMap.get(line.accountId)!;
    if (account.isControlAccount) {
      if (sourceModule === 'manual') {
        if (!hasControlAccountPermission) {
          throw new ControlAccountError(
            account.id,
            'Manual posting to control accounts requires accounting.control_account.post permission',
          );
        }
      } else if (account.controlAccountType) {
        // Non-manual sources must match the control account type
        const allowedSources = getAllowedSourcesForControlType(account.controlAccountType);
        if (!allowedSources.includes(sourceModule)) {
          throw new ControlAccountError(
            account.id,
            `Source module '${sourceModule}' cannot post to ${account.controlAccountType} control account`,
          );
        }
      }
    }
  }

  // 7. Parse amounts and validate balance
  const validatedLines = lines.map((line) => ({
    ...line,
    debit: Number(line.debitAmount ?? '0'),
    credit: Number(line.creditAmount ?? '0'),
  }));

  let totalDebits = 0;
  let totalCredits = 0;
  for (const line of validatedLines) {
    totalDebits += line.debit;
    totalCredits += line.credit;
  }

  // Round to 2 decimal places to avoid floating point issues
  totalDebits = Math.round(totalDebits * 100) / 100;
  totalCredits = Math.round(totalCredits * 100) / 100;

  const differenceInCents = Math.round(Math.abs(totalDebits - totalCredits) * 100);
  let roundingLine: ValidatedJournal['roundingLine'] = null;

  if (differenceInCents > 0) {
    if (differenceInCents <= settings.roundingToleranceCents) {
      if (!settings.defaultRoundingAccountId) {
        throw new UnbalancedJournalError(totalDebits, totalCredits);
      }
      // Auto-correct with rounding line
      const roundingAmount = (Math.round((totalDebits - totalCredits) * 100) / 100).toFixed(2);
      if (totalDebits > totalCredits) {
        roundingLine = {
          accountId: settings.defaultRoundingAccountId,
          debitAmount: '0',
          creditAmount: Math.abs(Number(roundingAmount)).toFixed(2),
        };
      } else {
        roundingLine = {
          accountId: settings.defaultRoundingAccountId,
          debitAmount: Math.abs(Number(roundingAmount)).toFixed(2),
          creditAmount: '0',
        };
      }
    } else {
      throw new UnbalancedJournalError(totalDebits, totalCredits);
    }
  }

  return {
    postingPeriod,
    settings: {
      baseCurrency: settings.baseCurrency,
      autoPostMode: settings.autoPostMode,
      lockPeriodThrough: settings.lockPeriodThrough,
      defaultRoundingAccountId: settings.defaultRoundingAccountId,
      roundingToleranceCents: settings.roundingToleranceCents,
    },
    validatedLines,
    roundingLine,
  };
}

function getAllowedSourcesForControlType(controlAccountType: string): string[] {
  switch (controlAccountType) {
    case 'ap':
      return ['ap', 'manual'];
    case 'ar':
      return ['ar', 'manual'];
    case 'sales_tax':
      return ['pos', 'ar', 'manual'];
    case 'undeposited_funds':
      return ['pos', 'manual'];
    case 'bank':
      return ['ap', 'ar', 'pos', 'manual'];
    default:
      return ['manual'];
  }
}
