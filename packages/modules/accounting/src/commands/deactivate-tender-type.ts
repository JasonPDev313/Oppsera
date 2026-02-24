import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { tenantTenderTypes } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';

export async function deactivateTenderType(
  ctx: RequestContext,
  tenderTypeId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find existing
    const existing = await tx
      .select()
      .from(tenantTenderTypes)
      .where(
        and(
          eq(tenantTenderTypes.tenantId, ctx.tenantId),
          eq(tenantTenderTypes.id, tenderTypeId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundError('Tender Type', tenderTypeId);
    }

    const current = existing[0]!;

    if (!current.isActive) {
      throw new AppError('ALREADY_INACTIVE', 'This tender type is already inactive', 409);
    }

    // Deactivate tender type
    const [updated] = await tx
      .update(tenantTenderTypes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(tenantTenderTypes.tenantId, ctx.tenantId),
          eq(tenantTenderTypes.id, tenderTypeId),
        ),
      )
      .returning();

    // Also deactivate in gl_transaction_types
    await tx.execute(sql`
      UPDATE gl_transaction_types
      SET is_active = false, updated_at = NOW()
      WHERE tenant_id = ${ctx.tenantId} AND code = ${current.code}
    `);

    const event = buildEventFromContext(ctx, 'accounting.tender_type.deactivated.v1', {
      tenderTypeId,
      code: current.code,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'accounting.tender_type.deactivated', 'tenant_tender_types', tenderTypeId);

  return result;
}
