import { describe, it, expect } from 'vitest';
import { validateFnbSettings } from '../queries/validate-fnb-settings';

describe('validateFnbSettings', () => {
  it('validates valid settings successfully', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_general',
      settings: { covers_tracking_enabled: false },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for unknown keys', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_general',
      settings: { unknown_key: 'value' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.key).toBe('unknown_key');
  });

  it('returns errors for invalid values', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_kitchen',
      settings: { kds_warning_threshold_seconds: 10 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validates fnb_floor with valid hex colors', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_floor',
      settings: {
        table_status_colors: { available: '#FF0000', seated: '#00FF00' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects fnb_floor with invalid hex colors', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_floor',
      settings: {
        table_status_colors: { available: 'not-a-color' },
      },
    });
    expect(result.valid).toBe(false);
  });

  it('validates fnb_ordering with valid courses', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_ordering',
      settings: {
        default_courses: ['Appetizers', 'Mains', 'Desserts', 'Coffee'],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects fnb_ordering with empty courses', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_ordering',
      settings: { default_courses: [] },
    });
    expect(result.valid).toBe(false);
  });

  it('validates fnb_payment with custom tip suggestions', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_payment',
      settings: { tip_suggestions: [10, 15, 20] },
    });
    expect(result.valid).toBe(true);
  });

  it('validates fnb_tips with custom presets', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_tips',
      settings: {
        tip_out_presets: [
          { role: 'busser', percentage: 5 },
          { role: 'barback', percentage: 3 },
        ],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('validates fnb_accounting with GL accounts', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_accounting',
      settings: {
        default_revenue_gl_account: 'acct-4100',
        posting_timing: 'realtime',
      },
    });
    expect(result.valid).toBe(true);
  });

  it('validates fnb_receipts with header lines', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_receipts',
      settings: {
        receipt_header_lines: ['Welcome!', 'Enjoy your meal.'],
        default_receipt_delivery: 'email',
      },
    });
    expect(result.valid).toBe(true);
  });

  it('validates fnb_hardware with custom heartbeat', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_hardware',
      settings: {
        device_heartbeat_interval_seconds: 60,
        offline_mode_enabled: true,
        offline_max_queued_orders: 100,
      },
    });
    expect(result.valid).toBe(true);
  });

  it('validates empty settings (all defaults used)', () => {
    const result = validateFnbSettings({
      moduleKey: 'fnb_general',
      settings: {},
    });
    expect(result.valid).toBe(true);
  });
});
