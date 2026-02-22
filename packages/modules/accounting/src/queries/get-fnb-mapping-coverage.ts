import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { FNB_BATCH_CATEGORY_KEYS, FNB_CATEGORY_CONFIG } from '@oppsera/shared';
import type { FnbBatchCategoryKey } from '@oppsera/shared';

export interface FnbCategoryMappingStatus {
  key: FnbBatchCategoryKey;
  label: string;
  description: string;
  critical: boolean;
  isMapped: boolean;
  accountId: string | null;
  accountName: string | null;
}

export interface FnbMappingCoverageResult {
  locationId: string;
  categories: FnbCategoryMappingStatus[];
  mappedCount: number;
  totalCount: number;
  criticalMappedCount: number;
  criticalTotalCount: number;
  coveragePercent: number;
}

/**
 * Returns F&B GL mapping coverage for a location.
 * Checks each category key against fnb_gl_account_mappings + accounting_settings fallbacks.
 */
export async function getFnbMappingCoverage(
  tenantId: string,
  locationId: string,
): Promise<FnbMappingCoverageResult> {
  return withTenant(tenantId, async (tx) => {
    // Load all F&B GL mappings for this location
    const mappingRows = await tx.execute(sql`
      SELECT m.entity_type, m.entity_id,
             m.revenue_account_id, m.expense_account_id,
             m.liability_account_id, m.asset_account_id,
             m.contra_revenue_account_id,
             ga.name AS account_name
      FROM fnb_gl_account_mappings m
      LEFT JOIN gl_accounts ga ON ga.id = COALESCE(
        m.revenue_account_id, m.expense_account_id,
        m.liability_account_id, m.asset_account_id,
        m.contra_revenue_account_id
      )
      WHERE m.tenant_id = ${tenantId}
        AND m.location_id = ${locationId}
    `);
    const mappings = Array.from(mappingRows as Iterable<Record<string, unknown>>);

    // Build lookup: entityType → mapping row
    const mappingLookup = new Map<string, Record<string, unknown>>();
    for (const row of mappings) {
      const key = `${row.entity_type}::${row.entity_id}`;
      mappingLookup.set(key, row);
    }

    // Load accounting settings for fallbacks
    const settingsRows = await tx.execute(sql`
      SELECT default_undeposited_funds_account_id,
             default_sales_tax_payable_account_id,
             default_tips_payable_account_id,
             default_service_charge_revenue_account_id,
             default_rounding_account_id
      FROM accounting_settings
      WHERE tenant_id = ${tenantId}
      LIMIT 1
    `);
    const settingsArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
    const settings = settingsArr[0] ?? {};

    // Check each category
    const categories: FnbCategoryMappingStatus[] = [];

    for (const key of FNB_BATCH_CATEGORY_KEYS) {
      const config = FNB_CATEGORY_CONFIG[key];
      const resolved = resolveForCoverage(key, mappingLookup, settings);

      categories.push({
        key,
        label: config.label,
        description: config.description,
        critical: config.critical,
        isMapped: resolved.accountId !== null,
        accountId: resolved.accountId,
        accountName: resolved.accountName,
      });
    }

    const mappedCount = categories.filter((c) => c.isMapped).length;
    const totalCount = categories.length;
    const criticalCategories = categories.filter((c) => c.critical);
    const criticalMappedCount = criticalCategories.filter((c) => c.isMapped).length;
    const criticalTotalCount = criticalCategories.length;

    return {
      locationId,
      categories,
      mappedCount,
      totalCount,
      criticalMappedCount,
      criticalTotalCount,
      coveragePercent: totalCount > 0 ? Math.round((mappedCount / totalCount) * 100) : 0,
    };
  });
}

function resolveForCoverage(
  categoryKey: FnbBatchCategoryKey,
  mappingLookup: Map<string, Record<string, unknown>>,
  settings: Record<string, unknown>,
): { accountId: string | null; accountName: string | null } {
  const findMapping = (entityType: string) =>
    mappingLookup.get(`${entityType}::default`);

  const result = (accountId: unknown, accountName: unknown) => ({
    accountId: accountId ? String(accountId) : null,
    accountName: accountName ? String(accountName) : null,
  });

  switch (categoryKey) {
    case 'cash_on_hand':
    case 'undeposited_funds': {
      const m = findMapping('payment_type');
      if (m?.asset_account_id) return result(m.asset_account_id, m.account_name);
      return result(settings.default_undeposited_funds_account_id, null);
    }

    case 'sales_revenue': {
      const m = findMapping('department');
      return result(m?.revenue_account_id, m?.account_name);
    }

    case 'tax_payable': {
      const m = findMapping('tax');
      if (m?.liability_account_id) return result(m.liability_account_id, m.account_name);
      return result(settings.default_sales_tax_payable_account_id, null);
    }

    case 'tips_payable_credit': {
      const m = findMapping('tips_credit');
      if (m?.liability_account_id) return result(m.liability_account_id, m.account_name);
      return result(settings.default_tips_payable_account_id, null);
    }

    case 'tips_payable_cash': {
      const m = findMapping('tips_cash');
      if (m?.liability_account_id) return result(m.liability_account_id, m.account_name);
      return result(settings.default_tips_payable_account_id, null);
    }

    case 'service_charge_revenue': {
      const m = findMapping('service_charge');
      if (m?.revenue_account_id) return result(m.revenue_account_id, m.account_name);
      return result(settings.default_service_charge_revenue_account_id, null);
    }

    case 'discount': {
      const m = findMapping('discount');
      return result(m?.contra_revenue_account_id ?? m?.expense_account_id, m?.account_name);
    }

    case 'comp_expense': {
      const m = findMapping('comp');
      return result(m?.expense_account_id, m?.account_name);
    }

    case 'cash_over_short': {
      const m = findMapping('cash_over_short');
      if (m?.expense_account_id) return result(m.expense_account_id, m.account_name);
      return result(settings.default_rounding_account_id, null);
    }

    case 'processing_fee': {
      const m = findMapping('processing_fee');
      return result(m?.expense_account_id, m?.account_name);
    }

    case 'auto_gratuity': {
      const m = findMapping('auto_gratuity');
      return result(m?.liability_account_id, m?.account_name);
    }

    default:
      return { accountId: null, accountName: null };
  }
}
