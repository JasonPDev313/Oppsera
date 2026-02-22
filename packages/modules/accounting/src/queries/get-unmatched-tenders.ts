import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface UnmatchedTender {
  id: string;
  orderId: string;
  tenderType: string;
  amount: number;
  tipAmount: number;
  businessDate: string;
  cardLast4: string | null;
  cardBrand: string | null;
  providerRef: string | null;
  createdAt: string;
}

interface GetUnmatchedTendersInput {
  tenantId: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  tenderType?: string;
  limit?: number;
  cursor?: string;
}

export async function getUnmatchedTenders(
  input: GetUnmatchedTendersInput,
): Promise<{ items: UnmatchedTender[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 100;

  return withTenant(input.tenantId, async (tx) => {
    const startDateFilter = input.startDate
      ? sql`AND t.business_date >= ${input.startDate}`
      : sql``;

    const endDateFilter = input.endDate
      ? sql`AND t.business_date <= ${input.endDate}`
      : sql``;

    const locationFilter = input.locationId
      ? sql`AND t.location_id = ${input.locationId}`
      : sql``;

    const typeFilter = input.tenderType
      ? sql`AND t.tender_type = ${input.tenderType}`
      : sql``;

    const cursorFilter = input.cursor
      ? sql`AND t.id < ${input.cursor}`
      : sql``;

    // Find tenders NOT matched to any settlement line
    const rows = await tx.execute(sql`
      SELECT
        t.id,
        t.order_id,
        t.tender_type,
        t.amount,
        t.tip_amount,
        t.business_date,
        t.card_last4,
        t.card_brand,
        t.provider_ref,
        t.created_at
      FROM tenders t
      WHERE t.tenant_id = ${input.tenantId}
        AND t.tender_type IN ('card', 'gift_card')
        AND t.status = 'captured'
        AND NOT EXISTS (
          SELECT 1
          FROM payment_settlement_lines psl
          WHERE psl.tender_id = t.id
            AND psl.tenant_id = t.tenant_id
        )
        ${startDateFilter}
        ${endDateFilter}
        ${locationFilter}
        ${typeFilter}
        ${cursorFilter}
      ORDER BY t.business_date DESC, t.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = (hasMore ? allRows.slice(0, limit) : allRows).map((row) => ({
      id: String(row.id),
      orderId: String(row.order_id),
      tenderType: String(row.tender_type),
      amount: Number(row.amount),
      tipAmount: Number(row.tip_amount),
      businessDate: String(row.business_date),
      cardLast4: row.card_last4 ? String(row.card_last4) : null,
      cardBrand: row.card_brand ? String(row.card_brand) : null,
      providerRef: row.provider_ref ? String(row.provider_ref) : null,
      createdAt: String(row.created_at),
    }));

    return {
      items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
