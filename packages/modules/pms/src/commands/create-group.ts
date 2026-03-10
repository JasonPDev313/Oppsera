import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsProperties, pmsGroups, pmsRatePlans, pmsCorporateAccounts } from '@oppsera/db';
import type { CreateGroupInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createGroup(ctx: RequestContext, input: CreateGroupInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'pms.createGroup');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Validate property exists and belongs to tenant
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

    // Validate corporate account if provided
    if (input.corporateAccountId) {
      const [corp] = await tx
        .select()
        .from(pmsCorporateAccounts)
        .where(
          and(
            eq(pmsCorporateAccounts.id, input.corporateAccountId),
            eq(pmsCorporateAccounts.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!corp) {
        throw new NotFoundError('Corporate account', input.corporateAccountId);
      }
    }

    // Validate rate plan if provided
    if (input.ratePlanId) {
      const [ratePlan] = await tx
        .select()
        .from(pmsRatePlans)
        .where(
          and(
            eq(pmsRatePlans.id, input.ratePlanId),
            eq(pmsRatePlans.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!ratePlan) {
        throw new NotFoundError('Rate plan', input.ratePlanId);
      }
    }

    // Acquire a transaction-scoped advisory lock keyed on (tenant, property) to
    // serialize concurrent group creates and prevent duplicate confirmation numbers.
    // pg_advisory_xact_lock is released automatically when the transaction ends.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId} || ':grp:' || ${input.propertyId})::bigint)
    `);
    const confRows = await tx.execute(sql`
      SELECT COALESCE(MAX(confirmation_number), 0) + 1 AS next_num
      FROM pms_groups
      WHERE tenant_id = ${ctx.tenantId} AND property_id = ${input.propertyId}
    `);
    const confArr = Array.from(confRows as Iterable<Record<string, unknown>>);
    const confirmationNumber = Number(confArr[0]?.next_num ?? 1);

    const [created] = await tx
      .insert(pmsGroups)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        name: input.name,
        groupCode: input.groupCode ?? null,
        confirmationNumber,
        groupType: input.groupType ?? 'other',
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        corporateAccountId: input.corporateAccountId ?? null,
        ratePlanId: input.ratePlanId ?? null,
        negotiatedRateCents: input.negotiatedRateCents ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        cutoffDate: input.cutoffDate ?? null,
        status: input.status ?? 'tentative',
        billingType: input.billingType ?? 'individual',
        notes: input.notes ?? null,
        source: input.source ?? null,
        market: input.market ?? null,
        bookingMethod: input.bookingMethod ?? null,
        salesRepUserId: input.salesRepUserId ?? null,
        specialRequests: input.specialRequests ?? null,
        groupComments: input.groupComments ?? null,
        reservationComments: input.reservationComments ?? null,
        autoReleaseAtCutoff: input.autoReleaseAtCutoff ?? false,
        shoulderDatesEnabled: input.shoulderDatesEnabled ?? false,
        shoulderStartDate: input.shoulderStartDate ?? null,
        shoulderEndDate: input.shoulderEndDate ?? null,
        shoulderRateCents: input.shoulderRateCents ?? null,
        autoRoutePackagesToMaster: input.autoRoutePackagesToMaster ?? false,
        autoRouteSpecialsToMaster: input.autoRouteSpecialsToMaster ?? false,
        totalRoomsBlocked: 0,
        roomsPickedUp: 0,
        version: 1,
        createdBy: ctx.user.id,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'group', created!.id, 'created', {
      name: input.name,
      groupType: input.groupType ?? 'other',
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? 'tentative',
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_CREATED, {
      groupId: created!.id,
      propertyId: input.propertyId,
      name: input.name,
      groupType: input.groupType ?? 'other',
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? 'tentative',
      corporateAccountId: input.corporateAccountId ?? null,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'pms.createGroup', created);
    }

    return { result: created!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.group.created', 'pms_group', result.id);

  return result;
}
