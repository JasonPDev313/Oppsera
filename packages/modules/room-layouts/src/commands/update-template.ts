import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanTemplatesV2 } from '../schema';

interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  category?: string;
}

export async function updateTemplate(
  ctx: RequestContext,
  templateId: string,
  input: UpdateTemplateInput,
) {
  const template = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(floorPlanTemplatesV2)
      .where(and(eq(floorPlanTemplatesV2.id, templateId), eq(floorPlanTemplatesV2.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Template', templateId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.category !== undefined) updates.category = input.category;

    const [updated] = await tx
      .update(floorPlanTemplatesV2)
      .set(updates)
      .where(eq(floorPlanTemplatesV2.id, templateId))
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'room_layouts.template.updated', 'floor_plan_template', template.id);
  return template;
}
