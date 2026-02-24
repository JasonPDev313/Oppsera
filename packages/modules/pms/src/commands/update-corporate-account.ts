import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsCorporateAccounts } from '@oppsera/db';
import type { UpdateCorporateAccountInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateCorporateAccount(
  ctx: RequestContext,
  accountId: string,
  input: UpdateCorporateAccountInput,
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

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.companyName !== undefined) updates.companyName = input.companyName;
    if (input.taxId !== undefined) updates.taxId = input.taxId;
    if (input.billingAddressJson !== undefined) updates.billingAddressJson = input.billingAddressJson;
    if (input.contactName !== undefined) updates.contactName = input.contactName;
    if (input.contactEmail !== undefined) updates.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) updates.contactPhone = input.contactPhone;
    if (input.defaultRatePlanId !== undefined) updates.defaultRatePlanId = input.defaultRatePlanId;
    if (input.negotiatedDiscountPct !== undefined) updates.negotiatedDiscountPct = input.negotiatedDiscountPct;
    if (input.billingType !== undefined) updates.billingType = input.billingType;
    if (input.paymentTermsDays !== undefined) updates.paymentTermsDays = input.paymentTermsDays;
    if (input.creditLimitCents !== undefined) updates.creditLimitCents = input.creditLimitCents;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.notes !== undefined) updates.notes = input.notes;

    const [updated] = await tx
      .update(pmsCorporateAccounts)
      .set(updates)
      .where(and(eq(pmsCorporateAccounts.id, accountId), eq(pmsCorporateAccounts.tenantId, ctx.tenantId)))
      .returning();

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.companyName !== undefined && existing.companyName !== updated!.companyName) {
      diff.companyName = { before: existing.companyName, after: updated!.companyName };
    }
    if (input.billingType !== undefined && existing.billingType !== updated!.billingType) {
      diff.billingType = { before: existing.billingType, after: updated!.billingType };
    }
    if (input.isActive !== undefined && existing.isActive !== updated!.isActive) {
      diff.isActive = { before: existing.isActive, after: updated!.isActive };
    }

    const auditPropertyId = existing.propertyId ?? 'cross-property';
    await pmsAuditLogEntry(
      tx, ctx, auditPropertyId, 'corporate_account', accountId, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.CORPORATE_ACCOUNT_UPDATED, {
      corporateAccountId: accountId,
      propertyId: existing.propertyId ?? null,
      changes: diff,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.corporate_account.updated', 'pms_corporate_account', accountId);

  return result;
}
