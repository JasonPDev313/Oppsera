import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid } from '@oppsera/shared';
import type { UpdateFnbSettingsInput } from '../validation';
import { FNB_SETTINGS_SCHEMAS } from '../validation';
import { FNB_SETTINGS_DEFAULTS } from '../helpers/fnb-settings-defaults';
import { FNB_EVENTS } from '../events/types';
import type { SettingsUpdatedPayload } from '../events/types';

export interface UpdateFnbSettingsResult {
  moduleKey: string;
  locationId: string | null;
  updatedKeys: string[];
}

export async function updateFnbSettings(
  ctx: RequestContext,
  input: UpdateFnbSettingsInput,
): Promise<UpdateFnbSettingsResult> {
  const moduleKey = input.moduleKey;
  const schema = FNB_SETTINGS_SCHEMAS[moduleKey];
  const defaults = FNB_SETTINGS_DEFAULTS[moduleKey];

  // Validate the incoming settings against the module schema (partial — only validate provided keys)
  const validKeys = Object.keys(defaults);
  const changedKeys: string[] = [];

  for (const key of Object.keys(input.settings)) {
    if (!validKeys.includes(key)) {
      throw new Error(`Unknown setting key '${key}' for module '${moduleKey}'`);
    }
  }

  // Parse-validate via the full schema (merge with defaults for missing keys)
  const merged = { ...defaults, ...input.settings };
  schema.parse(merged);

  const locationId = input.locationId ?? null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    for (const [key, value] of Object.entries(input.settings)) {
      const jsonValue = JSON.stringify(value);
      const id = generateUlid();

      if (locationId) {
        await tx.execute(
          sql`INSERT INTO tenant_settings (id, tenant_id, location_id, module_key, setting_key, value, created_at, updated_at)
              VALUES (${id}, ${ctx.tenantId}, ${locationId}, ${moduleKey}, ${key}, ${jsonValue}::jsonb, NOW(), NOW())
              ON CONFLICT (tenant_id, module_key, setting_key, COALESCE(location_id, '__global__'))
              DO UPDATE SET value = ${jsonValue}::jsonb, updated_at = NOW()`,
        );
      } else {
        await tx.execute(
          sql`INSERT INTO tenant_settings (id, tenant_id, location_id, module_key, setting_key, value, created_at, updated_at)
              VALUES (${id}, ${ctx.tenantId}, ${sql`NULL`}, ${moduleKey}, ${key}, ${jsonValue}::jsonb, NOW(), NOW())
              ON CONFLICT (tenant_id, module_key, setting_key, COALESCE(location_id, '__global__'))
              DO UPDATE SET value = ${jsonValue}::jsonb, updated_at = NOW()`,
        );
      }
      changedKeys.push(key);
    }

    const event = buildEventFromContext(ctx, FNB_EVENTS.SETTINGS_UPDATED, {
      moduleKey,
      locationId,
      changedKeys,
      updatedBy: ctx.user.id,
    } satisfies SettingsUpdatedPayload);

    return {
      result: { moduleKey, locationId, updatedKeys: changedKeys },
      events: [event],
    };
  });

  await auditLog(ctx, 'fnb.settings.updated', 'fnb_settings', moduleKey);
  return result;
}
