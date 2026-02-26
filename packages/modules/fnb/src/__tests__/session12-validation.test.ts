import { describe, it, expect } from 'vitest';
import {
  FNB_SETTINGS_MODULE_KEYS,
  fnbGeneralSettingsSchema,
  fnbFloorSettingsSchema,
  fnbOrderingSettingsSchema,
  fnbKitchenSettingsSchema,
  fnbPaymentSettingsSchema,
  fnbTipsSettingsSchema,
  fnbAccountingSettingsSchema,
  fnbReceiptsSettingsSchema,
  fnbHardwareSettingsSchema,
  FNB_SETTINGS_SCHEMAS,
  getFnbSettingsSchema,
  updateFnbSettingsSchema,
  updateFnbSettingSchema,
  getFnbSettingSchema,
  validateFnbSettingsSchema,
} from '../validation';

// ── Module Keys ────────────────────────────────────────────────

describe('FNB_SETTINGS_MODULE_KEYS', () => {
  it('has 10 module keys', () => {
    expect(FNB_SETTINGS_MODULE_KEYS).toHaveLength(10);
  });

  it('includes all expected keys', () => {
    expect(FNB_SETTINGS_MODULE_KEYS).toEqual([
      'fnb_general', 'fnb_floor', 'fnb_ordering', 'fnb_kitchen',
      'fnb_payment', 'fnb_tips', 'fnb_accounting', 'fnb_receipts', 'fnb_hardware',
      'fnb_host',
    ]);
  });
});

// ── fnbGeneralSettingsSchema ───────────────────────────────────

describe('fnbGeneralSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbGeneralSettingsSchema.parse({});
    expect(result.business_day_cutoff_time).toBe('03:00');
    expect(result.default_service_type).toBe('dine_in');
    expect(result.rounding_rule).toBe('none');
    expect(result.covers_tracking_enabled).toBe(true);
    expect(result.require_table_for_dine_in).toBe(true);
    expect(result.require_customer_for_tab).toBe(false);
    expect(result.auto_print_check_on_close).toBe(true);
    expect(result.currency_code).toBe('USD');
  });

  it('accepts valid overrides', () => {
    const result = fnbGeneralSettingsSchema.parse({
      business_day_cutoff_time: '05:00',
      default_service_type: 'takeout',
      rounding_rule: 'nearest_5',
      currency_code: 'CAD',
    });
    expect(result.business_day_cutoff_time).toBe('05:00');
    expect(result.default_service_type).toBe('takeout');
    expect(result.rounding_rule).toBe('nearest_5');
    expect(result.currency_code).toBe('CAD');
  });

  it('rejects invalid cutoff time format', () => {
    expect(() => fnbGeneralSettingsSchema.parse({ business_day_cutoff_time: '3am' })).toThrow();
  });

  it('rejects invalid service type', () => {
    expect(() => fnbGeneralSettingsSchema.parse({ default_service_type: 'delivery' })).toThrow();
  });

  it('rejects currency code with wrong length', () => {
    expect(() => fnbGeneralSettingsSchema.parse({ currency_code: 'US' })).toThrow();
  });
});

// ── fnbFloorSettingsSchema ─────────────────────────────────────

describe('fnbFloorSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbFloorSettingsSchema.parse({});
    expect(result.table_turn_time_defaults).toEqual({ '2-top': 45, '4-top': 60, '6-top': 75, '8-top': 90 });
    expect(result.dirty_table_auto_reset_minutes).toBe(5);
    expect(result.auto_assign_server_by_section).toBe(true);
    expect(result.show_elapsed_time_on_tables).toBe(true);
    expect(result.table_status_colors.available).toBe('#4CAF50');
  });

  it('rejects dirty reset minutes out of range', () => {
    expect(() => fnbFloorSettingsSchema.parse({ dirty_table_auto_reset_minutes: 0 })).toThrow();
    expect(() => fnbFloorSettingsSchema.parse({ dirty_table_auto_reset_minutes: 121 })).toThrow();
  });

  it('rejects invalid hex color', () => {
    expect(() => fnbFloorSettingsSchema.parse({
      table_status_colors: { available: 'red' },
    })).toThrow();
  });
});

// ── fnbOrderingSettingsSchema ──────────────────────────────────

describe('fnbOrderingSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbOrderingSettingsSchema.parse({});
    expect(result.default_courses).toEqual(['Apps', 'Entrees', 'Desserts']);
    expect(result.auto_fire_single_course).toBe(true);
    expect(result.require_seat_number).toBe(false);
    expect(result.comp_reasons).toHaveLength(4);
    expect(result.void_reasons).toHaveLength(4);
    expect(result.item_note_presets).toHaveLength(5);
  });

  it('rejects more than 10 courses', () => {
    expect(() => fnbOrderingSettingsSchema.parse({
      default_courses: Array.from({ length: 11 }, (_, i) => `Course ${i + 1}`),
    })).toThrow();
  });

  it('rejects empty courses array', () => {
    expect(() => fnbOrderingSettingsSchema.parse({ default_courses: [] })).toThrow();
  });

  it('rejects course name over 50 chars', () => {
    expect(() => fnbOrderingSettingsSchema.parse({
      default_courses: ['A'.repeat(51)],
    })).toThrow();
  });
});

// ── fnbKitchenSettingsSchema ───────────────────────────────────

describe('fnbKitchenSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbKitchenSettingsSchema.parse({});
    expect(result.kds_warning_threshold_seconds).toBe(480);
    expect(result.kds_critical_threshold_seconds).toBe(720);
    expect(result.kds_bump_behavior).toBe('remove');
    expect(result.expo_mode_enabled).toBe(true);
    expect(result.delta_chit_enabled).toBe(true);
    expect(result.course_pacing_auto_fire).toBe(false);
  });

  it('rejects warning threshold below 60', () => {
    expect(() => fnbKitchenSettingsSchema.parse({ kds_warning_threshold_seconds: 59 })).toThrow();
  });

  it('rejects critical threshold above 3600', () => {
    expect(() => fnbKitchenSettingsSchema.parse({ kds_critical_threshold_seconds: 3601 })).toThrow();
  });

  it('accepts valid bump behavior', () => {
    const result = fnbKitchenSettingsSchema.parse({ kds_bump_behavior: 'move_to_done' });
    expect(result.kds_bump_behavior).toBe('move_to_done');
  });
});

// ── fnbPaymentSettingsSchema ───────────────────────────────────

describe('fnbPaymentSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbPaymentSettingsSchema.parse({});
    expect(result.tip_suggestions).toEqual([15, 18, 20, 25]);
    expect(result.tip_suggestion_type).toBe('percentage');
    expect(result.tip_adjustment_window_hours).toBe(48);
    expect(result.auto_gratuity_party_size_threshold).toBe(6);
    expect(result.auto_gratuity_percentage).toBe(20.0);
    expect(result.preauth_default_amount_cents).toBe(5000);
    expect(result.preauth_max_amount_cents).toBe(20000);
    expect(result.walkout_auto_close_hours).toBe(4);
    expect(result.allow_no_sale_drawer_open).toBe(false);
    expect(result.require_reason_for_void).toBe(true);
    expect(result.require_manager_for_void_after_send).toBe(true);
  });

  it('rejects tip suggestions over 100%', () => {
    expect(() => fnbPaymentSettingsSchema.parse({ tip_suggestions: [101] })).toThrow();
  });

  it('rejects preauth default below 500 cents', () => {
    expect(() => fnbPaymentSettingsSchema.parse({ preauth_default_amount_cents: 499 })).toThrow();
  });

  it('rejects tip adjustment window over 168 hours', () => {
    expect(() => fnbPaymentSettingsSchema.parse({ tip_adjustment_window_hours: 169 })).toThrow();
  });

  it('rejects walkout auto close over 24 hours', () => {
    expect(() => fnbPaymentSettingsSchema.parse({ walkout_auto_close_hours: 25 })).toThrow();
  });
});

// ── fnbTipsSettingsSchema ──────────────────────────────────────

describe('fnbTipsSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbTipsSettingsSchema.parse({});
    expect(result.tip_pool_type).toBe('none');
    expect(result.tip_pool_percentage_to_pool).toBe(0);
    expect(result.tip_pool_distribution_method).toBe('hours');
    expect(result.minimum_cash_tip_declaration_percentage).toBe(8.0);
    expect(result.tip_out_presets).toHaveLength(2);
    expect(result.tip_out_presets[0]).toEqual({ role: 'busser', percentage: 3 });
  });

  it('accepts custom tip out presets', () => {
    const result = fnbTipsSettingsSchema.parse({
      tip_out_presets: [
        { role: 'busser', percentage: 5 },
        { role: 'barback', percentage: 2 },
        { role: 'host', percentage: 1 },
      ],
    });
    expect(result.tip_out_presets).toHaveLength(3);
  });

  it('rejects more than 20 tip out presets', () => {
    const presets = Array.from({ length: 21 }, (_, i) => ({
      role: `role-${i}`,
      percentage: 1,
    }));
    expect(() => fnbTipsSettingsSchema.parse({ tip_out_presets: presets })).toThrow();
  });
});

// ── fnbAccountingSettingsSchema ────────────────────────────────

describe('fnbAccountingSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbAccountingSettingsSchema.parse({});
    expect(result.posting_timing).toBe('batch');
    expect(result.default_revenue_gl_account).toBeNull();
    expect(result.default_tax_liability_gl_account).toBeNull();
    expect(result.default_tips_payable_gl_account).toBeNull();
    expect(result.default_cash_gl_account).toBeNull();
    expect(result.default_card_clearing_gl_account).toBeNull();
    expect(result.discount_gl_treatment).toBe('contra_revenue');
    expect(result.comp_gl_account).toBeNull();
    expect(result.over_short_gl_account).toBeNull();
    expect(result.service_charge_gl_treatment).toBe('revenue');
  });

  it('accepts GL account values', () => {
    const result = fnbAccountingSettingsSchema.parse({
      default_revenue_gl_account: 'acct-4100',
      default_cash_gl_account: 'acct-1010',
      posting_timing: 'realtime',
    });
    expect(result.default_revenue_gl_account).toBe('acct-4100');
    expect(result.posting_timing).toBe('realtime');
  });

  it('rejects invalid posting timing', () => {
    expect(() => fnbAccountingSettingsSchema.parse({ posting_timing: 'manual' })).toThrow();
  });
});

// ── fnbReceiptsSettingsSchema ──────────────────────────────────

describe('fnbReceiptsSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbReceiptsSettingsSchema.parse({});
    expect(result.receipt_header_lines).toEqual([]);
    expect(result.receipt_footer_lines).toEqual([]);
    expect(result.show_item_modifiers_on_receipt).toBe(true);
    expect(result.show_server_name_on_receipt).toBe(true);
    expect(result.show_table_number_on_receipt).toBe(true);
    expect(result.default_receipt_delivery).toBe('print');
    expect(result.merchant_copy_auto_print).toBe(true);
  });

  it('accepts custom header/footer lines', () => {
    const result = fnbReceiptsSettingsSchema.parse({
      receipt_header_lines: ['Welcome to Restaurant', 'Enjoy your meal!'],
      receipt_footer_lines: ['Thank you for dining with us'],
    });
    expect(result.receipt_header_lines).toHaveLength(2);
    expect(result.receipt_footer_lines).toHaveLength(1);
  });

  it('rejects more than 10 header lines', () => {
    expect(() => fnbReceiptsSettingsSchema.parse({
      receipt_header_lines: Array.from({ length: 11 }, (_, i) => `Line ${i + 1}`),
    })).toThrow();
  });

  it('rejects invalid delivery method', () => {
    expect(() => fnbReceiptsSettingsSchema.parse({ default_receipt_delivery: 'fax' })).toThrow();
  });
});

// ── fnbHardwareSettingsSchema ──────────────────────────────────

describe('fnbHardwareSettingsSchema', () => {
  it('applies all defaults', () => {
    const result = fnbHardwareSettingsSchema.parse({});
    expect(result.device_heartbeat_interval_seconds).toBe(30);
    expect(result.offline_mode_enabled).toBe(false);
    expect(result.offline_max_queued_orders).toBe(50);
    expect(result.offline_payment_allowed).toBe(false);
  });

  it('rejects heartbeat below 10', () => {
    expect(() => fnbHardwareSettingsSchema.parse({ device_heartbeat_interval_seconds: 9 })).toThrow();
  });

  it('rejects heartbeat above 300', () => {
    expect(() => fnbHardwareSettingsSchema.parse({ device_heartbeat_interval_seconds: 301 })).toThrow();
  });

  it('rejects offline max orders below 10', () => {
    expect(() => fnbHardwareSettingsSchema.parse({ offline_max_queued_orders: 9 })).toThrow();
  });

  it('rejects offline max orders above 500', () => {
    expect(() => fnbHardwareSettingsSchema.parse({ offline_max_queued_orders: 501 })).toThrow();
  });
});

// ── FNB_SETTINGS_SCHEMAS map ───────────────────────────────────

describe('FNB_SETTINGS_SCHEMAS', () => {
  it('has a schema for every module key', () => {
    for (const key of FNB_SETTINGS_MODULE_KEYS) {
      expect(FNB_SETTINGS_SCHEMAS[key]).toBeDefined();
    }
  });
});

// ── CRUD Schemas ───────────────────────────────────────────────

describe('getFnbSettingsSchema', () => {
  it('accepts valid input', () => {
    const result = getFnbSettingsSchema.parse({
      tenantId: 't-1', moduleKey: 'fnb_general',
    });
    expect(result.moduleKey).toBe('fnb_general');
  });

  it('accepts optional locationId', () => {
    const result = getFnbSettingsSchema.parse({
      tenantId: 't-1', moduleKey: 'fnb_kitchen', locationId: 'loc-1',
    });
    expect(result.locationId).toBe('loc-1');
  });

  it('rejects invalid module key', () => {
    expect(() => getFnbSettingsSchema.parse({
      tenantId: 't-1', moduleKey: 'fnb_invalid',
    })).toThrow();
  });
});

describe('updateFnbSettingsSchema', () => {
  it('accepts valid input', () => {
    const result = updateFnbSettingsSchema.parse({
      moduleKey: 'fnb_general',
      settings: { covers_tracking_enabled: false },
    });
    expect(result.moduleKey).toBe('fnb_general');
    expect(result.settings.covers_tracking_enabled).toBe(false);
  });
});

describe('updateFnbSettingSchema', () => {
  it('accepts valid input', () => {
    const result = updateFnbSettingSchema.parse({
      moduleKey: 'fnb_payment',
      settingKey: 'tip_suggestions',
      value: [18, 20, 22],
    });
    expect(result.settingKey).toBe('tip_suggestions');
  });
});

describe('getFnbSettingSchema', () => {
  it('accepts valid input', () => {
    const result = getFnbSettingSchema.parse({
      tenantId: 't-1', moduleKey: 'fnb_floor', settingKey: 'dirty_table_auto_reset_minutes',
    });
    expect(result.settingKey).toBe('dirty_table_auto_reset_minutes');
  });
});

describe('validateFnbSettingsSchema', () => {
  it('accepts valid input', () => {
    const result = validateFnbSettingsSchema.parse({
      moduleKey: 'fnb_ordering',
      settings: { require_seat_number: true },
    });
    expect(result.moduleKey).toBe('fnb_ordering');
  });
});
