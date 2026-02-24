/**
 * List work orders for a property with optional filters and cursor pagination.
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface WorkOrderListItem {
  id: string;
  propertyId: string;
  roomId: string | null;
  roomNumber: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  reportedBy: string;
  estimatedHours: number | null;
  actualHours: number | null;
  partsCostCents: number | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListWorkOrdersInput {
  status?: string;
  roomId?: string;
  category?: string;
  priority?: string;
  cursor?: string;
  limit?: number;
}

export interface ListWorkOrdersResult {
  items: WorkOrderListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listWorkOrders(
  tenantId: string,
  propertyId: string,
  filters: ListWorkOrdersInput = {},
): Promise<ListWorkOrdersResult> {
  const limit = filters.limit ?? 50;

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        wo.id,
        wo.property_id,
        wo.room_id,
        r.room_number,
        wo.title,
        wo.description,
        wo.category,
        wo.priority,
        wo.status,
        wo.assigned_to,
        wo.reported_by,
        wo.estimated_hours,
        wo.actual_hours,
        wo.parts_cost_cents,
        wo.due_date,
        wo.completed_at,
        wo.created_at,
        wo.updated_at
      FROM pms_work_orders wo
      LEFT JOIN pms_rooms r ON r.id = wo.room_id AND r.tenant_id = wo.tenant_id
      WHERE wo.tenant_id = ${tenantId}
        AND wo.property_id = ${propertyId}
        ${filters.status ? sql`AND wo.status = ${filters.status}` : sql``}
        ${filters.roomId ? sql`AND wo.room_id = ${filters.roomId}` : sql``}
        ${filters.category ? sql`AND wo.category = ${filters.category}` : sql``}
        ${filters.priority ? sql`AND wo.priority = ${filters.priority}` : sql``}
        ${filters.cursor ? sql`AND wo.id < ${filters.cursor}` : sql``}
      ORDER BY wo.created_at DESC, wo.id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    return {
      items: items.map((row) => ({
        id: String(row.id),
        propertyId: String(row.property_id),
        roomId: row.room_id ? String(row.room_id) : null,
        roomNumber: row.room_number ? String(row.room_number) : null,
        title: String(row.title),
        description: row.description ? String(row.description) : null,
        category: String(row.category),
        priority: String(row.priority),
        status: String(row.status),
        assignedTo: row.assigned_to ? String(row.assigned_to) : null,
        reportedBy: String(row.reported_by),
        estimatedHours: row.estimated_hours != null ? Number(row.estimated_hours) : null,
        actualHours: row.actual_hours != null ? Number(row.actual_hours) : null,
        partsCostCents: row.parts_cost_cents != null ? Number(row.parts_cost_cents) : null,
        dueDate: row.due_date ? String(row.due_date) : null,
        completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
        createdAt: new Date(row.created_at as string).toISOString(),
        updatedAt: new Date(row.updated_at as string).toISOString(),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
