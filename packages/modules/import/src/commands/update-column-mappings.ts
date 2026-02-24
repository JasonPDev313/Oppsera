/**
 * Update column mappings: save user-confirmed mapping decisions.
 */

import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { importJobs, importColumnMappings } from '@oppsera/db';

import type { UpdateColumnMappingsInput } from '../validation';

export async function updateColumnMappings(
  ctx: RequestContext,
  input: UpdateColumnMappingsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify job exists and is in mapping status
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

    // Update each mapping
    for (const mapping of input.mappings) {
      await tx
        .update(importColumnMappings)
        .set({
          targetEntity: mapping.targetEntity,
          targetField: mapping.targetField,
          isConfirmed: mapping.isConfirmed ?? true,
          transformRule: mapping.transformRule ?? null,
        })
        .where(
          and(
            eq(importColumnMappings.id, mapping.id),
            eq(importColumnMappings.tenantId, ctx.tenantId),
          ),
        );
    }

    // Update grouping key if provided
    if (input.groupingKey !== undefined) {
      await tx
        .update(importJobs)
        .set({
          groupingKey: input.groupingKey,
          updatedAt: new Date(),
        })
        .where(eq(importJobs.id, input.importJobId));
    }

    return { result: { updated: input.mappings.length }, events: [] };
  });

  await auditLog(ctx, 'import.mappings.updated', 'import_job', input.importJobId);
  return result;
}
