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
import { withTenant, sql, eventOutbox } from '@oppsera/db';
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
      const chIdsArr = sql`ARRAY[${sql.join(chargeIds.map(v => sql`${v}`), sql`, `)}]`;
      const chFolioArr = sql`ARRAY[${sql.join(chargeFolioIds.map(v => sql`${v}`), sql`, `)}]`;
      const chDescsArr = sql`ARRAY[${sql.join(chargeDescs.map(v => sql`${v}`), sql`, `)}]`;
      const chAmtsArr = sql`ARRAY[${sql.join(chargeAmounts.map(v => sql`${v}::int`), sql`, `)}]`;
      await tx.execute(sql`
        INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
        SELECT
          unnest(${chIdsArr}),
          ${tenantId},
          unnest(${chFolioArr}),
          'ROOM_CHARGE',
          unnest(${chDescsArr}),
          unnest(${chAmtsArr}),
          ${businessDate},
          'system'
      `);

      // Batch insert tax entries (if any)
      if (taxIds.length > 0) {
        const txIdsArr = sql`ARRAY[${sql.join(taxIds.map(v => sql`${v}`), sql`, `)}]`;
        const txFolioArr = sql`ARRAY[${sql.join(taxFolioIds.map(v => sql`${v}`), sql`, `)}]`;
        const txDescsArr = sql`ARRAY[${sql.join(taxDescs.map(v => sql`${v}`), sql`, `)}]`;
        const txAmtsArr = sql`ARRAY[${sql.join(taxAmounts.map(v => sql`${v}::int`), sql`, `)}]`;
        await tx.execute(sql`
          INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
          SELECT
            unnest(${txIdsArr}),
            ${tenantId},
            unnest(${txFolioArr}),
            'TAX',
            unnest(${txDescsArr}),
            unnest(${txAmtsArr}),
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

      const upFolioArr = sql`ARRAY[${sql.join(updateFolioIds.map(v => sql`${v}`), sql`, `)}]`;
      const upChargeArr = sql`ARRAY[${sql.join(updateCharges.map(v => sql`${v}::int`), sql`, `)}]`;
      const upTaxArr = sql`ARRAY[${sql.join(updateTaxes.map(v => sql`${v}::int`), sql`, `)}]`;
      await tx.execute(sql`
        UPDATE pms_folios f
        SET subtotal_cents = f.subtotal_cents + v.charge,
            tax_cents = f.tax_cents + v.tax,
            total_cents = f.total_cents + v.charge + v.tax,
            balance_cents = f.balance_cents + v.charge + v.tax,
            updated_at = NOW()
        FROM (
          SELECT
            unnest(${upFolioArr}) AS folio_id,
            unnest(${upChargeArr}) AS charge,
            unnest(${upTaxArr}) AS tax
        ) v
        WHERE f.id = v.folio_id AND f.tenant_id = ${tenantId}
      `);

      result.chargesPosted = rows.length;

      // Emit pms.folio.charge_posted.v1 events for each charge + tax entry
      // so the existing handleFolioChargePosted consumer picks them up
      const now = new Date().toISOString();
      const outboxRows: Array<{
        id: string;
        tenantId: string;
        eventType: string;
        eventId: string;
        idempotencyKey: string;
        payload: Record<string, unknown>;
        occurredAt: Date;
        publishedAt: null;
      }> = [];

      for (let i = 0; i < chargeIds.length; i++) {
        const eventId = generateUlid();
        outboxRows.push({
          id: generateUlid(),
          tenantId,
          eventType: 'pms.folio.charge_posted.v1',
          eventId,
          idempotencyKey: `nightly-charge-${chargeIds[i]}`,
          payload: {
            eventId,
            eventType: 'pms.folio.charge_posted.v1',
            occurredAt: now,
            tenantId,
            locationId: propertyId,
            actorUserId: 'system',
            idempotencyKey: `nightly-charge-${chargeIds[i]}`,
            data: {
              folioId: chargeFolioIds[i],
              entryId: chargeIds[i],
              entryType: 'ROOM_CHARGE',
              amountCents: chargeAmounts[i],
              locationId: propertyId,
              occurredAt: now,
            },
          },
          occurredAt: new Date(),
          publishedAt: null,
        });
      }

      for (let i = 0; i < taxIds.length; i++) {
        const eventId = generateUlid();
        outboxRows.push({
          id: generateUlid(),
          tenantId,
          eventType: 'pms.folio.charge_posted.v1',
          eventId,
          idempotencyKey: `nightly-tax-${taxIds[i]}`,
          payload: {
            eventId,
            eventType: 'pms.folio.charge_posted.v1',
            occurredAt: now,
            tenantId,
            locationId: propertyId,
            actorUserId: 'system',
            idempotencyKey: `nightly-tax-${taxIds[i]}`,
            data: {
              folioId: taxFolioIds[i],
              entryId: taxIds[i],
              entryType: 'TAX',
              amountCents: taxAmounts[i],
              locationId: propertyId,
              occurredAt: now,
            },
          },
          occurredAt: new Date(),
          publishedAt: null,
        });
      }

      // Batch insert outbox events (best-effort — don't block nightly posting on event emission)
      if (outboxRows.length > 0) {
        try {
          await tx.insert(eventOutbox).values(outboxRows);
        } catch (outboxErr) {
          console.error(
            `[pms.nightly-charge-posting] Failed to emit ${outboxRows.length} events to outbox:`,
            outboxErr instanceof Error ? outboxErr.message : String(outboxErr),
          );
        }
      }
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
