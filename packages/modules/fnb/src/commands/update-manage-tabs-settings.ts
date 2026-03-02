import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { fnbManageTabsSettings } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { ManageTabsSettingsInput } from '../validation';

export async function updateManageTabsSettings(
  ctx: RequestContext,
  locationId: string | null,
  input: ManageTabsSettingsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Build the set fields from provided input (skip undefined)
    const setFields: Record<string, unknown> = { updatedAt: new Date() };
    if (input.showManageTabsButton !== undefined) setFields.showManageTabsButton = input.showManageTabsButton;
    if (input.requirePinForTransfer !== undefined) setFields.requirePinForTransfer = input.requirePinForTransfer;
    if (input.requirePinForVoid !== undefined) setFields.requirePinForVoid = input.requirePinForVoid;
    if (input.allowBulkAllServers !== undefined) setFields.allowBulkAllServers = input.allowBulkAllServers;
    if (input.readOnlyForNonManagers !== undefined) setFields.readOnlyForNonManagers = input.readOnlyForNonManagers;
    if (input.maxBulkSelection !== undefined) setFields.maxBulkSelection = input.maxBulkSelection;

    // Upsert: try update first, insert if not exists
    const existing = await (tx as any)
      .select()
      .from(fnbManageTabsSettings)
      .where(and(
        eq(fnbManageTabsSettings.tenantId, ctx.tenantId),
        locationId
          ? eq(fnbManageTabsSettings.locationId, locationId)
          : sql`${fnbManageTabsSettings.locationId} IS NULL`,
      ))
      .limit(1);

    let settings;
    if (existing.length > 0) {
      [settings] = await (tx as any)
        .update(fnbManageTabsSettings)
        .set(setFields)
        .where(eq(fnbManageTabsSettings.id, existing[0].id))
        .returning();
    } else {
      [settings] = await (tx as any)
        .insert(fnbManageTabsSettings)
        .values({
          tenantId: ctx.tenantId,
          locationId: locationId ?? null,
          ...setFields,
        })
        .returning();
    }

    const event = buildEventFromContext(ctx, 'fnb.manage_tabs.settings_updated.v1', {
      settingsId: settings.id,
      locationId: locationId ?? null,
      changes: input,
    });

    return { result: settings!, events: [event] };
  });

  await auditLog(ctx, 'fnb.manage_tabs.settings_updated', 'fnb_manage_tabs_settings', result.id, undefined, {
    locationId,
    changes: input,
  });

  return result;
}
