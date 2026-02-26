import type { FnbSettingsModuleKey } from '../validation';
import { getDefaultHostSettings } from '../services/host-settings';

/**
 * Hardcoded default values for every F&B settings module.
 * Used for:
 *  - Seeding new tenants
 *  - Resetting to defaults
 *  - Providing defaults when no DB row exists
 */

export const FNB_GENERAL_DEFAULTS: Record<string, unknown> = {
  business_day_cutoff_time: '03:00',
  default_service_type: 'dine_in',
  rounding_rule: 'none',
  covers_tracking_enabled: true,
  require_table_for_dine_in: true,
  require_customer_for_tab: false,
  auto_print_check_on_close: true,
  currency_code: 'USD',
};

export const FNB_FLOOR_DEFAULTS: Record<string, unknown> = {
  table_turn_time_defaults: { '2-top': 45, '4-top': 60, '6-top': 75, '8-top': 90 },
  dirty_table_auto_reset_minutes: 5,
  auto_assign_server_by_section: true,
  show_elapsed_time_on_tables: true,
  table_status_colors: {
    available: '#4CAF50', seated: '#2196F3', ordered: '#FF9800',
    check_presented: '#9C27B0', paid: '#607D8B', dirty: '#BDBDBD', blocked: '#F44336',
  },
};

export const FNB_ORDERING_DEFAULTS: Record<string, unknown> = {
  default_courses: ['Apps', 'Entrees', 'Desserts'],
  auto_fire_single_course: true,
  require_seat_number: false,
  allow_open_price_items: false,
  comp_reasons: ['Manager Comp', 'Quality Issue', 'Long Wait', 'VIP'],
  void_reasons: ['Wrong Item', 'Quality', 'Customer Changed Mind', 'Duplicate'],
  item_note_presets: ['Extra Sauce', 'On The Side', 'No Onions', 'Gluten Free', 'Split Plate'],
};

export const FNB_KITCHEN_DEFAULTS: Record<string, unknown> = {
  kds_warning_threshold_seconds: 480,
  kds_critical_threshold_seconds: 720,
  kds_bump_behavior: 'remove',
  expo_mode_enabled: true,
  auto_print_on_kds_failure: true,
  delta_chit_enabled: true,
  course_pacing_auto_fire: false,
};

export const FNB_PAYMENT_DEFAULTS: Record<string, unknown> = {
  tip_suggestions: [15, 18, 20, 25],
  tip_suggestion_type: 'percentage',
  tip_adjustment_window_hours: 48,
  auto_gratuity_party_size_threshold: 6,
  auto_gratuity_percentage: 20.0,
  preauth_default_amount_cents: 5000,
  preauth_max_amount_cents: 20000,
  preauth_overage_alert_percentage: 20.0,
  walkout_auto_close_hours: 4,
  walkout_auto_gratuity_percentage: 20.0,
  allow_no_sale_drawer_open: false,
  require_reason_for_void: true,
  require_manager_for_void_after_send: true,
};

export const FNB_TIPS_DEFAULTS: Record<string, unknown> = {
  tip_pool_type: 'none',
  tip_pool_percentage_to_pool: 0,
  tip_pool_distribution_method: 'hours',
  minimum_cash_tip_declaration_percentage: 8.0,
  tip_out_presets: [
    { role: 'busser', percentage: 3 },
    { role: 'bartender', percentage: 5 },
  ],
};

export const FNB_ACCOUNTING_DEFAULTS: Record<string, unknown> = {
  posting_timing: 'batch',
  default_revenue_gl_account: null,
  default_tax_liability_gl_account: null,
  default_tips_payable_gl_account: null,
  default_cash_gl_account: null,
  default_card_clearing_gl_account: null,
  discount_gl_treatment: 'contra_revenue',
  comp_gl_account: null,
  over_short_gl_account: null,
  service_charge_gl_treatment: 'revenue',
};

export const FNB_RECEIPTS_DEFAULTS: Record<string, unknown> = {
  receipt_header_lines: [],
  receipt_footer_lines: [],
  show_item_modifiers_on_receipt: true,
  show_server_name_on_receipt: true,
  show_table_number_on_receipt: true,
  default_receipt_delivery: 'print',
  merchant_copy_auto_print: true,
};

export const FNB_HARDWARE_DEFAULTS: Record<string, unknown> = {
  device_heartbeat_interval_seconds: 30,
  offline_mode_enabled: false,
  offline_max_queued_orders: 50,
  offline_payment_allowed: false,
};

/** Map of module key → defaults */
export const FNB_SETTINGS_DEFAULTS: Record<FnbSettingsModuleKey, Record<string, unknown>> = {
  fnb_general: FNB_GENERAL_DEFAULTS,
  fnb_floor: FNB_FLOOR_DEFAULTS,
  fnb_ordering: FNB_ORDERING_DEFAULTS,
  fnb_kitchen: FNB_KITCHEN_DEFAULTS,
  fnb_payment: FNB_PAYMENT_DEFAULTS,
  fnb_tips: FNB_TIPS_DEFAULTS,
  fnb_accounting: FNB_ACCOUNTING_DEFAULTS,
  fnb_receipts: FNB_RECEIPTS_DEFAULTS,
  fnb_hardware: FNB_HARDWARE_DEFAULTS,
  fnb_host: getDefaultHostSettings() as unknown as Record<string, unknown>,
};

/** Get default value for a specific setting key within a module */
export function getSettingDefault(
  moduleKey: FnbSettingsModuleKey,
  settingKey: string,
): unknown {
  const moduleDefaults = FNB_SETTINGS_DEFAULTS[moduleKey];
  return moduleDefaults?.[settingKey] ?? null;
}

/** Get all known setting keys for a module */
export function getSettingKeys(moduleKey: FnbSettingsModuleKey): string[] {
  return Object.keys(FNB_SETTINGS_DEFAULTS[moduleKey] ?? {});
}
