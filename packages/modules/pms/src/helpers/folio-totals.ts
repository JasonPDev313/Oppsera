/**
 * Recalculate folio totals from entries.
 */
import { sql, eq, and } from 'drizzle-orm';
import { pmsFolios } from '@oppsera/db';

export async function recalculateFolioTotals(
  tx: any,
  tenantId: string,
  folioId: string,
): Promise<void> {
  const rows = await tx.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN entry_type IN ('ROOM_CHARGE', 'ADJUSTMENT') AND amount_cents > 0 THEN amount_cents ELSE 0 END), 0) AS subtotal_cents,
      COALESCE(SUM(CASE WHEN entry_type = 'TAX' THEN amount_cents ELSE 0 END), 0) AS tax_cents,
      COALESCE(SUM(CASE WHEN entry_type = 'FEE' THEN amount_cents ELSE 0 END), 0) AS fee_cents
    FROM pms_folio_entries
    WHERE folio_id = ${folioId}
      AND tenant_id = ${tenantId}
  `);

  const totals = Array.from(rows as Iterable<Record<string, unknown>>)[0];
  if (!totals) return;

  const subtotalCents = Number(totals.subtotal_cents ?? 0);
  const taxCents = Number(totals.tax_cents ?? 0);
  const feeCents = Number(totals.fee_cents ?? 0);
  const totalCents = subtotalCents + taxCents + feeCents;

  await tx
    .update(pmsFolios)
    .set({
      subtotalCents,
      taxCents,
      feeCents,
      totalCents,
      updatedAt: new Date(),
    })
    .where(and(eq(pmsFolios.id, folioId), eq(pmsFolios.tenantId, tenantId)));
}
