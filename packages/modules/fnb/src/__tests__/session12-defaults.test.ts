import { describe, it, expect } from 'vitest';
import {
  FNB_SETTINGS_DEFAULTS,
  getSettingDefault,
  getSettingKeys,
} from '../helpers/fnb-settings-defaults';
import { FNB_SETTINGS_MODULE_KEYS } from '../validation';

describe('FNB_SETTINGS_DEFAULTS', () => {
  it('has defaults for every module key', () => {
    for (const key of FNB_SETTINGS_MODULE_KEYS) {
      expect(FNB_SETTINGS_DEFAULTS[key]).toBeDefined();
      expect(Object.keys(FNB_SETTINGS_DEFAULTS[key]).length).toBeGreaterThan(0);
    }
  });

  it('fnb_general has 8 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_general)).toHaveLength(8);
  });

  it('fnb_floor has 5 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_floor)).toHaveLength(5);
  });

  it('fnb_ordering has 7 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_ordering)).toHaveLength(7);
  });

  it('fnb_kitchen has 7 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_kitchen)).toHaveLength(7);
  });

  it('fnb_payment has 13 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_payment)).toHaveLength(13);
  });

  it('fnb_tips has 5 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_tips)).toHaveLength(5);
  });

  it('fnb_accounting has 10 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_accounting)).toHaveLength(10);
  });

  it('fnb_receipts has 7 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_receipts)).toHaveLength(7);
  });

  it('fnb_hardware has 4 settings', () => {
    expect(Object.keys(FNB_SETTINGS_DEFAULTS.fnb_hardware)).toHaveLength(4);
  });

  it('total settings across all modules is 79', () => {
    let total = 0;
    for (const key of FNB_SETTINGS_MODULE_KEYS) {
      total += Object.keys(FNB_SETTINGS_DEFAULTS[key]).length;
    }
    expect(total).toBe(79);
  });
});

describe('getSettingDefault', () => {
  it('returns default for known key', () => {
    expect(getSettingDefault('fnb_general', 'business_day_cutoff_time')).toBe('03:00');
  });

  it('returns default for nested object key', () => {
    const colors = getSettingDefault('fnb_floor', 'table_status_colors') as Record<string, string>;
    expect(colors.available).toBe('#4CAF50');
  });

  it('returns null for unknown key', () => {
    expect(getSettingDefault('fnb_general', 'nonexistent')).toBeNull();
  });
});

describe('getSettingKeys', () => {
  it('returns all keys for fnb_general', () => {
    const keys = getSettingKeys('fnb_general');
    expect(keys).toContain('business_day_cutoff_time');
    expect(keys).toContain('currency_code');
    expect(keys).toHaveLength(8);
  });

  it('returns all keys for fnb_payment', () => {
    const keys = getSettingKeys('fnb_payment');
    expect(keys).toContain('tip_suggestions');
    expect(keys).toContain('preauth_default_amount_cents');
    expect(keys).toHaveLength(13);
  });
});
