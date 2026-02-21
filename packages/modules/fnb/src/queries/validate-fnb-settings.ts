import type { ValidateFnbSettingsInput, FnbSettingsModuleKey } from '../validation';
import { FNB_SETTINGS_SCHEMAS } from '../validation';
import { FNB_SETTINGS_DEFAULTS } from '../helpers/fnb-settings-defaults';

export interface FnbSettingsValidationResult {
  valid: boolean;
  errors: Array<{ key: string; message: string }>;
}

/**
 * Dry-run validation of a settings object against its module schema.
 * Returns validation errors without persisting anything.
 */
export function validateFnbSettings(
  input: ValidateFnbSettingsInput,
): FnbSettingsValidationResult {
  const moduleKey = input.moduleKey as FnbSettingsModuleKey;
  const schema = FNB_SETTINGS_SCHEMAS[moduleKey];
  const defaults = FNB_SETTINGS_DEFAULTS[moduleKey];
  const validKeys = Object.keys(defaults);
  const errors: Array<{ key: string; message: string }> = [];

  // Check for unknown keys
  for (const key of Object.keys(input.settings)) {
    if (!validKeys.includes(key)) {
      errors.push({ key, message: `Unknown setting key '${key}' for module '${moduleKey}'` });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Merge with defaults and parse
  const merged = { ...defaults, ...input.settings };
  const result = schema.safeParse(merged);

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        key: issue.path.join('.'),
        message: issue.message,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
