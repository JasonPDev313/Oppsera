/**
 * PMS Background Job: Nightly Charge Posting
 *
 * Posts room charges + tax for today to all CHECKED_IN reservations
 * that haven't been charged yet for today's date.
 *
 * Schedule: Daily at property's nightAuditTime (default 3:00 AM local)
 * Idempotent: checks for existing charges before posting
 *
 * Performance: batch inserts all charges in 2 queries (room charges + tax)
 * plus a single batch folio total update.
 */
import { withTenant, sql } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

export interface NightlyChargeResult {
  propertyId: string;
  reservationsProcessed: number;
  chargesPosted: number;
  errors: Array<{ reservationId: string; error: string }>;
}

export async function runNightlyChargePosting(
  tenantId: string,
  propertyId: string,
  businessDate: string,
): Promise<NightlyChargeResult> {
  const result: NightlyChargeResult = {
    propertyId,
    reservationsProcessed: 0,
    chargesPosted: 0,
    errors: [],
  };

  await withTenant(tenantId, async (tx) => {
    // Find all CHECKED_IN reservations that haven't been charged for today
    // Single query with LEFT JOIN to exclude already-charged reservations
    const uncharged = await tx.execute(sql`
      SELECT r.id AS reservation_id, r.nightly_rate_cents, f.id AS folio_id, p.tax_rate_pct
      FROM pms_reservations r
      JOIN pms_folios f ON f.reservation_id = r.id AND f.tenant_id = r.tenant_id AND f.status = 'OPEN'
      JOIN pms_properties p ON p.id = r.property_id AND p.tenant_id = r.tenant_id
      LEFT JOIN pms_folio_entries fe
        ON fe.folio_id = f.id
        AND fe.tenant_id = f.tenant_id
        AND fe.entry_type = 'ROOM_CHARGE'
        AND fe.business_date = ${businessDate}
      WHERE r.tenant_id = ${tenantId}
        AND r.property_id = ${propertyId}
        AND r.status = 'CHECKED_IN'
        AND r.check_in_date <= ${businessDate}
        AND r.check_out_date > ${businessDate}
        AND fe.id IS NULL
    `);

    const rows = Array.from(uncharged as Iterable<any>);
    result.reservationsProcessed = rows.length;

    if (rows.length === 0) return;

    // Batch insert room charges
    const chargeIds: string[] = [];
    const chargeFolioIds: string[] = [];
    const chargeAmounts: number[] = [];
    const chargeDescs: string[] = [];

    // Batch insert tax entries
    const taxIds: string[] = [];
    const taxFolioIds: string[] = [];
    const taxAmounts: number[] = [];
    const taxDescs: string[] = [];

    // Track folio updates
    const folioChargeMap = new Map<string, { charge: number; tax: number }>();

    for (const res of rows) {
      const nightlyRateCents = res.nightly_rate_cents as number;
      const taxRatePct = Number(res.tax_rate_pct);
      const taxCents = Math.round(nightlyRateCents * taxRatePct / 100);
      const folioId = res.folio_id as string;

      chargeIds.push(generateUlid());
      chargeFolioIds.push(folioId);
      chargeAmounts.push(nightlyRateCents);
      chargeDescs.push(`Room charge - ${businessDate}`);

      if (taxCents > 0) {
        taxIds.push(generateUlid());
        taxFolioIds.push(folioId);
        taxAmounts.push(taxCents);
        taxDescs.push(`Tax - ${businessDate}`);
      }

      const existing = folioChargeMap.get(folioId) ?? { charge: 0, tax: 0 };
      existing.charge += nightlyRateCents;
      existing.tax += taxCents;
      folioChargeMap.set(folioId, existing);
    }

    try {
      // Batch insert room charges
      await tx.execute(sql`
        INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
        SELECT
          unnest(${chargeIds}::text[]),
          ${tenantId},
          unnest(${chargeFolioIds}::text[]),
          'ROOM_CHARGE',
          unnest(${chargeDescs}::text[]),
          unnest(${chargeAmounts}::int[]),
          ${businessDate},
          'system'
      `);

      // Batch insert tax entries (if any)
      if (taxIds.length > 0) {
        await tx.execute(sql`
          INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
          SELECT
            unnest(${taxIds}::text[]),
            ${tenantId},
            unnest(${taxFolioIds}::text[]),
            'TAX',
            unnest(${taxDescs}::text[]),
            unnest(${taxAmounts}::int[]),
            ${businessDate},
            'system'
        `);
      }

      // Batch update folio totals
      const updateFolioIds: string[] = [];
      const updateCharges: number[] = [];
      const updateTaxes: number[] = [];

      for (const [folioId, amounts] of folioChargeMap) {
        updateFolioIds.push(folioId);
        updateCharges.push(amounts.charge);
        updateTaxes.push(amounts.tax);
      }

      await tx.execute(sql`
        UPDATE pms_folios f
        SET subtotal_cents = f.subtotal_cents + v.charge,
            tax_cents = f.tax_cents + v.tax,
            total_cents = f.total_cents + v.charge + v.tax,
            balance_cents = f.balance_cents + v.charge + v.tax,
            updated_at = NOW()
        FROM (
          SELECT
            unnest(${updateFolioIds}::text[]) AS folio_id,
            unnest(${updateCharges}::int[]) AS charge,
            unnest(${updateTaxes}::int[]) AS tax
        ) v
        WHERE f.id = v.folio_id AND f.tenant_id = ${tenantId}
      `);

      result.chargesPosted = rows.length;
    } catch (err) {
      // If batch fails, log error for all reservations
      for (const res of rows) {
        result.errors.push({
          reservationId: res.reservation_id as string,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });

  console.log(
    `[pms.nightly-charge-posting] property=${propertyId} date=${businessDate} processed=${result.reservationsProcessed} posted=${result.chargesPosted} errors=${result.errors.length}`,
  );

  return result;
}
