/**
 * Cancel an import job.
 */

import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { importJobs } from '@oppsera/db';

import type { CancelImportInput } from '../validation';

const CANCELLABLE_STATUSES = ['analyzing', 'mapping', 'validating', 'ready', 'importing'];

export async function cancelImport(
  ctx: RequestContext,
  input: CancelImportInput,
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
    if (!CANCELLABLE_STATUSES.includes(job.status)) {
      throw new Error(`Cannot cancel job in "${job.status}" status`);
    }

    await tx
      .update(importJobs)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, input.importJobId));

    const event = buildEventFromContext(ctx, 'import.job.cancelled.v1', {
      importJobId: input.importJobId,
      previousStatus: job.status,
    });

    return { result: { importJobId: input.importJobId, status: 'cancelled' }, events: [event] };
  });

  await auditLog(ctx, 'import.job.cancelled', 'import_job', input.importJobId);
  return result;
}
