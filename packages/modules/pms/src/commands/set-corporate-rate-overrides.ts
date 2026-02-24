import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsCorporateAccounts, pmsCorporateRateOverrides } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { SetCorporateRateOverridesInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function setCorporateRateOverrides(
  ctx: RequestContext,
  input: SetCorporateRateOverridesInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate corporate account exists and belongs to tenant
    const [account] = await tx
      .select()
      .from(pmsCorporateAccounts)
      .where(
        and(
          eq(pmsCorporateAccounts.id, input.corporateAccountId),
          eq(pmsCorporateAccounts.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('Corporate account', input.corporateAccountId);
    }

    // Delete existing overrides for this account
    await tx.execute(sql`
      DELETE FROM pms_corporate_rate_overrides
      WHERE tenant_id = ${ctx.tenantId}
        AND corporate_account_id = ${input.corporateAccountId}
    `);

    // Insert new overrides
    for (const override of input.overrides) {
      await tx.insert(pmsCorporateRateOverrides).values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        corporateAccountId: input.corporateAccountId,
        roomTypeId: override.roomTypeId,
        negotiatedRateCents: override.negotiatedRateCents,
        startDate: override.startDate ?? null,
        endDate: override.endDate ?? null,
      });
    }

    const auditPropertyId = account.propertyId ?? 'cross-property';
    await pmsAuditLogEntry(tx, ctx, auditPropertyId, 'corporate_account', input.corporateAccountId, 'rates_set', {
      overridesCount: { before: null, after: input.overrides.length },
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.CORPORATE_RATES_SET, {
      corporateAccountId: input.corporateAccountId,
      propertyId: account.propertyId ?? null,
      overridesCount: input.overrides.length,
    });

    return {
      result: { corporateAccountId: input.corporateAccountId, overridesCount: input.overrides.length },
      events: [event],
    };
  });

  await auditLog(ctx, 'pms.corporate_account.rates_set', 'pms_corporate_account', input.corporateAccountId);

  return result;
}
