import type { GetFnbSettingsDefaultsInput, FnbSettingsModuleKey } from '../validation';
import { FNB_SETTINGS_DEFAULTS } from '../helpers/fnb-settings-defaults';

export interface FnbSettingsDefaultsResult {
  moduleKey: string;
  defaults: Record<string, unknown>;
}

/**
 * Returns hardcoded defaults for a given F&B settings module.
 * No DB call needed — pure lookup for UI form reset.
 */
export function getFnbSettingsDefaults(
  input: GetFnbSettingsDefaultsInput,
): FnbSettingsDefaultsResult {
  return {
    moduleKey: input.moduleKey,
    defaults: { ...FNB_SETTINGS_DEFAULTS[input.moduleKey as FnbSettingsModuleKey] },
  };
}
