import { describe, it, expect } from 'vitest';
import {
  InvalidSettingsModuleKeyError,
  InvalidSettingKeyError,
} from '../errors';

describe('Session 12 Errors', () => {
  it('InvalidSettingsModuleKeyError has code, message, 400 status', () => {
    const err = new InvalidSettingsModuleKeyError('fnb_invalid');
    expect(err.code).toBe('INVALID_SETTINGS_MODULE_KEY');
    expect(err.message).toContain('fnb_invalid');
    expect(err.statusCode).toBe(400);
  });

  it('InvalidSettingKeyError has code, message, 400 status', () => {
    const err = new InvalidSettingKeyError('fnb_general', 'unknown_key');
    expect(err.code).toBe('INVALID_SETTING_KEY');
    expect(err.message).toContain('fnb_general');
    expect(err.message).toContain('unknown_key');
    expect(err.statusCode).toBe(400);
  });
});
