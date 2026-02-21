import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetFnbSettingsInput, FnbSettingsModuleKey } from '../validation';
import { FNB_SETTINGS_DEFAULTS } from '../helpers/fnb-settings-defaults';

export interface FnbSettingsResult {
  moduleKey: string;
  settings: Record<string, unknown>;
  overrides: string[]; // keys that have location-level override
}

/**
 * Gets all settings for a given F&B module.
 * Resolution: location-specific row takes precedence over tenant-level default.
 * Missing keys are filled from hardcoded defaults.
 */
export async function getFnbSettings(
  input: GetFnbSettingsInput,
): Promise<FnbSettingsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT setting_key, value, location_id
          FROM tenant_settings
          WHERE tenant_id = ${input.tenantId}
            AND module_key = ${input.moduleKey}
            AND (location_id = ${input.locationId ?? null} OR location_id IS NULL)
          ORDER BY location_id DESC NULLS LAST`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);

    // Build resolved settings: location-specific overrides tenant-level
    const resolved: Record<string, unknown> = {};
    const overrides: string[] = [];
    const seen = new Set<string>();

    for (const r of results) {
      const key = r.setting_key as string;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved[key] = r.value;
      if (r.location_id != null) {
        overrides.push(key);
      }
    }

    // Fill missing keys from defaults
    const defaults = FNB_SETTINGS_DEFAULTS[input.moduleKey as FnbSettingsModuleKey];
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (!seen.has(key)) {
        resolved[key] = defaultValue;
      }
    }

    return {
      moduleKey: input.moduleKey,
      settings: resolved,
      overrides,
    };
  });
}
