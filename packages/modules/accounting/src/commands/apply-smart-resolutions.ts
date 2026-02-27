import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { batchRemapGlForTenders } from './remap-gl-for-tender';
import { getRemappableTenders } from '../queries/get-remappable-tenders';

export interface ApplySmartResolutionsInput {
  suggestions: Array<{
    entityType: string;
    entityId: string;
    suggestedAccountId: string;
  }>;
}

export interface ApplySmartResolutionsResult {
  mappingsCreated: number;
  eventsResolved: number;
  remapped: number;
  failed: number;
}

/**
 * Batch-creates GL mappings from smart resolution suggestions and triggers remap.
 * Groups suggestions by entity type and creates the appropriate mapping rows.
 * Then checks for remappable tenders and batch-remaps them.
 */
export async function applySmartResolutions(
  ctx: RequestContext,
  input: ApplySmartResolutionsInput,
): Promise<ApplySmartResolutionsResult> {
  const { tenantId } = ctx;
  let mappingsCreated = 0;
  let eventsResolved = 0;

  await withTenant(tenantId, async (tx) => {
    // Validate all suggested GL accounts exist and are active
    const accountIds = [...new Set(input.suggestions.map((s) => s.suggestedAccountId))];
    let validAccountIds = new Set<string>();
    if (accountIds.length > 0) {
      const validRows = await tx.execute(sql`
        SELECT id FROM gl_accounts
        WHERE tenant_id = ${tenantId}
          AND id IN ${sql`(${sql.join(accountIds.map((id) => sql`${id}`), sql`, `)})`}
          AND is_active = true
      `);
      validAccountIds = new Set(
        Array.from(validRows as Iterable<Record<string, unknown>>).map((r) => String(r.id)),
      );
    }

    for (const suggestion of input.suggestions) {
      const { entityType, entityId, suggestedAccountId } = suggestion;

      // Skip suggestions with invalid/inactive GL accounts
      if (!validAccountIds.has(suggestedAccountId)) continue;

      if (entityType === 'sub_department' && entityId !== 'unmapped') {
        // Upsert sub_department_gl_defaults — set revenue account
        await tx.execute(sql`
          INSERT INTO sub_department_gl_defaults (
            tenant_id, sub_department_id, revenue_account_id
          ) VALUES (
            ${tenantId}, ${entityId}, ${suggestedAccountId}
          )
          ON CONFLICT (tenant_id, sub_department_id)
          DO UPDATE SET revenue_account_id = EXCLUDED.revenue_account_id
        `);
        mappingsCreated++;
      } else if (entityType === 'sub_department' && entityId === 'unmapped') {
        // Set the uncategorized revenue default in accounting settings
        await tx.execute(sql`
          UPDATE accounting_settings
          SET default_uncategorized_revenue_account_id = ${suggestedAccountId}
          WHERE tenant_id = ${tenantId}
        `);
        mappingsCreated++;
      } else if (entityType === 'payment_type') {
        // Upsert payment_type_gl_defaults
        await tx.execute(sql`
          INSERT INTO payment_type_gl_defaults (
            tenant_id, payment_type_id, cash_account_id
          ) VALUES (
            ${tenantId}, ${entityId}, ${suggestedAccountId}
          )
          ON CONFLICT (tenant_id, payment_type_id)
          DO UPDATE SET cash_account_id = EXCLUDED.cash_account_id
        `);
        mappingsCreated++;
      } else if (entityType === 'tax_group') {
        // Upsert tax_group_gl_defaults
        await tx.execute(sql`
          INSERT INTO tax_group_gl_defaults (
            tenant_id, tax_group_id, tax_payable_account_id
          ) VALUES (
            ${tenantId}, ${entityId}, ${suggestedAccountId}
          )
          ON CONFLICT (tenant_id, tax_group_id)
          DO UPDATE SET tax_payable_account_id = EXCLUDED.tax_payable_account_id
        `);
        mappingsCreated++;
      } else if (entityType === 'discount_account' && entityId !== 'unmapped') {
        // Update discount account on sub_department_gl_defaults
        await tx.execute(sql`
          INSERT INTO sub_department_gl_defaults (
            tenant_id, sub_department_id, discount_account_id
          ) VALUES (
            ${tenantId}, ${entityId}, ${suggestedAccountId}
          )
          ON CONFLICT (tenant_id, sub_department_id)
          DO UPDATE SET discount_account_id = EXCLUDED.discount_account_id
        `);
        mappingsCreated++;
      } else if (entityType === 'discount_account' && entityId === 'unmapped') {
        // Set the default discount account in accounting settings
        await tx.execute(sql`
          UPDATE accounting_settings
          SET default_discount_account_id = ${suggestedAccountId}
          WHERE tenant_id = ${tenantId}
        `);
        mappingsCreated++;
      } else if (entityType === 'tips_payable_account') {
        // Set/confirm the tips payable account in accounting settings
        await tx.execute(sql`
          UPDATE accounting_settings
          SET default_tips_payable_account_id = ${suggestedAccountId}
          WHERE tenant_id = ${tenantId}
        `);
        mappingsCreated++;
      } else if (entityType === 'service_charge_account') {
        // Set/confirm the service charge revenue account in accounting settings
        await tx.execute(sql`
          UPDATE accounting_settings
          SET default_service_charge_revenue_account_id = ${suggestedAccountId}
          WHERE tenant_id = ${tenantId}
        `);
        mappingsCreated++;
      }
    }

    // Mark ALL unmapped events as resolved for entities that now have mappings
    const validSuggestions = input.suggestions.filter((s) => validAccountIds.has(s.suggestedAccountId));
    if (validSuggestions.length > 0) {
      const conditions = validSuggestions.map(
        (s) => sql`(entity_type = ${s.entityType} AND entity_id = ${s.entityId})`,
      );
      const resolvedRows = await tx.execute(sql`
        UPDATE gl_unmapped_events
        SET resolved_at = NOW(), resolved_by = 'smart-resolve'
        WHERE tenant_id = ${tenantId}
          AND (${sql.join(conditions, sql` OR `)})
          AND resolved_at IS NULL
        RETURNING id
      `);
      eventsResolved = Array.from(resolvedRows as Iterable<Record<string, unknown>>).length;
    }
  });

  // After creating mappings, try to remap eligible tenders
  let remapped = 0;
  let failed = 0;

  try {
    const settings = await withTenant(tenantId, async (tx) => getAccountingSettings(tx, tenantId));
    if (settings) {
      const tenders = await getRemappableTenders({ tenantId });
      const eligible = tenders.filter((t) => t.canRemap).map((t) => t.tenderId);
      if (eligible.length > 0) {
        const batch = eligible.slice(0, 50);
        const results = await batchRemapGlForTenders(ctx, batch, 'Smart resolution: auto-remap');
        remapped = results.filter((r) => r.success).length;
        failed = results.filter((r) => !r.success).length;
      }
    }
  } catch (error) {
    console.error('[smart-resolve] remap phase failed:', error);
  }

  return { mappingsCreated, eventsResolved, remapped, failed };
}
