import type { RequestContext } from '../auth/context';

// ── Input types ─────────────────────────────────────────────────

export interface AccountingPostJournalInput {
  businessDate: string;
  sourceModule: string;
  sourceReferenceId: string;
  memo: string;
  currency?: string;
  lines: Array<{
    accountId: string;
    debitAmount?: string;
    creditAmount?: string;
    locationId?: string;
    departmentId?: string;
    customerId?: string;
    vendorId?: string;
    profitCenterId?: string;
    subDepartmentId?: string;
    terminalId?: string;
    channel?: string;
    memo?: string;
  }>;
  forcePost?: boolean;
}

// ── Interface ───────────────────────────────────────────────────

export interface AccountingPostingApi {
  postEntry(
    ctx: RequestContext,
    input: AccountingPostJournalInput,
  ): Promise<{ id: string; journalNumber: number; status: string }>;

  getAccountBalance(
    tenantId: string,
    accountId: string,
    asOfDate?: string,
  ): Promise<number>;

  getSettings(
    tenantId: string,
  ): Promise<{
    defaultAPControlAccountId: string | null;
    defaultARControlAccountId: string | null;
    baseCurrency: string;
    enableLegacyGlPosting?: boolean;
  }>;
}

// ── Singleton ───────────────────────────────────────────────────

// Use globalThis to persist across Next.js HMR module reloads in dev mode
const GLOBAL_KEY = '__oppsera_accounting_posting_api__' as const;

export function getAccountingPostingApi(): AccountingPostingApi {
  const api = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as AccountingPostingApi | undefined;
  if (!api) throw new Error('AccountingPostingApi not initialized');
  return api;
}

export function setAccountingPostingApi(api: AccountingPostingApi): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = api;
}
