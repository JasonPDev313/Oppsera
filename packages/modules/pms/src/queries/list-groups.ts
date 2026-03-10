import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GroupListItem {
  id: string;
  propertyId: string;
  name: string;
  groupCode: string | null;
  confirmationNumber: number | null;
  groupType: string;
  contactName: string | null;
  contactEmail: string | null;
  status: string;
  billingType: string;
  startDate: string;
  endDate: string;
  cutoffDate: string | null;
  totalRoomsBlocked: number;
  roomsPickedUp: number;
  pickupPct: number;
  corporateAccountId: string | null;
  corporateAccountName: string | null;
  source: string | null;
  market: string | null;
  autoReleaseAtCutoff: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface ListGroupsInput {
  tenantId: string;
  propertyId: string;
  status?: string;
  groupCode?: string;
  name?: string;
  confirmationNumber?: number;
  corporateAccountId?: string;
  startDateFrom?: string;
  startDateTo?: string;
  departureFrom?: string;
  departureTo?: string;
  cutoffDateBefore?: string;
  cursor?: string;
  limit?: number;
}

export interface ListGroupsResult {
  items: GroupListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listGroups(input: ListGroupsInput): Promise<ListGroupsResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      sql`g.tenant_id = ${input.tenantId}`,
      sql`g.property_id = ${input.propertyId}`,
    ];

    if (input.status) conditions.push(sql`g.status = ${input.status}`);
    if (input.groupCode) conditions.push(sql`g.group_code ILIKE ${'%' + input.groupCode + '%'}`);
    if (input.name) conditions.push(sql`g.name ILIKE ${'%' + input.name + '%'}`);
    if (input.confirmationNumber != null) conditions.push(sql`g.confirmation_number = ${input.confirmationNumber}`);
    if (input.corporateAccountId) conditions.push(sql`g.corporate_account_id = ${input.corporateAccountId}`);
    if (input.startDateFrom) conditions.push(sql`g.start_date >= ${input.startDateFrom}`);
    if (input.startDateTo) conditions.push(sql`g.start_date <= ${input.startDateTo}`);
    if (input.departureFrom) conditions.push(sql`g.end_date >= ${input.departureFrom}`);
    if (input.departureTo) conditions.push(sql`g.end_date <= ${input.departureTo}`);
    if (input.cutoffDateBefore) conditions.push(sql`g.cutoff_date <= ${input.cutoffDateBefore}`);
    if (input.cursor) conditions.push(sql`g.id < ${input.cursor}`);

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        g.id,
        g.property_id,
        g.name,
        g.group_code,
        g.confirmation_number,
        g.group_type,
        g.contact_name,
        g.contact_email,
        g.status,
        g.billing_type,
        g.start_date,
        g.end_date,
        g.cutoff_date,
        g.total_rooms_blocked,
        g.rooms_picked_up,
        g.corporate_account_id,
        ca.company_name AS corporate_account_name,
        g.source,
        g.market,
        g.auto_release_at_cutoff,
        COALESCE(g.version, 1) AS version,
        g.created_at,
        g.updated_at
      FROM pms_groups g
      LEFT JOIN pms_corporate_accounts ca
        ON ca.id = g.corporate_account_id AND ca.tenant_id = g.tenant_id
      WHERE ${whereClause}
      ORDER BY g.id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = hasMore ? arr.slice(0, limit) : arr;

    return {
      items: items.map((r) => {
        const totalBlocked = Number(r.total_rooms_blocked ?? 0);
        const pickedUp = Number(r.rooms_picked_up ?? 0);
        return {
          id: String(r.id),
          propertyId: String(r.property_id),
          name: String(r.name),
          groupCode: r.group_code ? String(r.group_code) : null,
          confirmationNumber: r.confirmation_number != null ? Number(r.confirmation_number) : null,
          groupType: String(r.group_type),
          contactName: r.contact_name ? String(r.contact_name) : null,
          contactEmail: r.contact_email ? String(r.contact_email) : null,
          status: String(r.status),
          billingType: String(r.billing_type),
          startDate: String(r.start_date),
          endDate: String(r.end_date),
          cutoffDate: r.cutoff_date ? String(r.cutoff_date) : null,
          totalRoomsBlocked: totalBlocked,
          roomsPickedUp: pickedUp,
          pickupPct: totalBlocked > 0 ? Math.round((pickedUp / totalBlocked) * 1000) / 10 : 0,
          corporateAccountId: r.corporate_account_id ? String(r.corporate_account_id) : null,
          corporateAccountName: r.corporate_account_name ? String(r.corporate_account_name) : null,
          source: r.source ? String(r.source) : null,
          market: r.market ? String(r.market) : null,
          autoReleaseAtCutoff: Boolean(r.auto_release_at_cutoff),
          version: Number(r.version ?? 1),
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        };
      }),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
