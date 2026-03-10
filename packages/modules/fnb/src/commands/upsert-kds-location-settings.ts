import { eq, and } from 'drizzle-orm';
import { withTenant, fnbKdsLocationSettings } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared/utils/ulid';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';

export interface UpsertKdsLocationSettingsInput {
  staleTicketMode: 'persist' | 'auto_clear';
  autoClearTime: string;
}

export async function upsertKdsLocationSettings(
  ctx: RequestContext,
  input: UpsertKdsLocationSettingsInput,
) {
  const locationId = ctx.locationId;
  if (!locationId) throw new Error('locationId is required');

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: fnbKdsLocationSettings.id })
      .from(fnbKdsLocationSettings)
      .where(and(
        eq(fnbKdsLocationSettings.tenantId, ctx.tenantId),
        eq(fnbKdsLocationSettings.locationId, locationId),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(fnbKdsLocationSettings)
        .set({
          staleTicketMode: input.staleTicketMode,
          autoClearTime: input.autoClearTime,
          updatedAt: new Date(),
        })
        .where(eq(fnbKdsLocationSettings.id, existing.id))
        .returning();
      return updated;
    }

    const [inserted] = await tx
      .insert(fnbKdsLocationSettings)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        locationId,
        staleTicketMode: input.staleTicketMode,
        autoClearTime: input.autoClearTime,
      })
      .returning();
    return inserted;
  });

  auditLogDeferred(ctx, 'kds.location_settings.updated', 'fnb_kds_location_settings', result!.id);
  return {
    id: result!.id,
    staleTicketMode: result!.staleTicketMode,
    autoClearTime: result!.autoClearTime,
  };
}
