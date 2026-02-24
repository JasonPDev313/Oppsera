/**
 * Get a work order with its comments.
 */
import { and, eq, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsWorkOrders, pmsWorkOrderComments, pmsRooms } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface WorkOrderComment {
  id: string;
  comment: string;
  createdAt: string;
  createdBy: string;
}

export interface WorkOrderDetail {
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
  resolutionNotes: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments: WorkOrderComment[];
}

export async function getWorkOrder(
  tenantId: string,
  workOrderId: string,
): Promise<WorkOrderDetail> {
  return withTenant(tenantId, async (tx) => {
    const [wo] = await tx
      .select()
      .from(pmsWorkOrders)
      .where(
        and(
          eq(pmsWorkOrders.id, workOrderId),
          eq(pmsWorkOrders.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!wo) throw new NotFoundError('WorkOrder', workOrderId);

    // Resolve room number if roomId exists
    let roomNumber: string | null = null;
    if (wo.roomId) {
      const [room] = await tx
        .select({ roomNumber: pmsRooms.roomNumber })
        .from(pmsRooms)
        .where(
          and(
            eq(pmsRooms.id, wo.roomId),
            eq(pmsRooms.tenantId, tenantId),
          ),
        )
        .limit(1);
      roomNumber = room?.roomNumber ?? null;
    }

    // Fetch comments
    const commentRows = await tx
      .select()
      .from(pmsWorkOrderComments)
      .where(
        and(
          eq(pmsWorkOrderComments.workOrderId, workOrderId),
          eq(pmsWorkOrderComments.tenantId, tenantId),
        ),
      )
      .orderBy(asc(pmsWorkOrderComments.createdAt));

    return {
      id: wo.id,
      propertyId: wo.propertyId,
      roomId: wo.roomId,
      roomNumber,
      title: wo.title,
      description: wo.description,
      category: wo.category,
      priority: wo.priority,
      status: wo.status,
      assignedTo: wo.assignedTo,
      reportedBy: wo.reportedBy,
      estimatedHours: wo.estimatedHours != null ? Number(wo.estimatedHours) : null,
      actualHours: wo.actualHours != null ? Number(wo.actualHours) : null,
      partsCostCents: wo.partsCostCents,
      resolutionNotes: wo.resolutionNotes,
      dueDate: wo.dueDate,
      completedAt: wo.completedAt ? wo.completedAt.toISOString() : null,
      createdAt: wo.createdAt.toISOString(),
      updatedAt: wo.updatedAt.toISOString(),
      comments: commentRows.map((c) => ({
        id: c.id,
        comment: c.comment,
        createdAt: c.createdAt.toISOString(),
        createdBy: c.createdBy,
      })),
    };
  });
}
