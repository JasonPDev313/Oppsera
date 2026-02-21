import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanRooms, floorPlanTemplatesV2 } from '../schema';
import { saveDraft } from './save-draft';

export async function applyTemplate(
  ctx: RequestContext,
  roomId: string,
  templateId: string,
) {
  // Validate template exists within a transaction first
  await publishWithOutbox(ctx, async (tx) => {
    const [room] = await tx
      .select()
      .from(floorPlanRooms)
      .where(and(eq(floorPlanRooms.id, roomId), eq(floorPlanRooms.tenantId, ctx.tenantId)))
      .limit(1);
    if (!room) throw new NotFoundError('Room', roomId);

    const [template] = await tx
      .select()
      .from(floorPlanTemplatesV2)
      .where(
        and(
          eq(floorPlanTemplatesV2.id, templateId),
          eq(floorPlanTemplatesV2.tenantId, ctx.tenantId),
          eq(floorPlanTemplatesV2.isActive, true),
        ),
      )
      .limit(1);
    if (!template) throw new NotFoundError('Template', templateId);

    return { result: template, events: [] };
  });

  // Use saveDraft with the template's snapshot — this runs its own transaction
  // Re-fetch template outside the first tx to get snapshot
  const { withTenant } = await import('@oppsera/db');
  const { floorPlanTemplatesV2: tplTable } = await import('../schema');
  const template = await withTenant(ctx.tenantId, async (tx) => {
    const [tpl] = await tx
      .select()
      .from(tplTable)
      .where(eq(tplTable.id, templateId))
      .limit(1);
    return tpl!;
  });

  const version = await saveDraft(ctx, roomId, {
    snapshotJson: template.snapshotJson as Record<string, unknown>,
  });

  await auditLog(ctx, 'room_layouts.template.applied', 'floor_plan_room', roomId, undefined, {
    templateId,
    templateName: template.name,
  });

  return version;
}
