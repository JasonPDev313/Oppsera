import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccounts, autopayProfiles } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { ConfigureAutopayProfileInput } from '../validation';

export async function configureAutopayProfile(
  ctx: RequestContext,
  input: ConfigureAutopayProfileInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate membership account exists and belongs to tenant
    const [account] = await (tx as any)
      .select({ id: membershipAccounts.id, status: membershipAccounts.status })
      .from(membershipAccounts)
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.membershipAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new NotFoundError('MembershipAccount', input.membershipAccountId);
    }

    // Check if a profile already exists for this account (upsert pattern)
    const [existing] = await (tx as any)
      .select({ id: autopayProfiles.id })
      .from(autopayProfiles)
      .where(
        and(
          eq(autopayProfiles.tenantId, ctx.tenantId),
          eq(autopayProfiles.membershipAccountId, input.membershipAccountId),
        ),
      )
      .limit(1);

    const now = new Date();
    const strategy = input.strategy ?? 'full_balance';
    const isActive = input.isActive ?? true;
    const fixedAmountCents = input.fixedAmountCents ?? 0;

    let profile: Record<string, unknown>;

    if (existing) {
      // Update existing profile
      const [updated] = await (tx as any)
        .update(autopayProfiles)
        .set({
          paymentMethodId: input.paymentMethodId ?? null,
          strategy,
          fixedAmountCents,
          selectedAccountTypes: input.selectedAccountTypes ?? null,
          isActive,
          updatedAt: now,
        })
        .where(
          and(
            eq(autopayProfiles.tenantId, ctx.tenantId),
            eq(autopayProfiles.id, existing.id),
          ),
        )
        .returning();

      profile = updated!;
    } else {
      // Create new profile
      const id = generateUlid();
      const [created] = await (tx as any)
        .insert(autopayProfiles)
        .values({
          id,
          tenantId: ctx.tenantId,
          membershipAccountId: input.membershipAccountId,
          paymentMethodId: input.paymentMethodId ?? null,
          strategy,
          fixedAmountCents,
          selectedAccountTypes: input.selectedAccountTypes ?? null,
          isActive,
          lastRunAt: null,
          nextRunAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      profile = created!;
    }

    // Also sync the autopayEnabled flag on the membership account
    await (tx as any)
      .update(membershipAccounts)
      .set({ autopayEnabled: isActive, updatedAt: now })
      .where(
        and(
          eq(membershipAccounts.tenantId, ctx.tenantId),
          eq(membershipAccounts.id, input.membershipAccountId),
        ),
      );

    const event = buildEventFromContext(ctx, 'membership.autopay.profile.configured.v1', {
      profileId: (profile as any).id,
      membershipAccountId: input.membershipAccountId,
      strategy,
      isActive,
      isUpdate: !!existing,
    });

    return { result: profile as any, events: [event] };
  });

  await auditLog(ctx, 'membership.autopay.profile.configured', 'autopay_profile', result.id);
  return result;
}
