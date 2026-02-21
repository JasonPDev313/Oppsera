import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListTipAdjustmentsInput } from '../validation';

export interface TipAdjustmentItem {
  id: string;
  tabId: string;
  preauthId: string | null;
  tenderId: string | null;
  originalTipCents: number;
  adjustedTipCents: number;
  adjustmentReason: string | null;
  adjustedBy: string;
  adjustedAt: string;
  isFinal: boolean;
  finalizedAt: string | null;
}

export async function listTipAdjustments(
  input: ListTipAdjustmentsInput,
): Promise<TipAdjustmentItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tab_id = ${input.tabId}`,
      sql`tenant_id = ${input.tenantId}`,
    ];

    if (input.isFinal !== undefined) {
      conditions.push(sql`is_final = ${input.isFinal}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, tab_id, preauth_id, tender_id, original_tip_cents,
                 adjusted_tip_cents, adjustment_reason, adjusted_by,
                 adjusted_at, is_final, finalized_at
          FROM fnb_tip_adjustments
          WHERE ${whereClause}
          ORDER BY adjusted_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      tabId: r.tab_id as string,
      preauthId: (r.preauth_id as string) ?? null,
      tenderId: (r.tender_id as string) ?? null,
      originalTipCents: Number(r.original_tip_cents),
      adjustedTipCents: Number(r.adjusted_tip_cents),
      adjustmentReason: (r.adjustment_reason as string) ?? null,
      adjustedBy: r.adjusted_by as string,
      adjustedAt: (r.adjusted_at as Date).toISOString(),
      isFinal: r.is_final as boolean,
      finalizedAt: r.finalized_at ? (r.finalized_at as Date).toISOString() : null,
    }));
  });
}
