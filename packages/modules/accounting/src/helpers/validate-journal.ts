import { eq, and, inArray } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { glAccounts, accountingSettings } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { AppError } from '@oppsera/shared';
import {
  UnbalancedJournalError,
  PeriodLockedError,
  ControlAccountError,
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
  /** The currency line amounts are denominated in (defaults to base currency). */
  transactionCurrency?: string;
  /** Exchange rate from transactionCurrency → baseCurrency (required when transactionCurrency !== baseCurrency). */
  exchangeRate?: number;
  lines: JournalLineInput[];
  sourceModule: string;
  hasControlAccountPermission?: boolean;
}

interface ValidatedJournal {
  postingPeriod: string;
  /** Resolved transaction currency (3-letter ISO 4217). */
  transactionCurrency: string;
  /** Exchange rate from transactionCurrency → baseCurrency (string for DB storage). */
  exchangeRate: string;
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
  const { tenantId, businessDate, currency, transactionCurrency, exchangeRate, lines, sourceModule, hasControlAccountPermission } = params;

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
    supportedCurrencies: ['USD'],
  };

  // 2. Currency validation — resolve transactionCurrency and exchangeRate
  const baseCurrency = settings.baseCurrency;
  const resolvedTxnCurrency = transactionCurrency ?? currency ?? baseCurrency;
  const supportedList: string[] = (settings as Record<string, unknown>).supportedCurrencies as string[] ?? [baseCurrency];

  if (resolvedTxnCurrency !== baseCurrency && !supportedList.includes(resolvedTxnCurrency)) {
    throw new AppError(
      'UNSUPPORTED_CURRENCY',
      `Currency "${resolvedTxnCurrency}" is not in the tenant's supported currencies list. Supported: ${supportedList.join(', ')}`,
      400,
    );
  }

  let resolvedRate: number;
  if (resolvedTxnCurrency === baseCurrency) {
    resolvedRate = 1;
  } else if (exchangeRate != null) {
    resolvedRate = exchangeRate;
  } else {
    throw new AppError(
      'EXCHANGE_RATE_REQUIRED',
      `Exchange rate is required when transactionCurrency (${resolvedTxnCurrency}) differs from baseCurrency (${baseCurrency})`,
      400,
    );
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

      // Validate the rounding account type — must be expense or equity (misc),
      // never revenue or asset. Posting rounding to revenue inflates income;
      // posting to asset creates phantom balances.
      const roundingAccount = accountMap.get(settings.defaultRoundingAccountId);
      if (roundingAccount) {
        const invalidRoundingTypes = ['revenue', 'asset'];
        if (invalidRoundingTypes.includes(roundingAccount.accountType)) {
          console.warn(
            `[validate-journal] Rounding account ${roundingAccount.accountNumber} is type '${roundingAccount.accountType}'. ` +
            `Rounding accounts should be expense or equity type to avoid inflating revenue or creating phantom asset balances.`,
          );
        }
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
    transactionCurrency: resolvedTxnCurrency,
    exchangeRate: resolvedRate.toFixed(6),
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
  // All automated GL adapter sourceModule values that legitimately post to each control type.
  // These must stay in sync with the sourceModule values used in adapters/*.ts.
  // Manual entries require hasControlAccountPermission — that check happens separately above.
  switch (controlAccountType) {
    case 'ap':
      return ['ap', 'inventory', 'pms', 'manual'];
    case 'ar':
      return ['ar', 'customers', 'membership', 'pms', 'manual'];
    case 'sales_tax':
      return ['pos', 'pos_return', 'fnb', 'ar', 'pms', 'ach', 'manual'];
    case 'undeposited_funds':
      return [
        'pos', 'pos_return', 'fnb', 'payments', 'chargeback',
        'ach', 'ach_return', 'stored_value', 'voucher', 'pms',
        'drawer_session', 'customers', 'membership', 'inventory', 'manual',
      ];
    case 'bank':
      return [
        'ap', 'ar', 'pos', 'pos_return', 'fnb', 'payments', 'chargeback',
        'ach', 'ach_return', 'pms', 'drawer_session', 'stored_value',
        'voucher', 'customers', 'membership', 'inventory', 'manual',
      ];
    case 'pms_guest_ledger':
      return ['pms', 'manual'];
    default:
      return ['manual'];
  }
}
