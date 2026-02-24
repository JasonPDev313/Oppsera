import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GroupListItem {
  id: string;
  propertyId: string;
  name: string;
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
  corporateAccountId: string | null;
  corporateAccountName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListGroupsInput {
  tenantId: string;
  propertyId: string;
  status?: string;
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

    if (input.status) {
      conditions.push(sql`g.status = ${input.status}`);
    }

    if (input.cursor) {
      conditions.push(sql`g.id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        g.id,
        g.property_id,
        g.name,
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
      items: items.map((r) => ({
        id: String(r.id),
        propertyId: String(r.property_id),
        name: String(r.name),
        groupType: String(r.group_type),
        contactName: r.contact_name ? String(r.contact_name) : null,
        contactEmail: r.contact_email ? String(r.contact_email) : null,
        status: String(r.status),
        billingType: String(r.billing_type),
        startDate: String(r.start_date),
        endDate: String(r.end_date),
        cutoffDate: r.cutoff_date ? String(r.cutoff_date) : null,
        totalRoomsBlocked: Number(r.total_rooms_blocked ?? 0),
        roomsPickedUp: Number(r.rooms_picked_up ?? 0),
        corporateAccountId: r.corporate_account_id ? String(r.corporate_account_id) : null,
        corporateAccountName: r.corporate_account_name ? String(r.corporate_account_name) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
      cursor: hasMore ? items[items.length - 1]!.id as string : null,
      hasMore,
    };
  });
}
