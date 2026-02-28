import { setAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { AccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';

/**
 * Wire the AccountingPostingApi singleton so AP, AR, and POS adapters
 * can post GL entries without importing @oppsera/module-accounting directly.
 */
export async function initializeAccountingPostingApi(): Promise<void> {
  const { postJournalEntry, getAccountBalances, getAccountingSettings } = await import('@oppsera/module-accounting');
  const { db } = await import('@oppsera/db');

  const api: AccountingPostingApi = {
    postEntry: async (ctx, input) => {
      const result = await postJournalEntry(ctx, {
        businessDate: input.businessDate,
        sourceModule: input.sourceModule,
        sourceReferenceId: input.sourceReferenceId,
        memo: input.memo,
        currency: input.currency,
        transactionCurrency: input.transactionCurrency,
        exchangeRate: input.exchangeRate,
        lines: input.lines,
        forcePost: input.forcePost,
      }, { hasControlAccountPermission: true });
      return { id: result.id, journalNumber: result.journalNumber, status: result.status };
    },

    getAccountBalance: async (tenantId, accountId, asOfDate) => {
      const balances = await getAccountBalances({ tenantId, accountIds: [accountId], asOfDate });
      return balances[0]?.balance ?? 0;
    },

    getSettings: async (tenantId) => {
      const settings = await getAccountingSettings(db, tenantId);
      return {
        defaultAPControlAccountId: settings?.defaultAPControlAccountId ?? null,
        defaultARControlAccountId: settings?.defaultARControlAccountId ?? null,
        defaultUndepositedFundsAccountId: settings?.defaultUndepositedFundsAccountId ?? null,
        defaultUncategorizedRevenueAccountId: settings?.defaultUncategorizedRevenueAccountId ?? null,
        baseCurrency: settings?.baseCurrency ?? 'USD',
        enableLegacyGlPosting: settings?.enableLegacyGlPosting ?? true,
      };
    },

    ensureSettings: async (tenantId) => {
      const { ensureAccountingSettings } = await import('@oppsera/module-accounting');
      await ensureAccountingSettings(db, tenantId);
    },
  };

  setAccountingPostingApi(api);
}
