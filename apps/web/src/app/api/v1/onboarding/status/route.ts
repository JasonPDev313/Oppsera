import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Types ──

interface StepCompletion {
  [phaseKey: string]: { [stepKey: string]: boolean };
}

// ── Handler ──

async function handler(_req: NextRequest, ctx: RequestContext) {
  const tenantId = ctx.tenantId;

  const result = await withTenant(tenantId, async (tx) => {
    // Single query: fetch entitlements + all EXISTS checks in one DB roundtrip.
    // Each EXISTS is a cheap index scan that short-circuits on first match.
    // This replaces 25+ sequential queries with 1 combined query.
    const rows = await tx.execute(sql`
      WITH ent AS (
        SELECT COALESCE(array_agg(module_key), ARRAY[]::text[]) AS modules
        FROM entitlements
        WHERE tenant_id = ${tenantId} AND access_mode != 'off'
      )
      SELECT
        (SELECT modules FROM ent) AS enabled_modules,

        EXISTS(SELECT 1 FROM locations WHERE tenant_id = ${tenantId}) AS org_locations,
        EXISTS(SELECT 1 FROM terminal_locations WHERE tenant_id = ${tenantId}) AS org_profit_centers,
        EXISTS(SELECT 1 FROM terminals WHERE tenant_id = ${tenantId}) AS org_terminals,

        EXISTS(SELECT 1 FROM users WHERE tenant_id = ${tenantId}) AS usr_invite_users,
        EXISTS(SELECT 1 FROM roles WHERE tenant_id = ${tenantId}) AS usr_custom_roles,

        EXISTS(SELECT 1 FROM catalog_categories WHERE tenant_id = ${tenantId}) AS cat_hierarchy,
        EXISTS(SELECT 1 FROM tax_rates WHERE tenant_id = ${tenantId}) AS cat_tax_config,
        EXISTS(SELECT 1 FROM catalog_items WHERE tenant_id = ${tenantId}) AS cat_items,
        EXISTS(SELECT 1 FROM catalog_modifier_groups WHERE tenant_id = ${tenantId}) AS cat_modifiers,
        EXISTS(SELECT 1 FROM catalog_items WHERE tenant_id = ${tenantId} AND item_type = 'package') AS cat_packages,

        EXISTS(SELECT 1 FROM vendors WHERE tenant_id = ${tenantId}) AS inv_vendors,
        EXISTS(SELECT 1 FROM receiving_receipts WHERE tenant_id = ${tenantId}) AS inv_opening_balances,

        EXISTS(SELECT 1 FROM customers WHERE tenant_id = ${tenantId}) AS cust_customer_records,
        EXISTS(SELECT 1 FROM membership_plans WHERE tenant_id = ${tenantId}) AS cust_membership_plans,
        EXISTS(SELECT 1 FROM billing_accounts WHERE tenant_id = ${tenantId}) AS cust_billing_accounts,

        EXISTS(SELECT 1 FROM import_jobs WHERE tenant_id = ${tenantId} AND status = 'completed') AS di_first_import,

        EXISTS(SELECT 1 FROM bank_accounts WHERE tenant_id = ${tenantId}) AS acct_bank_accounts,
        EXISTS(SELECT 1 FROM sub_department_gl_defaults WHERE tenant_id = ${tenantId}) AS acct_mappings,

        (SELECT row_to_json(s) FROM (
          SELECT default_ap_control_account_id, default_ar_control_account_id,
                 default_retained_earnings_account_id, auto_post_mode
          FROM accounting_settings WHERE tenant_id = ${tenantId}
        ) s) AS acct_settings,

        EXISTS(SELECT 1 FROM floor_plan_rooms WHERE tenant_id = ${tenantId}) AS fnb_floor_plans,
        EXISTS(SELECT 1 FROM fnb_tables WHERE tenant_id = ${tenantId}) AS fnb_sync_tables,
        EXISTS(SELECT 1 FROM fnb_kitchen_stations WHERE tenant_id = ${tenantId}) AS fnb_kds_stations,

        EXISTS(SELECT 1 FROM report_definitions WHERE tenant_id = ${tenantId}) AS rpt_custom_reports,
        EXISTS(SELECT 1 FROM semantic_lenses WHERE tenant_id = ${tenantId}) AS rpt_ai_lenses,

        EXISTS(SELECT 1 FROM payment_providers WHERE tenant_id = ${tenantId}) AS ms_add_provider,
        EXISTS(SELECT 1 FROM payment_merchant_accounts WHERE tenant_id = ${tenantId}) AS ms_create_mid,
        EXISTS(SELECT 1 FROM terminal_merchant_assignments WHERE tenant_id = ${tenantId}) AS ms_assign_terminals,
        EXISTS(SELECT 1 FROM terminal_device_assignments WHERE tenant_id = ${tenantId}) AS ms_assign_devices,

        EXISTS(SELECT 1 FROM orders WHERE tenant_id = ${tenantId}) AS gl_test_order
    `);

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    if (!row) return buildEmptyCompletion();

    const enabledModules = new Set<string>(
      Array.isArray(row.enabled_modules) ? (row.enabled_modules as string[]) : [],
    );

    const has = (mod: string) => enabledModules.has(mod);

    const c: StepCompletion = {
      organization: {
        locations: !!row.org_locations,
        profit_centers: !!row.org_profit_centers,
        terminals: !!row.org_terminals,
        terminal_settings: false,
      },
      users: {
        invite_users: !!row.usr_invite_users,
        import_staff: false,
        custom_roles: !!row.usr_custom_roles,
        location_assignments: false,
      },
      catalog: {
        hierarchy: has('catalog') && !!row.cat_hierarchy,
        tax_config: has('catalog') && !!row.cat_tax_config,
        items: has('catalog') && !!row.cat_items,
        import_items: has('catalog') && !!row.cat_items,
        modifiers: has('catalog') && !!row.cat_modifiers,
        packages: has('catalog') && !!row.cat_packages,
      },
      inventory: {
        vendors: has('inventory') && !!row.inv_vendors,
        uom: false,
        costing: false,
        reorder_levels: false,
        opening_balances: has('inventory') && !!row.inv_opening_balances,
      },
      customers: {
        customer_records: has('customers') && !!row.cust_customer_records,
        membership_plans: has('customers') && !!row.cust_membership_plans,
        billing_accounts: has('customers') && !!row.cust_billing_accounts,
      },
      data_import: {
        import_overview: true,
        first_import_complete: !!row.di_first_import,
      },
      accounting: {
        bootstrap: false,
        import_coa: false,
        control_accounts: false,
        mappings: false,
        bank_accounts: false,
        pos_posting: false,
      },
      pos_config: {
        pos_terminal_prefs: false,
        quick_menu: false,
        drawer_defaults: false,
        tip_config: false,
      },
      fnb: {
        floor_plans: has('pos_fnb') && !!row.fnb_floor_plans,
        sync_tables: has('pos_fnb') && !!row.fnb_sync_tables,
        kds_stations: has('pos_fnb') && !!row.fnb_kds_stations,
        menu_periods: false,
        allergens: false,
        tip_pools: false,
      },
      reporting: {
        dashboard_widgets: false,
        custom_reports: has('reporting') && !!row.rpt_custom_reports,
        ai_lenses: has('semantic') && !!row.rpt_ai_lenses,
      },
      merchant_services: {
        add_provider: has('payments') && !!row.ms_add_provider,
        create_mid: has('payments') && !!row.ms_create_mid,
        assign_terminals: has('payments') && !!row.ms_assign_terminals,
        assign_devices: has('payments') && !!row.ms_assign_devices,
        test_transaction: false,
      },
      go_live: {
        all_phases_complete: false,
        test_order: !!row.gl_test_order,
        verify_gl: false,
        final_review: false,
      },
    };

    // Apply accounting settings
    if (has('accounting') && row.acct_settings) {
      const as_ = row.acct_settings as Record<string, unknown>;
      c.accounting!.bootstrap = true;
      c.accounting!.bank_accounts = !!row.acct_bank_accounts;
      c.accounting!.mappings = !!row.acct_mappings;
      c.accounting!.control_accounts = !!(
        as_.default_ap_control_account_id &&
        as_.default_ar_control_account_id &&
        as_.default_retained_earnings_account_id
      );
      c.accounting!.pos_posting = as_.auto_post_mode === 'auto_post';
    }

    return c;
  });

  return NextResponse.json({ data: result });
}

function buildEmptyCompletion(): StepCompletion {
  return {
    organization: { locations: false, profit_centers: false, terminals: false, terminal_settings: false },
    users: { invite_users: false, import_staff: false, custom_roles: false, location_assignments: false },
    catalog: { hierarchy: false, tax_config: false, items: false, import_items: false, modifiers: false, packages: false },
    inventory: { vendors: false, uom: false, costing: false, reorder_levels: false, opening_balances: false },
    customers: { customer_records: false, membership_plans: false, billing_accounts: false },
    data_import: { import_overview: true, first_import_complete: false },
    accounting: { bootstrap: false, import_coa: false, control_accounts: false, mappings: false, bank_accounts: false, pos_posting: false },
    pos_config: { pos_terminal_prefs: false, quick_menu: false, drawer_defaults: false, tip_config: false },
    fnb: { floor_plans: false, sync_tables: false, kds_stations: false, menu_periods: false, allergens: false, tip_pools: false },
    reporting: { dashboard_widgets: false, custom_reports: false, ai_lenses: false },
    merchant_services: { add_provider: false, create_mid: false, assign_terminals: false, assign_devices: false, test_transaction: false },
    go_live: { all_phases_complete: false, test_order: false, verify_gl: false, final_review: false },
  };
}

export const GET = withMiddleware(handler, { authenticated: true });
