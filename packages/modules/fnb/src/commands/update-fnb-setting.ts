import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { ulid } from '@oppsera/shared';
import type { UpdateFnbSettingInput } from '../validation';
import { FNB_SETTINGS_DEFAULTS } from '../helpers/fnb-settings-defaults';
import { InvalidSettingKeyError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { SettingsUpdatedPayload } from '../events/types';

export interface UpdateFnbSettingResult {
  moduleKey: string;
  settingKey: string;
  locationId: string | null;
  value: unknown;
}

export async function updateFnbSetting(
  ctx: RequestContext,
  input: UpdateFnbSettingInput,
): Promise<UpdateFnbSettingResult> {
  const { moduleKey, settingKey, value } = input;
  const defaults = FNB_SETTINGS_DEFAULTS[moduleKey];
  const validKeys = Object.keys(defaults);

  if (!validKeys.includes(settingKey)) {
    throw new InvalidSettingKeyError(moduleKey, settingKey);
  }

  const locationId = input.locationId ?? null;
  const jsonValue = JSON.stringify(value);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const id = ulid();

    if (locationId) {
      await tx.execute(
        sql`INSERT INTO tenant_settings (id, tenant_id, location_id, module_key, setting_key, value, created_at, updated_at)
            VALUES (${id}, ${ctx.tenantId}, ${locationId}, ${moduleKey}, ${settingKey}, ${jsonValue}::jsonb, NOW(), NOW())
            ON CONFLICT (tenant_id, COALESCE(location_id, ''), module_key, setting_key)
            DO UPDATE SET value = ${jsonValue}::jsonb, updated_at = NOW()`,
      );
    } else {
      await tx.execute(
        sql`INSERT INTO tenant_settings (id, tenant_id, location_id, module_key, setting_key, value, created_at, updated_at)
            VALUES (${id}, ${ctx.tenantId}, ${sql`NULL`}, ${moduleKey}, ${settingKey}, ${jsonValue}::jsonb, NOW(), NOW())
            ON CONFLICT (tenant_id, COALESCE(location_id, ''), module_key, setting_key)
            DO UPDATE SET value = ${jsonValue}::jsonb, updated_at = NOW()`,
      );
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.SETTINGS_UPDATED, {
      moduleKey,
      locationId,
      changedKeys: [settingKey],
      updatedBy: ctx.user.id,
    } satisfies SettingsUpdatedPayload);

    return {
      result: { moduleKey, settingKey, locationId, value },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.setting.updated', 'fnb_settings', `${moduleKey}.${settingKey}`);
  return result;
}
