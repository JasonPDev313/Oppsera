import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { sql } from 'drizzle-orm';
import { HOST_EVENTS } from '../events/host-events';
import {
  type WaitlistConfigRow,
  type WaitlistConfigInput,
  mapWaitlistConfigRow,
  mergeWaitlistConfig,
  waitlistConfigSchema,
  waitlistFormConfigSchema,
  waitlistNotificationConfigSchema,
  waitlistQueueConfigSchema,
  waitlistBrandingSchema,
  waitlistContentConfigSchema,
  waitlistOperatingHoursSchema,
} from '../services/waitlist-config';

export interface UpsertWaitlistConfigInput {
  locationId?: string | null;
  enabled?: boolean;
  slugOverride?: string | null;
  formConfig?: Partial<WaitlistConfigInput['formConfig']>;
  notificationConfig?: Partial<WaitlistConfigInput['notificationConfig']>;
  queueConfig?: Partial<WaitlistConfigInput['queueConfig']>;
  branding?: Partial<WaitlistConfigInput['branding']>;
  contentConfig?: Partial<WaitlistConfigInput['contentConfig']>;
  operatingHours?: Partial<WaitlistConfigInput['operatingHours']>;
}

/**
 * Upsert waitlist config for a location.
 * Merges partial updates into existing config to avoid data loss.
 */
export async function upsertWaitlistConfig(
  ctx: RequestContext,
  input: UpsertWaitlistConfigInput,
): Promise<WaitlistConfigRow> {
  const locationId = input.locationId ?? ctx.locationId ?? null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load existing to merge
    const existingRows = await tx.execute(sql`
      SELECT *
      FROM fnb_waitlist_config
      WHERE tenant_id = ${ctx.tenantId}
        AND ${locationId ? sql`location_id = ${locationId}` : sql`location_id IS NULL`}
      LIMIT 1
    `);

    const existingRow = Array.from(existingRows as Iterable<Record<string, unknown>>)[0];

    let merged;
    if (existingRow) {
      const existing = {
        formConfig: waitlistFormConfigSchema.parse(existingRow.form_config ?? {}),
        notificationConfig: waitlistNotificationConfigSchema.parse(existingRow.notification_config ?? {}),
        queueConfig: waitlistQueueConfigSchema.parse(existingRow.queue_config ?? {}),
        branding: waitlistBrandingSchema.parse(existingRow.branding ?? {}),
        contentConfig: waitlistContentConfigSchema.parse(existingRow.content_config ?? {}),
        operatingHours: waitlistOperatingHoursSchema.parse(existingRow.operating_hours ?? {}),
      };
      merged = mergeWaitlistConfig(existing, {
        formConfig: input.formConfig,
        notificationConfig: input.notificationConfig,
        queueConfig: input.queueConfig,
        branding: input.branding,
        contentConfig: input.contentConfig,
        operatingHours: input.operatingHours,
      });
    } else {
      merged = waitlistConfigSchema.parse({
        formConfig: input.formConfig ?? {},
        notificationConfig: input.notificationConfig ?? {},
        queueConfig: input.queueConfig ?? {},
        branding: input.branding ?? {},
        contentConfig: input.contentConfig ?? {},
        operatingHours: input.operatingHours ?? {},
      });
    }

    const enabled = input.enabled ?? (existingRow ? Boolean(existingRow.enabled) : false);
    const slugOverride = input.slugOverride !== undefined
      ? input.slugOverride
      : (existingRow ? (existingRow.slug_override as string | null) : null);

    const rows = await tx.execute(sql`
      INSERT INTO fnb_waitlist_config (
        id, tenant_id, location_id, enabled, slug_override,
        form_config, notification_config, queue_config,
        branding, content_config, operating_hours,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${locationId},
        ${enabled}, ${slugOverride},
        ${JSON.stringify(merged.formConfig)}::jsonb,
        ${JSON.stringify(merged.notificationConfig)}::jsonb,
        ${JSON.stringify(merged.queueConfig)}::jsonb,
        ${JSON.stringify(merged.branding)}::jsonb,
        ${JSON.stringify(merged.contentConfig)}::jsonb,
        ${JSON.stringify(merged.operatingHours)}::jsonb,
        now(), now()
      )
      ON CONFLICT (tenant_id, location_id) DO UPDATE SET
        enabled = ${enabled},
        slug_override = ${slugOverride},
        form_config = ${JSON.stringify(merged.formConfig)}::jsonb,
        notification_config = ${JSON.stringify(merged.notificationConfig)}::jsonb,
        queue_config = ${JSON.stringify(merged.queueConfig)}::jsonb,
        branding = ${JSON.stringify(merged.branding)}::jsonb,
        content_config = ${JSON.stringify(merged.contentConfig)}::jsonb,
        operating_hours = ${JSON.stringify(merged.operatingHours)}::jsonb,
        updated_at = now()
      RETURNING *
    `);

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    const configRow = mapWaitlistConfigRow(row);

    const changedFields = Object.keys(input).filter(
      (k) => input[k as keyof UpsertWaitlistConfigInput] !== undefined,
    );

    const event = buildEventFromContext(ctx, HOST_EVENTS.WAITLIST_SETTINGS_UPDATED, {
      configId: configRow.id,
      locationId,
      changedFields,
    });

    return { result: configRow, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.waitlist.settings_updated', 'waitlist_config', result.id);

  return result;
}
