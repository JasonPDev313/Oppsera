import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { reportDefinitions } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export async function deleteReport(ctx: RequestContext, reportId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(reportDefinitions)
      .where(and(
        eq(reportDefinitions.id, reportId),
        eq(reportDefinitions.tenantId, ctx.tenantId),
      ))
      .limit(1);

    if (!existing) throw new NotFoundError('Report not found');
    if (existing.isArchived) throw new ValidationError('Report is already archived');

    const [updated] = await (tx as any).update(reportDefinitions)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(eq(reportDefinitions.id, reportId))
      .returning();

    const event = buildEventFromContext(ctx, 'reporting.report.archived.v1', {
      reportId: updated!.id,
      name: updated!.name,
    });
    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'reporting.report.archived', 'report_definition', result.id);
  return result;
}
