/**
 * Update tender mappings: save user-confirmed tender type decisions.
 */

import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { importJobs, importTenderMappings } from '@oppsera/db';

import type { UpdateTenderMappingsInput } from '../validation';

export async function updateTenderMappings(
  ctx: RequestContext,
  input: UpdateTenderMappingsInput,
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
        .update(importTenderMappings)
        .set({
          oppseraTenderType: mapping.oppseraTenderType,
          isConfirmed: mapping.isConfirmed ?? true,
        })
        .where(
          and(
            eq(importTenderMappings.id, mapping.id),
            eq(importTenderMappings.tenantId, ctx.tenantId),
          ),
        );
    }

    return { result: { updated: input.mappings.length }, events: [] };
  });

  await auditLog(ctx, 'import.tender_mappings.updated', 'import_job', input.importJobId);
  return result;
}
