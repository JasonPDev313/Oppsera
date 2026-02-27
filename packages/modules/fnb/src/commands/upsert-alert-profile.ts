import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbKdsAlertProfiles } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreateAlertProfileInput } from '../validation';

export async function upsertAlertProfile(
  ctx: RequestContext,
  input: CreateAlertProfileInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'upsertAlertProfile',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // If isDefault, clear other defaults for this tenant
    if (input.isDefault) {
      await (tx as any).execute(
        sql`UPDATE fnb_kds_alert_profiles SET is_default = false
            WHERE tenant_id = ${ctx.tenantId} AND is_default = true`,
      );
    }

    const values = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? null,
      profileName: input.profileName,
      newTicketAlert: input.newTicketAlert ?? null,
      warningAlert: input.warningAlert ?? null,
      criticalAlert: input.criticalAlert ?? null,
      rushAlert: input.rushAlert ?? null,
      allergyAlert: input.allergyAlert ?? null,
      modificationAlert: input.modificationAlert ?? null,
      completeAlert: input.completeAlert ?? null,
      isDefault: input.isDefault ?? false,
      isActive: true,
    };

    const [profile] = await (tx as any)
      .insert(fnbKdsAlertProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: [fnbKdsAlertProfiles.tenantId, fnbKdsAlertProfiles.profileName],
        set: {
          newTicketAlert: values.newTicketAlert,
          warningAlert: values.warningAlert,
          criticalAlert: values.criticalAlert,
          rushAlert: values.rushAlert,
          allergyAlert: values.allergyAlert,
          modificationAlert: values.modificationAlert,
          completeAlert: values.completeAlert,
          isDefault: values.isDefault,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    const event = buildEventFromContext(ctx, 'fnb.kds.alert_profile.upserted.v1', {
      profileId: profile!.id,
      profileName: input.profileName,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'upsertAlertProfile', profile);
    return { result: profile!, events: [event] };
  });

  await auditLog(ctx, 'fnb.kds.alert_profile.upserted', 'fnb_kds_alert_profiles', result.id);
  return result;
}
