import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid } from '@oppsera/shared';
import { FNB_SETTINGS_DEFAULTS } from '../helpers/fnb-settings-defaults';
import { FNB_SETTINGS_MODULE_KEYS } from '../validation';
import type { FnbSettingsModuleKey } from '../validation';
import { FNB_EVENTS } from '../events/types';
import type { SettingsUpdatedPayload } from '../events/types';

export interface SeedFnbSettingsResult {
  seededModules: string[];
  totalSettings: number;
}

/**
 * Seeds all F&B settings for a tenant with default values.
 * Uses ON CONFLICT to skip existing settings (idempotent).
 */
export async function seedFnbSettings(
  ctx: RequestContext,
): Promise<SeedFnbSettingsResult> {
  let totalSettings = 0;
  const seededModules: string[] = [];

  const result = await publishWithOutbox(ctx, async (tx) => {
    const events = [];

    for (const moduleKey of FNB_SETTINGS_MODULE_KEYS) {
      const defaults = FNB_SETTINGS_DEFAULTS[moduleKey as FnbSettingsModuleKey];
      const seededKeys: string[] = [];

      for (const [settingKey, value] of Object.entries(defaults)) {
        const id = generateUlid();
        const jsonValue = JSON.stringify(value);

        await tx.execute(
          sql`INSERT INTO tenant_settings (id, tenant_id, location_id, module_key, setting_key, value, created_at, updated_at)
              VALUES (${id}, ${ctx.tenantId}, ${sql`NULL`}, ${moduleKey}, ${settingKey}, ${jsonValue}::jsonb, NOW(), NOW())
              ON CONFLICT (tenant_id, COALESCE(location_id, ''), module_key, setting_key)
              DO NOTHING`,
        );

        seededKeys.push(settingKey);
        totalSettings++;
      }

      seededModules.push(moduleKey);

      events.push(
        buildEventFromContext(ctx, FNB_EVENTS.SETTINGS_UPDATED, {
          moduleKey,
          locationId: null,
          changedKeys: seededKeys,
          updatedBy: ctx.user.id,
        } satisfies SettingsUpdatedPayload),
      );
    }

    return {
      result: { seededModules, totalSettings },
      events,
    };
  });

  await auditLog(ctx, 'fnb.settings.seeded', 'fnb_settings', 'all');
  return result;
}
