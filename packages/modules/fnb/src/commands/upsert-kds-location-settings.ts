import { withTenant, fnbKdsLocationSettings } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared/utils/ulid';
import { AppError } from '@oppsera/shared';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { resolveKdsLocationId } from '../services/kds-routing-engine';

export interface UpsertKdsLocationSettingsInput {
  staleTicketMode: 'persist' | 'auto_clear';
  autoClearTime: string;
}

export async function upsertKdsLocationSettings(
  ctx: RequestContext,
  input: UpsertKdsLocationSettingsInput,
) {
  if (!ctx.locationId) throw new Error('locationId is required');

  // Resolve site → venue (KDS settings are venue-scoped)
  const kdsLocation = await resolveKdsLocationId(ctx.tenantId, ctx.locationId);
  if (kdsLocation.warning) {
    throw new AppError('VENUE_REQUIRED', kdsLocation.warning, 400);
  }
  const locationId = kdsLocation.locationId;

  const result = await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .insert(fnbKdsLocationSettings)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        locationId,
        staleTicketMode: input.staleTicketMode,
        autoClearTime: input.autoClearTime,
      })
      .onConflictDoUpdate({
        target: [fnbKdsLocationSettings.tenantId, fnbKdsLocationSettings.locationId],
        set: {
          staleTicketMode: input.staleTicketMode,
          autoClearTime: input.autoClearTime,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  });

  auditLogDeferred(ctx, 'kds.location_settings.updated', 'fnb_kds_location_settings', result!.id);
  return {
    id: result!.id,
    staleTicketMode: result!.staleTicketMode,
    autoClearTime: result!.autoClearTime,
  };
}
