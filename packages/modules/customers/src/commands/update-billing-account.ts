import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { computeChanges } from '@oppsera/core/audit/diff';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { billingAccounts } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { UpdateBillingAccountInput } from '../validation';

export async function updateBillingAccount(ctx: RequestContext, accountId: string, input: UpdateBillingAccountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await (tx as any).select().from(billingAccounts)
      .where(and(eq(billingAccounts.id, accountId), eq(billingAccounts.tenantId, ctx.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Billing account', accountId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.creditLimitCents !== undefined) updates.creditLimitCents = input.creditLimitCents;
    if (input.statementDayOfMonth !== undefined) updates.statementDayOfMonth = input.statementDayOfMonth;
    if (input.dueDays !== undefined) updates.dueDays = input.dueDays;
    if (input.lateFeePolicyId !== undefined) updates.lateFeePolicyId = input.lateFeePolicyId;
    if (input.autoPayEnabled !== undefined) updates.autoPayEnabled = input.autoPayEnabled;
    if (input.taxExempt !== undefined) updates.taxExempt = input.taxExempt;
    if (input.taxExemptCertificateNumber !== undefined) updates.taxExemptCertificateNumber = input.taxExemptCertificateNumber;
    if (input.authorizationRules !== undefined) updates.authorizationRules = input.authorizationRules;
    if (input.billingEmail !== undefined) updates.billingEmail = input.billingEmail;
    if (input.billingContactName !== undefined) updates.billingContactName = input.billingContactName;
    if (input.billingAddress !== undefined) updates.billingAddress = input.billingAddress;
    if (input.status !== undefined) updates.status = input.status;
    if (input.collectionStatus !== undefined) updates.collectionStatus = input.collectionStatus;

    const [updated] = await (tx as any).update(billingAccounts).set(updates)
      .where(eq(billingAccounts.id, accountId)).returning();

    const changes = computeChanges(existing, updated!);
    const event = buildEventFromContext(ctx, 'billing_account.updated.v1', { billingAccountId: accountId, changes });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'billing_account.updated', 'billing_account', accountId);
  return result;
}
