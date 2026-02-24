/**
 * Update item mappings: save user-confirmed item resolution decisions.
 */

import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { importJobs, importItemMappings } from '@oppsera/db';

import type { UpdateItemMappingsInput } from '../validation';

export async function updateItemMappings(
  ctx: RequestContext,
  input: UpdateItemMappingsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [job] = await tx
      .select()
      .from(importJobs)
      .where(
        and(
          eq(importJobs.id, input.importJobId),
          eq(importJobs.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!job) throw new Error(`Import job ${input.importJobId} not found`);
    if (job.status !== 'mapping' && job.status !== 'validating') {
      throw new Error(`Cannot update mappings for job in "${job.status}" status`);
    }

    for (const mapping of input.mappings) {
      await tx
        .update(importItemMappings)
        .set({
          oppseraCatalogItemId: mapping.oppseraCatalogItemId ?? null,
          strategy: mapping.strategy,
          isConfirmed: mapping.isConfirmed ?? true,
        })
        .where(
          and(
            eq(importItemMappings.id, mapping.id),
            eq(importItemMappings.tenantId, ctx.tenantId),
          ),
        );
    }

    return { result: { updated: input.mappings.length }, events: [] };
  });

  await auditLog(ctx, 'import.item_mappings.updated', 'import_job', input.importJobId);
  return result;
}
