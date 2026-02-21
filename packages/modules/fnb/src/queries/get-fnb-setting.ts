import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetFnbSettingInput, FnbSettingsModuleKey } from '../validation';
import { FNB_SETTINGS_DEFAULTS } from '../helpers/fnb-settings-defaults';
import { InvalidSettingKeyError } from '../errors';

export interface FnbSettingResult {
  moduleKey: string;
  settingKey: string;
  value: unknown;
  isLocationOverride: boolean;
  isDefault: boolean;
}

/**
 * Gets a single setting value with location-level override resolution.
 */
export async function getFnbSetting(
  input: GetFnbSettingInput,
): Promise<FnbSettingResult> {
  const defaults = FNB_SETTINGS_DEFAULTS[input.moduleKey as FnbSettingsModuleKey];
  const validKeys = Object.keys(defaults);

  if (!validKeys.includes(input.settingKey)) {
    throw new InvalidSettingKeyError(input.moduleKey, input.settingKey);
  }

  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT value, location_id
          FROM tenant_settings
          WHERE tenant_id = ${input.tenantId}
            AND module_key = ${input.moduleKey}
            AND setting_key = ${input.settingKey}
            AND (location_id = ${input.locationId ?? null} OR location_id IS NULL)
          ORDER BY location_id DESC NULLS LAST
          LIMIT 1`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);

    if (results.length === 0) {
      return {
        moduleKey: input.moduleKey,
        settingKey: input.settingKey,
        value: defaults[input.settingKey],
        isLocationOverride: false,
        isDefault: true,
      };
    }

    const r = results[0]!;
    return {
      moduleKey: input.moduleKey,
      settingKey: input.settingKey,
      value: r.value,
      isLocationOverride: r.location_id != null,
      isDefault: false,
    };
  });
}
