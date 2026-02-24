import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GroupRoomBlock {
  id: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  blockDate: string;
  roomsBlocked: number;
  roomsPickedUp: number;
  released: boolean;
}

export interface GroupDetail {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  groupType: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  corporateAccountId: string | null;
  corporateAccountName: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  negotiatedRateCents: number | null;
  startDate: string;
  endDate: string;
  cutoffDate: string | null;
  status: string;
  billingType: string;
  notes: string | null;
  totalRoomsBlocked: number;
  roomsPickedUp: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  roomBlocks: GroupRoomBlock[];
}

export async function getGroup(tenantId: string, groupId: string): Promise<GroupDetail> {
  return withTenant(tenantId, async (tx) => {
    // Fetch group with joined corporate account and rate plan names
    const groupRows = await tx.execute(sql`
      SELECT
        g.id, g.tenant_id, g.property_id, g.name, g.group_type,
        g.contact_name, g.contact_email, g.contact_phone,
        g.corporate_account_id, ca.company_name AS corporate_account_name,
        g.rate_plan_id, rp.name AS rate_plan_name,
        g.negotiated_rate_cents,
        g.start_date, g.end_date, g.cutoff_date,
        g.status, g.billing_type, g.notes,
        g.total_rooms_blocked, g.rooms_picked_up,
        g.created_at, g.updated_at, g.created_by
      FROM pms_groups g
      LEFT JOIN pms_corporate_accounts ca
        ON ca.id = g.corporate_account_id AND ca.tenant_id = g.tenant_id
      LEFT JOIN pms_rate_plans rp
        ON rp.id = g.rate_plan_id AND rp.tenant_id = g.tenant_id
      WHERE g.id = ${groupId}
        AND g.tenant_id = ${tenantId}
      LIMIT 1
    `);

    const groupArr = Array.from(groupRows as Iterable<Record<string, unknown>>);
    if (groupArr.length === 0) {
      throw new NotFoundError('Group', groupId);
    }

    const g = groupArr[0]!;

    // Fetch room blocks with room type info
    const blockRows = await tx.execute(sql`
      SELECT
        b.id,
        b.room_type_id,
        rt.code AS room_type_code,
        rt.name AS room_type_name,
        b.block_date,
        b.rooms_blocked,
        b.rooms_picked_up,
        b.released
      FROM pms_group_room_blocks b
      INNER JOIN pms_room_types rt ON rt.id = b.room_type_id AND rt.tenant_id = b.tenant_id
      WHERE b.group_id = ${groupId}
        AND b.tenant_id = ${tenantId}
      ORDER BY b.block_date ASC, rt.sort_order ASC
    `);

    const blockArr = Array.from(blockRows as Iterable<Record<string, unknown>>);

    return {
      id: String(g.id),
      tenantId: String(g.tenant_id),
      propertyId: String(g.property_id),
      name: String(g.name),
      groupType: String(g.group_type),
      contactName: g.contact_name ? String(g.contact_name) : null,
      contactEmail: g.contact_email ? String(g.contact_email) : null,
      contactPhone: g.contact_phone ? String(g.contact_phone) : null,
      corporateAccountId: g.corporate_account_id ? String(g.corporate_account_id) : null,
      corporateAccountName: g.corporate_account_name ? String(g.corporate_account_name) : null,
      ratePlanId: g.rate_plan_id ? String(g.rate_plan_id) : null,
      ratePlanName: g.rate_plan_name ? String(g.rate_plan_name) : null,
      negotiatedRateCents: g.negotiated_rate_cents != null ? Number(g.negotiated_rate_cents) : null,
      startDate: String(g.start_date),
      endDate: String(g.end_date),
      cutoffDate: g.cutoff_date ? String(g.cutoff_date) : null,
      status: String(g.status),
      billingType: String(g.billing_type),
      notes: g.notes ? String(g.notes) : null,
      totalRoomsBlocked: Number(g.total_rooms_blocked ?? 0),
      roomsPickedUp: Number(g.rooms_picked_up ?? 0),
      createdAt: String(g.created_at),
      updatedAt: String(g.updated_at),
      createdBy: g.created_by ? String(g.created_by) : null,
      roomBlocks: blockArr.map((r) => ({
        id: String(r.id),
        roomTypeId: String(r.room_type_id),
        roomTypeCode: String(r.room_type_code),
        roomTypeName: String(r.room_type_name),
        blockDate: String(r.block_date),
        roomsBlocked: Number(r.rooms_blocked),
        roomsPickedUp: Number(r.rooms_picked_up),
        released: Boolean(r.released),
      })),
    };
  });
}
