/**
 * Update tax mappings: save user-confirmed tax mapping decisions.
 */

import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { importJobs, importTaxMappings } from '@oppsera/db';

import type { UpdateTaxMappingsInput } from '../validation';

export async function updateTaxMappings(
  ctx: RequestContext,
  input: UpdateTaxMappingsInput,
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
        .update(importTaxMappings)
        .set({
          oppseraTaxGroupId: mapping.oppseraTaxGroupId ?? null,
          taxMode: mapping.taxMode,
          isConfirmed: mapping.isConfirmed ?? true,
        })
        .where(
          and(
            eq(importTaxMappings.id, mapping.id),
            eq(importTaxMappings.tenantId, ctx.tenantId),
          ),
        );
    }

    return { result: { updated: input.mappings.length }, events: [] };
  });

  await auditLog(ctx, 'import.tax_mappings.updated', 'import_job', input.importJobId);
  return result;
}
