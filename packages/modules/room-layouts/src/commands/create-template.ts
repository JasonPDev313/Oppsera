import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { ConflictError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { floorPlanTemplatesV2 } from '../schema';
import type { CreateTemplateInput } from '../validation';
import { computeSnapshotStats } from '../helpers';
import { ROOM_LAYOUT_EVENTS } from '../events/types';

export async function createTemplate(ctx: RequestContext, input: CreateTemplateInput) {
  const template = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createTemplate');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Check unique name per tenant (active only)
    const [existing] = await tx
      .select()
      .from(floorPlanTemplatesV2)
      .where(
        and(
          eq(floorPlanTemplatesV2.tenantId, ctx.tenantId),
          eq(floorPlanTemplatesV2.name, input.name),
          eq(floorPlanTemplatesV2.isActive, true),
        ),
      )
      .limit(1);
    if (existing) throw new ConflictError(`Template with name "${input.name}" already exists`);

    const { objectCount, totalCapacity } = computeSnapshotStats(input.snapshotJson);

    const [created] = await tx
      .insert(floorPlanTemplatesV2)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? 'custom',
        snapshotJson: input.snapshotJson,
        widthFt: String(input.widthFt),
        heightFt: String(input.heightFt),
        objectCount,
        totalCapacity,
        createdBy: ctx.user.id,
      })
      .returning();

    const event = buildEventFromContext(ctx, ROOM_LAYOUT_EVENTS.TEMPLATE_CREATED, {
      templateId: created!.id,
      name: input.name,
      category: input.category ?? 'custom',
      objectCount,
      totalCapacity,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createTemplate', created);

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'room_layouts.template.created', 'floor_plan_template', template.id);
  return template;
}
