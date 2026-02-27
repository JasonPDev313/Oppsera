import type { EventEnvelope } from '@oppsera/shared';
import { db, fnbGlAccountMappings, subDepartmentGlDefaults, glJournalEntries } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { voidJournalEntry } from '../commands/void-journal-entry';

interface FnbJournalLine {
  category: string;
  description: string;
  debitCents: number;
  creditCents: number;
  subDepartmentId?: string | null;
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

/**
 * Resolves a revenue GL account via catalog sub-department GL defaults.
 * This allows F&B revenue to map through the same sub-department GL resolution
 * as retail POS, since F&B items ARE catalog items.
 */
async function resolveRevenueBySubDepartment(
  tenantId: string,
  subDepartmentId: string,
): Promise<string | null> {
  const rows = await db
    .select({ revenueAccountId: subDepartmentGlDefaults.revenueAccountId })
    .from(subDepartmentGlDefaults)
    .where(
      and(
        eq(subDepartmentGlDefaults.tenantId, tenantId),
        eq(subDepartmentGlDefaults.subDepartmentId, subDepartmentId),
      ),
    )
    .limit(1);
  return rows[0]?.revenueAccountId ?? null;
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
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'fnb.gl.posting_created.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.closeBatchId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL F&B posting skipped — accounting settings missing even after ensureAccountingSettings. Investigate immediately.',
        });
      } catch { /* never block F&B ops */ }
      console.error(`[fnb-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

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
      subDepartmentId?: string;
      memo?: string;
    }> = [];

    for (const jl of data.journalLines) {
      let accountId: string | null = null;

      // For revenue lines with sub-department, resolve via catalog GL defaults
      if (jl.category === 'sales_revenue' && jl.subDepartmentId) {
        accountId = await resolveRevenueBySubDepartment(event.tenantId, jl.subDepartmentId);
        // Fallback to uncategorized revenue if sub-dept has no mapping
        if (!accountId) {
          accountId = settings.defaultUncategorizedRevenueAccountId ?? null;
        }
      }

      // All other categories (and revenue without sub-dept) use existing F&B mapping resolution
      if (!accountId) {
        accountId = resolveAccountForCategory(jl.category, mappingLookup, settings);
      }

      if (!accountId) {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'fnb.gl.posting_created.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.closeBatchId,
          entityType: jl.category,
          entityId: data.closeBatchId,
          reason: `No GL account mapped for F&B category: ${jl.category}${jl.subDepartmentId ? ` (sub-dept: ${jl.subDepartmentId})` : ''}`,
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
          subDepartmentId: jl.subDepartmentId ?? undefined,
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
          subDepartmentId: jl.subDepartmentId ?? undefined,
          memo: jl.description,
        });
      }
    }

    // Post-construction balance check — if skipped categories created imbalance,
    // add a remainder line so debits = credits (same pattern as return adapter safety net)
    if (glLines.length >= 2) {
      const totalDebitsD = glLines.reduce((s, l) => s + Number(l.debitAmount ?? 0), 0);
      const totalCreditsD = glLines.reduce((s, l) => s + Number(l.creditAmount ?? 0), 0);
      const diffCents = Math.round((totalDebitsD - totalCreditsD) * 100);
      if (diffCents !== 0) {
        const fallbackAccountId = settings.defaultUncategorizedRevenueAccountId ?? null;
        if (fallbackAccountId) {
          if (diffCents > 0) {
            glLines.push({
              accountId: fallbackAccountId,
              debitAmount: '0',
              creditAmount: (diffCents / 100).toFixed(2),
              locationId: data.locationId,
              channel: 'fnb',
              memo: 'Balance adjustment — unmapped F&B category offset',
            });
          } else {
            glLines.push({
              accountId: fallbackAccountId,
              debitAmount: (Math.abs(diffCents) / 100).toFixed(2),
              creditAmount: '0',
              locationId: data.locationId,
              channel: 'fnb',
              memo: 'Balance adjustment — unmapped F&B category offset',
            });
          }
          try {
            await logUnmappedEvent(db, event.tenantId, {
              eventType: 'fnb.gl.posting_created.v1',
              sourceModule: 'fnb',
              sourceReferenceId: data.closeBatchId,
              entityType: 'balance_adjustment',
              entityId: data.closeBatchId,
              reason: `F&B close batch required $${(Math.abs(diffCents) / 100).toFixed(2)} balance adjustment due to unmapped categories. Resolve GL mappings for full accuracy.`,
            });
          } catch { /* best-effort */ }
        }
      }
    }

    if (glLines.length < 2) {
      // Log unmapped event — entry dropped because too few lines resolved to GL accounts
      if (data.journalLines.length > 0) {
        try {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'fnb.gl.posting_created.v1',
            sourceModule: 'fnb',
            sourceReferenceId: data.closeBatchId,
            entityType: 'posting_insufficient_lines',
            entityId: data.closeBatchId,
            reason: `F&B close batch had ${data.journalLines.length} journal lines but only ${glLines.length} resolved to GL accounts — entry dropped (need at least 2 for double-entry). Check F&B GL account mappings.`,
          });
        } catch { /* best-effort */ }
      }
      return;
    }

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
      return m?.revenueAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;
    }

    case 'tax_payable': {
      const m = findMapping('tax');
      return m?.liabilityAccountId ?? settings.defaultSalesTaxPayableAccountId ?? null;
    }

    // V2: split tip categories
    case 'tips_payable_credit': {
      const m = findMapping('tips_credit');
      return m?.liabilityAccountId ?? settings.defaultTipsPayableAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;
    }
    case 'tips_payable_cash': {
      const m = findMapping('tips_cash');
      return m?.liabilityAccountId ?? settings.defaultTipsPayableAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;
    }
    // V1 backward compat
    case 'tips_payable':
      return settings.defaultTipsPayableAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;

    case 'service_charge_revenue': {
      const m = findMapping('service_charge');
      return m?.revenueAccountId ?? settings.defaultServiceChargeRevenueAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;
    }

    case 'discount': {
      const m = findMapping('discount');
      return m?.contraRevenueAccountId ?? m?.expenseAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;
    }

    case 'comp_expense': {
      const m = findMapping('comp');
      return m?.expenseAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;
    }

    case 'cash_over_short': {
      const m = findMapping('cash_over_short');
      return m?.expenseAccountId ?? settings.defaultRoundingAccountId ?? null;
    }

    case 'processing_fee': {
      const m = findMapping('processing_fee');
      return m?.expenseAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;
    }

    case 'auto_gratuity': {
      const m = findMapping('auto_gratuity');
      return m?.liabilityAccountId ?? settings.defaultTipsPayableAccountId ?? settings.defaultUncategorizedRevenueAccountId ?? null;
    }

    default:
      return null;
  }
}

interface FnbGlPostingReversedPayload {
  closeBatchId: string;
  locationId: string;
  businessDate: string;
  originalGlJournalEntryId: string;
  reversalGlJournalEntryId: string;
  reason: string;
}

/**
 * Handles fnb.gl.posting_reversed.v1 events.
 *
 * When an F&B close batch is reversed, the original GL journal entry must be
 * voided. The fnb module stores a synthetic reference (`fnb-batch-{closeBatchId}`)
 * in `gl_journal_entry_id`, NOT a real GL entry ID. We look up the real entry
 * by sourceModule='fnb' + sourceReferenceId=closeBatchId.
 */
export async function handleFnbGlPostingReversedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as FnbGlPostingReversedPayload;

  try {
    // Look up the real GL journal entry by sourceModule + sourceReferenceId
    // The fnb-posting-adapter uses sourceModule='fnb' and sourceReferenceId=closeBatchId
    const entries = await db
      .select({ id: glJournalEntries.id, status: glJournalEntries.status })
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.tenantId, event.tenantId),
          eq(glJournalEntries.sourceModule, 'fnb'),
          eq(glJournalEntries.sourceReferenceId, data.closeBatchId),
        ),
      )
      .limit(1);

    if (entries.length === 0) {
      // No GL entry exists — batch may have been posted before GL was wired, or GL posting failed.
      // Log but don't throw.
      console.warn(`[fnb-gl-reversal] No GL entry found for F&B batch ${data.closeBatchId} — nothing to void`);
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'fnb.gl.posting_reversed.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.closeBatchId,
          entityType: 'gl_entry_not_found',
          entityId: data.closeBatchId,
          reason: `F&B batch reversal: no GL entry found for sourceModule=fnb, sourceReferenceId=${data.closeBatchId}. Original GL ref was ${data.originalGlJournalEntryId}. GL may not have been posted for this batch.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const glEntry = entries[0]!;

    // Already voided — idempotent
    if (glEntry.status === 'voided') {
      return;
    }

    // Build a synthetic RequestContext for voidJournalEntry
    const syntheticCtx = {
      tenantId: event.tenantId,
      locationId: data.locationId,
      user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId: event.tenantId, tenantStatus: 'active', membershipStatus: 'active' },
      requestId: `fnb-gl-reversal-${data.closeBatchId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    await voidJournalEntry(
      syntheticCtx,
      glEntry.id,
      `F&B batch reversal: ${data.reason}`,
      `fnb-gl-reversal-${data.closeBatchId}`,
    );
  } catch (err) {
    // Never block F&B operations
    console.error(`F&B GL reversal failed for batch ${data.closeBatchId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'fnb.gl.posting_reversed.v1',
        sourceModule: 'fnb',
        sourceReferenceId: data.closeBatchId,
        entityType: 'reversal_error',
        entityId: data.closeBatchId,
        reason: `GL reversal failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
