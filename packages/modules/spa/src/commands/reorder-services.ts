import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaServices } from '@oppsera/db';
import { z } from 'zod';

const reorderServicesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number().int().min(0),
    }),
  ).min(1),
});

type ReorderServicesInput = z.input<typeof reorderServicesSchema>;

export async function reorderServices(ctx: RequestContext, input: ReorderServicesInput) {
  const parsed = reorderServicesSchema.parse(input);

  await publishWithOutbox(ctx, async (tx) => {
    // Validate all services exist and belong to this tenant
    const serviceIds = parsed.items.map((item) => item.id);
    const existingServices = await tx
      .select({ id: spaServices.id })
      .from(spaServices)
      .where(
        and(
          inArray(spaServices.id, serviceIds),
          eq(spaServices.tenantId, ctx.tenantId),
        ),
      );

    const existingIds = new Set(existingServices.map((s) => s.id));
    const missingIds = serviceIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Services not found: ${missingIds.join(', ')}`,
        400,
      );
    }

    // Batch update sort orders within the same transaction
    for (const item of parsed.items) {
      await tx
        .update(spaServices)
        .set({
          sortOrder: item.sortOrder,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(spaServices.id, item.id),
            eq(spaServices.tenantId, ctx.tenantId),
          ),
        );
    }

    return { result: { updated: parsed.items.length }, events: [] };
  });

  await auditLog(ctx, 'spa.services.reordered', 'spa_service', 'batch');
}
