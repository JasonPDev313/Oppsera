/**
 * PMS Background Job: Auto No-Show Marking
 *
 * Marks CONFIRMED reservations as NO_SHOW when check-in date has passed.
 *
 * Schedule: Daily at configurable time (default 6:00 PM property-local)
 * Grace period: configurable (default 0 = mark as no-show if checkInDate < today)
 */
import { withTenant, sql } from '@oppsera/db';

export interface NoShowResult {
  propertyId: string;
  reservationsChecked: number;
  markedNoShow: number;
  errors: Array<{ reservationId: string; error: string }>;
}

export async function runNoShowMarking(
  tenantId: string,
  propertyId: string,
  today: string,
  graceDays: number = 0,
): Promise<NoShowResult> {
  const result: NoShowResult = {
    propertyId,
    reservationsChecked: 0,
    markedNoShow: 0,
    errors: [],
  };

  // Calculate cutoff date (today minus grace days)
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - graceDays);
  const cutoffDate = cutoff.toISOString().split('T')[0]!;

  await withTenant(tenantId, async (tx) => {
    // Find all CONFIRMED reservations past their check-in date
    const reservations = await tx.execute(sql`
      SELECT id, version, check_in_date
      FROM pms_reservations
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        AND status = 'CONFIRMED'
        AND check_in_date < ${cutoffDate}
    `);

    const rows = Array.from(reservations as Iterable<any>);
    result.reservationsChecked = rows.length;

    for (const res of rows) {
      try {
        await tx.execute(sql`
          UPDATE pms_reservations
          SET status = 'NO_SHOW',
              version = version + 1,
              updated_at = NOW()
          WHERE id = ${res.id}
            AND tenant_id = ${tenantId}
            AND status = 'CONFIRMED'
        `);

        result.markedNoShow += 1;
      } catch (err) {
        result.errors.push({
          reservationId: res.id as string,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });

  console.log(
    `[pms.no-show-marking] property=${propertyId} today=${today} grace=${graceDays} checked=${result.reservationsChecked} marked=${result.markedNoShow} errors=${result.errors.length}`,
  );

  return result;
}
