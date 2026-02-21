import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { fnbSections } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpdateSectionInput } from '../validation';
import { FNB_EVENTS } from '../events/types';

export async function updateSection(
  ctx: RequestContext,
  sectionId: string,
  input: UpdateSectionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any)
      .select()
      .from(fnbSections)
      .where(and(
        eq(fnbSections.id, sectionId),
        eq(fnbSections.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Section', sectionId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const changes: Record<string, unknown> = {};

    if (input.name !== undefined && input.name !== existing.name) {
      updates.name = input.name;
      changes.name = { old: existing.name, new: input.name };
    }
    if (input.color !== undefined && input.color !== existing.color) {
      updates.color = input.color;
      changes.color = { old: existing.color, new: input.color };
    }
    if (input.sortOrder !== undefined && input.sortOrder !== existing.sortOrder) {
      updates.sortOrder = input.sortOrder;
      changes.sortOrder = { old: existing.sortOrder, new: input.sortOrder };
    }
    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      updates.isActive = input.isActive;
      changes.isActive = { old: existing.isActive, new: input.isActive };
    }

    if (Object.keys(changes).length === 0) {
      return { result: existing, events: [] };
    }

    const [updated] = await (tx as any)
      .update(fnbSections)
      .set(updates)
      .where(eq(fnbSections.id, sectionId))
      .returning();

    const event = buildEventFromContext(ctx, FNB_EVENTS.SECTION_UPDATED, {
      sectionId,
      changes,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'fnb.section.updated', 'fnb_sections', sectionId);
  return result;
}
