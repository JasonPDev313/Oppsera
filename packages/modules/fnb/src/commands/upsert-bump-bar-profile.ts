import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKdsBumpBarProfiles } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateBumpBarProfileInput } from '../validation';

export async function upsertBumpBarProfile(
  ctx: RequestContext,
  input: CreateBumpBarProfileInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'upsertBumpBarProfile',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // If isDefault, clear other defaults for this tenant
    if (input.isDefault) {
      await (tx as any).execute(
        sql`UPDATE fnb_kds_bump_bar_profiles SET is_default = false
            WHERE tenant_id = ${ctx.tenantId} AND is_default = true`,
      );
    }

    const values = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? null,
      profileName: input.profileName,
      buttonCount: input.buttonCount ?? 10,
      keyMappings: input.keyMappings,
      isDefault: input.isDefault ?? false,
      isActive: true,
    };

    const [profile] = await (tx as any)
      .insert(fnbKdsBumpBarProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: [fnbKdsBumpBarProfiles.tenantId, fnbKdsBumpBarProfiles.profileName],
        set: {
          buttonCount: values.buttonCount,
          keyMappings: values.keyMappings,
          isDefault: values.isDefault,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    const event = buildEventFromContext(ctx, 'fnb.kds.bump_bar_profile.upserted.v1', {
      profileId: profile!.id,
      profileName: input.profileName,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'upsertBumpBarProfile', profile);
    return { result: profile!, events: [event] };
  });

  await auditLog(ctx, 'fnb.kds.bump_bar_profile.upserted', 'fnb_kds_bump_bar_profiles', result.id);
  return result;
}
