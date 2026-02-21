import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanTemplatesV2 } from '../schema';

export async function deleteTemplate(ctx: RequestContext, templateId: string) {
  const template = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(floorPlanTemplatesV2)
      .where(and(eq(floorPlanTemplatesV2.id, templateId), eq(floorPlanTemplatesV2.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Template', templateId);

    const [updated] = await tx
      .update(floorPlanTemplatesV2)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(floorPlanTemplatesV2.id, templateId))
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'room_layouts.template.deleted', 'floor_plan_template', template.id);
  return template;
}
