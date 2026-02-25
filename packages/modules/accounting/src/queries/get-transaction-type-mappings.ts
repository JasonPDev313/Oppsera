import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { getMappedStatusRule } from '@oppsera/shared';
import type { TransactionTypeCategory } from '@oppsera/shared';

export interface TransactionTypeMappingRow {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  defaultDebitAccountType: string | null;
  defaultCreditAccountType: string | null;
  sortOrder: number;
  // New Credit/Debit mapping (from gl_transaction_type_mappings)
  creditAccountId: string | null;
  creditAccountDisplay: string | null;
  debitAccountId: string | null;
  debitAccountDisplay: string | null;
  mappingSource: string | null;
  isMapped: boolean;
  // Legacy GL mapping (from payment_type_gl_defaults) — still used by POS adapter
  cashAccountId: string | null;
  cashAccountDisplay: string | null;
  clearingAccountId: string | null;
  clearingAccountDisplay: string | null;
  feeExpenseAccountId: string | null;
  feeExpenseAccountDisplay: string | null;
  expenseAccountId: string | null;
  expenseAccountDisplay: string | null;
  postingMode: string | null;
  mappingDescription: string | null;
  // Tender type info (for custom types)
  tenderTypeId: string | null;
  tenderCategory: string | null;
  requiresReference: boolean;
  referenceLabel: string | null;
  reportingBucket: string | null;
}

interface GetTransactionTypeMappingsInput {
  tenantId: string;
  category?: string;
  includeInactive?: boolean;
}

/**
 * Determine isMapped based on category-aware rules:
 * - tender: debit set
 * - revenue/tax/tip: credit set
 * - deposit/refund/settlement/ar/ap/inventory/membership: both set
 * - other: either set
 */
function computeIsMapped(
  category: string,
  creditAccountId: string | null,
  debitAccountId: string | null,
): boolean {
  const rule = getMappedStatusRule(category as TransactionTypeCategory);
  switch (rule) {
    case 'debit':
      return debitAccountId != null;
    case 'credit':
      return creditAccountId != null;
    case 'both':
      return creditAccountId != null && debitAccountId != null;
    case 'either':
      return creditAccountId != null || debitAccountId != null;
    default:
      return false;
  }
}

export async function getTransactionTypeMappings(
  input: GetTransactionTypeMappingsInput,
): Promise<TransactionTypeMappingRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    // Build WHERE conditions
    const conditions = [
      sql`(gtt.tenant_id IS NULL OR gtt.tenant_id = ${input.tenantId})`,
    ];
    if (input.category) {
      conditions.push(sql`gtt.category = ${input.category}`);
    }
    if (!input.includeInactive) {
      conditions.push(sql`gtt.is_active = true`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        gtt.id,
        gtt.code,
        gtt.name,
        gtt.category,
        gtt.description,
        gtt.is_system,
        gtt.is_active,
        gtt.default_debit_account_type,
        gtt.default_credit_account_type,
        gtt.sort_order,
        -- New Credit/Debit mapping
        ttm.credit_account_id,
        cra.account_number || ' - ' || cra.name AS credit_account_display,
        ttm.debit_account_id,
        dba.account_number || ' - ' || dba.name AS debit_account_display,
        ttm.source AS mapping_source,
        -- Legacy GL mapping (still drives POS adapter)
        ptgd.cash_account_id,
        ca.account_number || ' - ' || ca.name AS cash_account_display,
        ptgd.clearing_account_id,
        cla.account_number || ' - ' || cla.name AS clearing_account_display,
        ptgd.fee_expense_account_id,
        fea.account_number || ' - ' || fea.name AS fee_expense_account_display,
        ptgd.expense_account_id,
        ea.account_number || ' - ' || ea.name AS expense_account_display,
        ptgd.posting_mode,
        ptgd.description AS mapping_description,
        -- Tender type info
        ttt.id AS tender_type_id,
        ttt.category AS tender_category,
        COALESCE(ttt.requires_reference, false) AS requires_reference,
        ttt.reference_label,
        ttt.reporting_bucket
      FROM gl_transaction_types gtt
      LEFT JOIN gl_transaction_type_mappings ttm
        ON ttm.tenant_id = ${input.tenantId}
        AND ttm.transaction_type_code = gtt.code
        AND ttm.location_id IS NULL
      LEFT JOIN gl_accounts cra ON cra.id = ttm.credit_account_id
      LEFT JOIN gl_accounts dba ON dba.id = ttm.debit_account_id
      LEFT JOIN payment_type_gl_defaults ptgd
        ON ptgd.tenant_id = ${input.tenantId}
        AND ptgd.payment_type_id = gtt.code
      LEFT JOIN gl_accounts ca ON ca.id = ptgd.cash_account_id
      LEFT JOIN gl_accounts cla ON cla.id = ptgd.clearing_account_id
      LEFT JOIN gl_accounts fea ON fea.id = ptgd.fee_expense_account_id
      LEFT JOIN gl_accounts ea ON ea.id = ptgd.expense_account_id
      LEFT JOIN tenant_tender_types ttt
        ON ttt.tenant_id = ${input.tenantId}
        AND ttt.code = gtt.code
      WHERE ${whereClause}
      ORDER BY gtt.sort_order ASC, gtt.name ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => {
      const category = String(row.category);
      const creditAccountId = row.credit_account_id != null ? String(row.credit_account_id) : null;
      const debitAccountId = row.debit_account_id != null ? String(row.debit_account_id) : null;

      return {
        id: String(row.id),
        code: String(row.code),
        name: String(row.name),
        category,
        description: row.description != null ? String(row.description) : null,
        isSystem: Boolean(row.is_system),
        isActive: Boolean(row.is_active),
        defaultDebitAccountType: row.default_debit_account_type != null ? String(row.default_debit_account_type) : null,
        defaultCreditAccountType: row.default_credit_account_type != null ? String(row.default_credit_account_type) : null,
        sortOrder: Number(row.sort_order),
        // New Credit/Debit
        creditAccountId,
        creditAccountDisplay: row.credit_account_display != null ? String(row.credit_account_display) : null,
        debitAccountId,
        debitAccountDisplay: row.debit_account_display != null ? String(row.debit_account_display) : null,
        mappingSource: row.mapping_source != null ? String(row.mapping_source) : null,
        isMapped: computeIsMapped(category, creditAccountId, debitAccountId),
        // Legacy
        cashAccountId: row.cash_account_id != null ? String(row.cash_account_id) : null,
        cashAccountDisplay: row.cash_account_display != null ? String(row.cash_account_display) : null,
        clearingAccountId: row.clearing_account_id != null ? String(row.clearing_account_id) : null,
        clearingAccountDisplay: row.clearing_account_display != null ? String(row.clearing_account_display) : null,
        feeExpenseAccountId: row.fee_expense_account_id != null ? String(row.fee_expense_account_id) : null,
        feeExpenseAccountDisplay: row.fee_expense_account_display != null ? String(row.fee_expense_account_display) : null,
        expenseAccountId: row.expense_account_id != null ? String(row.expense_account_id) : null,
        expenseAccountDisplay: row.expense_account_display != null ? String(row.expense_account_display) : null,
        postingMode: row.posting_mode != null ? String(row.posting_mode) : null,
        mappingDescription: row.mapping_description != null ? String(row.mapping_description) : null,
        // Tender type info
        tenderTypeId: row.tender_type_id != null ? String(row.tender_type_id) : null,
        tenderCategory: row.tender_category != null ? String(row.tender_category) : null,
        requiresReference: Boolean(row.requires_reference),
        referenceLabel: row.reference_label != null ? String(row.reference_label) : null,
        reportingBucket: row.reporting_bucket != null ? String(row.reporting_bucket) : null,
      };
    });
  });
}
