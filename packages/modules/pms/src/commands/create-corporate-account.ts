import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsProperties, pmsCorporateAccounts, pmsRatePlans } from '@oppsera/db';
import type { CreateCorporateAccountInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createCorporateAccount(ctx: RequestContext, input: CreateCorporateAccountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'pms.createCorporateAccount');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Validate property if provided
    if (input.propertyId) {
      const [property] = await tx
        .select()
        .from(pmsProperties)
        .where(
          and(
            eq(pmsProperties.id, input.propertyId),
            eq(pmsProperties.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!property) {
        throw new NotFoundError('Property', input.propertyId);
      }
    }

    // Validate default rate plan if provided
    if (input.defaultRatePlanId) {
      const [ratePlan] = await tx
        .select()
        .from(pmsRatePlans)
        .where(
          and(
            eq(pmsRatePlans.id, input.defaultRatePlanId),
            eq(pmsRatePlans.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!ratePlan) {
        throw new NotFoundError('Rate plan', input.defaultRatePlanId);
      }
    }

    const [created] = await tx
      .insert(pmsCorporateAccounts)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId ?? null,
        companyName: input.companyName,
        taxId: input.taxId ?? null,
        billingAddressJson: input.billingAddressJson ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        defaultRatePlanId: input.defaultRatePlanId ?? null,
        negotiatedDiscountPct: input.negotiatedDiscountPct ?? null,
        billingType: input.billingType ?? 'credit_card',
        paymentTermsDays: input.paymentTermsDays ?? null,
        creditLimitCents: input.creditLimitCents ?? null,
        notes: input.notes ?? null,
        isActive: true,
        createdBy: ctx.user.id,
      })
      .returning();

    // Use propertyId for audit if available, otherwise use a placeholder
    const auditPropertyId = input.propertyId ?? 'cross-property';
    await pmsAuditLogEntry(tx, ctx, auditPropertyId, 'corporate_account', created!.id, 'created', {
      companyName: input.companyName,
      billingType: input.billingType ?? 'credit_card',
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.CORPORATE_ACCOUNT_CREATED, {
      corporateAccountId: created!.id,
      propertyId: input.propertyId ?? null,
      companyName: input.companyName,
      billingType: input.billingType ?? 'credit_card',
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'pms.createCorporateAccount', created);
    }

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.corporate_account.created', 'pms_corporate_account', result.id);

  return result;
}
