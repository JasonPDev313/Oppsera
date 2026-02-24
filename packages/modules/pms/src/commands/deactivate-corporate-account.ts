import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsCorporateAccounts } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function deactivateCorporateAccount(
  ctx: RequestContext,
  accountId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing account
    const [existing] = await tx
      .select()
      .from(pmsCorporateAccounts)
      .where(
        and(
          eq(pmsCorporateAccounts.id, accountId),
          eq(pmsCorporateAccounts.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Corporate account', accountId);
    }

    const [updated] = await tx
      .update(pmsCorporateAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(pmsCorporateAccounts.id, accountId), eq(pmsCorporateAccounts.tenantId, ctx.tenantId)))
      .returning();

    const auditPropertyId = existing.propertyId ?? 'cross-property';
    await pmsAuditLogEntry(
      tx, ctx, auditPropertyId, 'corporate_account', accountId, 'deactivated',
      { isActive: { before: existing.isActive, after: false } },
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.CORPORATE_ACCOUNT_DEACTIVATED, {
      corporateAccountId: accountId,
      propertyId: existing.propertyId ?? null,
      companyName: existing.companyName,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.corporate_account.deactivated', 'pms_corporate_account', accountId);

  return result;
}
