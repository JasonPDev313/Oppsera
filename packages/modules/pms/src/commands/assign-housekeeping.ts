/**
 * Bulk-assign housekeeping tasks for a business date.
 * Uses ON CONFLICT DO UPDATE for upserts (one assignment per room per date).
 */
import { and, eq, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsProperties } from '@oppsera/db';
import type { AssignHousekeepingInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function assignHousekeeping(ctx: RequestContext, input: AssignHousekeepingInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    const assignmentIds: string[] = [];

    for (const a of input.assignments) {
      const id = generateUlid();
      await tx.execute(sql`
        INSERT INTO pms_housekeeping_assignments (id, tenant_id, property_id, room_id, housekeeper_id, business_date, priority, status)
        VALUES (${id}, ${ctx.tenantId}, ${input.propertyId}, ${a.roomId}, ${a.housekeeperId}, ${input.businessDate}, ${a.priority ?? 0}, 'pending')
        ON CONFLICT (tenant_id, room_id, business_date)
        DO UPDATE SET
          housekeeper_id = EXCLUDED.housekeeper_id,
          priority = EXCLUDED.priority,
          updated_at = now()
      `);
      assignmentIds.push(id);
    }

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'housekeeping_assignment', assignmentIds[0]!, 'assigned', {
      businessDate: input.businessDate,
      assignmentCount: input.assignments.length,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.HOUSEKEEPING_ASSIGNED, {
      propertyId: input.propertyId,
      businessDate: input.businessDate,
      assignmentCount: input.assignments.length,
      assignments: input.assignments.map((a) => ({
        roomId: a.roomId,
        housekeeperId: a.housekeeperId,
        priority: a.priority ?? 0,
      })),
    });

    return { result: { assignmentCount: input.assignments.length }, events: [event] };
  });

  await auditLog(ctx, 'pms.housekeeping.assigned', 'pms_housekeeping_assignment', input.propertyId);
  return result;
}
