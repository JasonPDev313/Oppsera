import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GroupPickupSummaryRow {
  groupId: string;
  groupName: string;
  groupCode: string | null;
  confirmationNumber: number | null;
  status: string;
  startDate: string;
  endDate: string;
  cutoffDate: string | null;
  totalRoomsBlocked: number;
  roomsPickedUp: number;
  pickupPct: number;
  confirmedRevenueCents: number;
  projectedRevenueCents: number;
  revenueAtRiskCents: number;
  corporateAccountName: string | null;
}

export interface GetGroupPickupSummaryInput {
  tenantId: string;
  propertyId: string;
  startDateFrom?: string;
  startDateTo?: string;
  status?: string;
  limit?: number;
}

export async function getGroupPickupSummary(
  input: GetGroupPickupSummaryInput,
): Promise<GroupPickupSummaryRow[]> {
  const limit = Math.min(input.limit ?? 100, 500);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      sql`g.tenant_id = ${input.tenantId}`,
      sql`g.property_id = ${input.propertyId}`,
    ];

    if (input.status) conditions.push(sql`g.status = ${input.status}`);
    if (input.startDateFrom) conditions.push(sql`g.start_date >= ${input.startDateFrom}`);
    if (input.startDateTo) conditions.push(sql`g.start_date <= ${input.startDateTo}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        g.id,
        g.name,
        g.group_code,
        g.confirmation_number,
        g.status,
        g.start_date,
        g.end_date,
        g.cutoff_date,
        g.total_rooms_blocked,
        g.rooms_picked_up,
        g.negotiated_rate_cents,
        ca.company_name AS corporate_account_name,
        COALESCE((
          SELECT SUM(total_cents) FROM pms_reservations
          WHERE tenant_id = ${input.tenantId}
            AND group_id = g.id
            AND status NOT IN ('CANCELLED', 'NO_SHOW')
        ), 0) AS confirmed_revenue,
        EXTRACT(DAY FROM (g.end_date::date - g.start_date::date)) AS nights
      FROM pms_groups g
      LEFT JOIN pms_corporate_accounts ca ON ca.id = g.corporate_account_id AND ca.tenant_id = g.tenant_id
      WHERE ${whereClause}
      ORDER BY g.start_date ASC
      LIMIT ${limit}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    return arr.map((r) => {
      const totalBlocked = Number(r.total_rooms_blocked ?? 0);
      const pickedUp = Number(r.rooms_picked_up ?? 0);
      const pickupPct = totalBlocked > 0 ? Math.round((pickedUp / totalBlocked) * 1000) / 10 : 0;
      const nights = Number(r.nights ?? 0);
      const negotiatedRate = r.negotiated_rate_cents != null ? Number(r.negotiated_rate_cents) : 0;
      const confirmedRevenueCents = Number(r.confirmed_revenue ?? 0);
      const projectedRevenueCents = totalBlocked * nights * negotiatedRate;
      const revenueAtRiskCents = Math.max(0, projectedRevenueCents - confirmedRevenueCents);

      return {
        groupId: String(r.id),
        groupName: String(r.name),
        groupCode: r.group_code ? String(r.group_code) : null,
        confirmationNumber: r.confirmation_number != null ? Number(r.confirmation_number) : null,
        status: String(r.status),
        startDate: String(r.start_date),
        endDate: String(r.end_date),
        cutoffDate: r.cutoff_date ? String(r.cutoff_date) : null,
        totalRoomsBlocked: totalBlocked,
        roomsPickedUp: pickedUp,
        pickupPct,
        confirmedRevenueCents,
        projectedRevenueCents,
        revenueAtRiskCents,
        corporateAccountName: r.corporate_account_name ? String(r.corporate_account_name) : null,
      };
    });
  });
}
