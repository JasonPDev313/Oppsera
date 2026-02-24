import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  resolveSubDepartmentAccounts,
  resolvePaymentTypeAccounts,
  resolveTaxGroupAccount,
} from '../helpers/resolve-mapping';

export interface MissingMapping {
  entityType: string;
  entityId: string;
  nowMapped: boolean;
}

export interface RemappableTender {
  tenderId: string;
  businessDate: string;
  amountCents: number;
  unmappedEventCount: number;
  missingMappings: MissingMapping[];
  canRemap: boolean;
  glJournalEntryId: string | null;
}

interface GetRemappableTendersInput {
  tenantId: string;
  limit?: number;
}

/**
 * Groups unresolved gl_unmapped_events by source_reference_id (tender ID),
 * checks whether each previously-missing mapping now exists,
 * and returns the list of tenders that can be remapped.
 *
 * canRemap = true only if ALL previously-missing mappings now exist
 *            AND a posted GL entry exists for the tender.
 */
export async function getRemappableTenders(
  input: GetRemappableTendersInput,
): Promise<RemappableTender[]> {
  const limit = input.limit ?? 100;

  return withTenant(input.tenantId, async (tx) => {
    // 1. Group unresolved unmapped events by tender (source_reference_id)
    const groupRows = await tx.execute(sql`
      SELECT
        source_reference_id AS tender_id,
        COUNT(*)::int AS event_count,
        jsonb_agg(jsonb_build_object(
          'entityType', entity_type,
          'entityId', entity_id
        )) AS mappings
      FROM gl_unmapped_events
      WHERE tenant_id = ${input.tenantId}
        AND resolved_at IS NULL
        AND source_reference_id IS NOT NULL
        AND source_module = 'pos'
      GROUP BY source_reference_id
      ORDER BY MIN(created_at) DESC
      LIMIT ${limit}
    `);

    const groups = Array.from(groupRows as Iterable<Record<string, unknown>>);
    if (groups.length === 0) return [];

    // 2. Collect all tender IDs for batch GL entry lookup
    const tenderIds = groups.map((g) => String(g.tender_id));

    // 3. Find posted GL entries for these tenders
    const glRows = await tx.execute(sql`
      SELECT id, source_reference_id, business_date
      FROM gl_journal_entries
      WHERE tenant_id = ${input.tenantId}
        AND source_module = 'pos'
        AND source_reference_id IN ${sql`(${sql.join(tenderIds.map(id => sql`${id}`), sql`, `)})`}
        AND status = 'posted'
    `);

    const glEntryMap = new Map<string, { id: string; businessDate: string }>();
    for (const row of Array.from(glRows as Iterable<Record<string, unknown>>)) {
      glEntryMap.set(String(row.source_reference_id), {
        id: String(row.id),
        businessDate: String(row.business_date),
      });
    }

    // 4. Also get tender amounts for display
    const tenderAmountRows = await tx.execute(sql`
      SELECT id, amount, business_date
      FROM tenders
      WHERE tenant_id = ${input.tenantId}
        AND id IN ${sql`(${sql.join(tenderIds.map(id => sql`${id}`), sql`, `)})`}
    `);

    const tenderAmountMap = new Map<string, { amountCents: number; businessDate: string }>();
    for (const row of Array.from(tenderAmountRows as Iterable<Record<string, unknown>>)) {
      tenderAmountMap.set(String(row.id), {
        amountCents: Number(row.amount),
        businessDate: String(row.business_date),
      });
    }

    // 5. For each group, check if mappings now exist
    const results: RemappableTender[] = [];

    for (const group of groups) {
      const tenderId = String(group.tender_id);
      const eventCount = Number(group.event_count);
      const rawMappings = group.mappings as Array<{ entityType: string; entityId: string }>;

      // Deduplicate mappings (same entity could be logged multiple times)
      const seen = new Set<string>();
      const uniqueMappings: Array<{ entityType: string; entityId: string }> = [];
      for (const m of rawMappings) {
        const key = `${m.entityType}:${m.entityId}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueMappings.push(m);
        }
      }

      // Check each mapping
      const missingMappings: MissingMapping[] = [];
      let allMapped = true;

      for (const mapping of uniqueMappings) {
        let nowMapped = false;

        // Skip non-checkable entity types (posting errors, no line detail, etc.)
        if (mapping.entityType === 'posting_error' || mapping.entityType === 'no_line_detail') {
          // These can't be resolved by adding mappings
          missingMappings.push({ ...mapping, nowMapped: false });
          allMapped = false;
          continue;
        }

        if (mapping.entityType === 'sub_department') {
          const resolved = await resolveSubDepartmentAccounts(tx, input.tenantId, mapping.entityId);
          nowMapped = resolved !== null;
        } else if (mapping.entityType === 'payment_type') {
          const resolved = await resolvePaymentTypeAccounts(tx, input.tenantId, mapping.entityId);
          nowMapped = resolved !== null;
        } else if (mapping.entityType === 'tax_group') {
          const resolved = await resolveTaxGroupAccount(tx, input.tenantId, mapping.entityId);
          nowMapped = resolved !== null;
        } else if (mapping.entityType === 'discount_account') {
          const resolved = await resolveSubDepartmentAccounts(tx, input.tenantId, mapping.entityId);
          nowMapped = resolved?.discountAccountId !== null && resolved?.discountAccountId !== undefined;
        } else if (mapping.entityType === 'tips_payable_account' || mapping.entityType === 'service_charge_account') {
          // These are tenant-level settings, not per-entity mappings
          // If they logged as missing, check settings
          nowMapped = false; // Can't auto-check — leave as unmapped
          // The remap will pick up new settings anyway via handleTenderForAccounting
          nowMapped = true; // Actually, these resolve via settings fallback, always "fixed"
        } else {
          // Unknown entity type — mark as unmappable
          nowMapped = false;
        }

        missingMappings.push({ ...mapping, nowMapped });
        if (!nowMapped) allMapped = false;
      }

      const glEntry = glEntryMap.get(tenderId);
      const tenderInfo = tenderAmountMap.get(tenderId);

      results.push({
        tenderId,
        businessDate: tenderInfo?.businessDate ?? glEntry?.businessDate ?? '',
        amountCents: tenderInfo?.amountCents ?? 0,
        unmappedEventCount: eventCount,
        missingMappings,
        canRemap: allMapped && glEntry !== undefined,
        glJournalEntryId: glEntry?.id ?? null,
      });
    }

    return results;
  });
}
