import type { EventEnvelope } from '@oppsera/shared';
import { db, fnbGlAccountMappings } from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

interface FnbJournalLine {
  category: string;
  description: string;
  debitCents: number;
  creditCents: number;
}

interface FnbGlPostingPayload {
  closeBatchId: string;
  locationId: string;
  businessDate: string;
  glJournalEntryId: string;
  totalDebitCents: number;
  totalCreditCents: number;
  lineCount: number;
  journalLines: FnbJournalLine[];
}

interface FnbMappingRow {
  entityType: string;
  entityId: string;
  revenueAccountId: string | null;
  expenseAccountId: string | null;
  liabilityAccountId: string | null;
  assetAccountId: string | null;
  contraRevenueAccountId: string | null;
}

/**
 * Handles fnb.gl.posting_created.v1 events.
 *
 * Resolves abstract journal line categories from buildBatchJournalLines()
 * to actual GL account IDs using F&B GL mappings + accounting settings fallbacks.
 * Posts balanced journal entry via AccountingPostingApi.
 * Never blocks F&B operations — logs unmapped events on failure.
 */
export async function handleFnbGlPostingForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as FnbGlPostingPayload;

  try {
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) return;

    if (!data.journalLines || data.journalLines.length === 0) return;

    // Load F&B GL mappings for this location
    const mappingRows = await db
      .select()
      .from(fnbGlAccountMappings)
      .where(
        and(
          eq(fnbGlAccountMappings.tenantId, event.tenantId),
          eq(fnbGlAccountMappings.locationId, data.locationId),
        ),
      );

    // Build lookup: entityType → (entityId → mapping)
    const mappingLookup = new Map<string, Map<string, FnbMappingRow>>();
    for (const row of mappingRows) {
      if (!mappingLookup.has(row.entityType)) {
        mappingLookup.set(row.entityType, new Map());
      }
      mappingLookup.get(row.entityType)!.set(row.entityId, {
        entityType: row.entityType,
        entityId: row.entityId,
        revenueAccountId: row.revenueAccountId,
        expenseAccountId: row.expenseAccountId,
        liabilityAccountId: row.liabilityAccountId,
        assetAccountId: row.assetAccountId,
        contraRevenueAccountId: row.contraRevenueAccountId,
      });
    }

    const glLines: Array<{
      accountId: string;
      debitAmount?: string;
      creditAmount?: string;
      locationId?: string;
      channel?: string;
      memo?: string;
    }> = [];

    for (const jl of data.journalLines) {
      const accountId = resolveAccountForCategory(jl.category, mappingLookup, settings);

      if (!accountId) {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'fnb.gl.posting_created.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.closeBatchId,
          entityType: jl.category,
          entityId: data.closeBatchId,
          reason: `No GL account mapped for F&B category: ${jl.category}`,
        });
        continue;
      }

      if (jl.debitCents > 0) {
        glLines.push({
          accountId,
          debitAmount: (jl.debitCents / 100).toFixed(2),
          creditAmount: '0',
          locationId: data.locationId,
          channel: 'fnb',
          memo: jl.description,
        });
      }
      if (jl.creditCents > 0) {
        glLines.push({
          accountId,
          debitAmount: '0',
          creditAmount: (jl.creditCents / 100).toFixed(2),
          locationId: data.locationId,
          channel: 'fnb',
          memo: jl.description,
        });
      }
    }

    if (glLines.length < 2) return; // Need at least one debit + one credit

    const postingApi = getAccountingPostingApi();

    const syntheticCtx = {
      tenantId: event.tenantId,
      locationId: data.locationId,
      user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId: event.tenantId, tenantStatus: 'active', membershipStatus: 'active' },
      requestId: `fnb-gl-${data.closeBatchId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    await postingApi.postEntry(syntheticCtx, {
      businessDate: data.businessDate,
      sourceModule: 'fnb',
      sourceReferenceId: data.closeBatchId,
      memo: `F&B Close Batch ${data.closeBatchId}`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (err) {
    // Never block F&B operations
    console.error(`F&B GL posting failed for batch ${data.closeBatchId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'fnb.gl.posting_created.v1',
        sourceModule: 'fnb',
        sourceReferenceId: data.closeBatchId,
        entityType: 'posting_error',
        entityId: data.closeBatchId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}

/**
 * Resolves a journal line category to a GL account ID.
 *
 * Resolution order:
 *   1. F&B GL mapping for the category's entity type + 'default' entity ID
 *   2. Accounting settings default accounts
 *
 * V2 categories (FNB_BATCH_CATEGORY_KEYS):
 *   - cash_on_hand → fnb mapping 'payment_type' asset, or settings.defaultUndepositedFundsAccountId
 *   - undeposited_funds → fnb mapping 'payment_type' asset, or settings.defaultUndepositedFundsAccountId
 *   - sales_revenue → fnb mapping 'department' revenue
 *   - tax_payable → fnb mapping 'tax' liability, or settings.defaultSalesTaxPayableAccountId
 *   - tips_payable_credit → fnb mapping 'tips_credit' liability, or settings.defaultTipsPayableAccountId
 *   - tips_payable_cash → fnb mapping 'tips_cash' liability, or settings.defaultTipsPayableAccountId
 *   - tips_payable → (V1 compat) settings.defaultTipsPayableAccountId
 *   - service_charge_revenue → fnb mapping 'service_charge' revenue, or settings default
 *   - discount → fnb mapping 'discount' contra-revenue or expense
 *   - comp_expense → fnb mapping 'comp' expense
 *   - cash_over_short → fnb mapping 'cash_over_short' expense, or settings.defaultRoundingAccountId
 *   - processing_fee → fnb mapping 'processing_fee' expense
 *   - auto_gratuity → fnb mapping 'auto_gratuity' liability
 */
function resolveAccountForCategory(
  category: string,
  mappingLookup: Map<string, Map<string, FnbMappingRow>>,
  settings: Record<string, any>,
): string | null {
  // Helper to find mapping by entity type, checking 'default' entity
  const findMapping = (entityType: string): FnbMappingRow | undefined => {
    const entityMap = mappingLookup.get(entityType);
    if (!entityMap) return undefined;
    return entityMap.get('default');
  };

  switch (category) {
    case 'cash_on_hand': {
      const m = findMapping('payment_type');
      return m?.assetAccountId ?? settings.defaultUndepositedFundsAccountId ?? null;
    }
    case 'undeposited_funds': {
      const m = findMapping('payment_type');
      return m?.assetAccountId ?? settings.defaultUndepositedFundsAccountId ?? null;
    }

    case 'sales_revenue': {
      const m = findMapping('department');
      return m?.revenueAccountId ?? null;
    }

    case 'tax_payable': {
      const m = findMapping('tax');
      return m?.liabilityAccountId ?? settings.defaultSalesTaxPayableAccountId ?? null;
    }

    // V2: split tip categories
    case 'tips_payable_credit': {
      const m = findMapping('tips_credit');
      return m?.liabilityAccountId ?? settings.defaultTipsPayableAccountId ?? null;
    }
    case 'tips_payable_cash': {
      const m = findMapping('tips_cash');
      return m?.liabilityAccountId ?? settings.defaultTipsPayableAccountId ?? null;
    }
    // V1 backward compat
    case 'tips_payable':
      return settings.defaultTipsPayableAccountId ?? null;

    case 'service_charge_revenue': {
      const m = findMapping('service_charge');
      return m?.revenueAccountId ?? settings.defaultServiceChargeRevenueAccountId ?? null;
    }

    case 'discount': {
      const m = findMapping('discount');
      return m?.contraRevenueAccountId ?? m?.expenseAccountId ?? null;
    }

    case 'comp_expense': {
      const m = findMapping('comp');
      return m?.expenseAccountId ?? null;
    }

    case 'cash_over_short': {
      const m = findMapping('cash_over_short');
      return m?.expenseAccountId ?? settings.defaultRoundingAccountId ?? null;
    }

    case 'processing_fee': {
      const m = findMapping('processing_fee');
      return m?.expenseAccountId ?? null;
    }

    case 'auto_gratuity': {
      const m = findMapping('auto_gratuity');
      return m?.liabilityAccountId ?? null;
    }

    default:
      return null;
  }
}
