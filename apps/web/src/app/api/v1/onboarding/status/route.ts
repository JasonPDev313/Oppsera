import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Helper: safe EXISTS check (returns false if table missing) ──

async function exists(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  query: ReturnType<typeof sql>,
): Promise<boolean> {
  try {
    const rows = await tx.execute(query);
    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    return arr[0]?.v === true;
  } catch {
    return false;
  }
}

// ── Types ──

interface StepCompletion {
  [phaseKey: string]: { [stepKey: string]: boolean };
}

// ── Handler ──

async function handler(_req: NextRequest, ctx: RequestContext) {
  const tenantId = ctx.tenantId;

  const result = await withTenant(tenantId, async (tx) => {
    // 1. Determine which modules are enabled
    let enabledModules: Set<string>;
    try {
      const entRows = await tx.execute(
        sql`SELECT module_key FROM entitlements WHERE tenant_id = ${tenantId} AND access_mode != 'off'`,
      );
      enabledModules = new Set(
        Array.from(entRows as Iterable<{ module_key: string }>).map((r) => r.module_key),
      );
    } catch {
      enabledModules = new Set();
    }

    // 2. Build all boolean checks in parallel
    //    Even though they share one DB connection (serialized), EXISTS queries
    //    are <2ms each with index support — ~25 queries finishes in <50ms.
    const checks: Promise<[string, string, boolean]>[] = [];

    // ── Organization ──
    checks.push(
      exists(tx, sql`SELECT EXISTS(SELECT 1 FROM locations WHERE tenant_id = ${tenantId}) AS v`).then(
        (v) => ['organization', 'locations', v],
      ),
    );
    checks.push(
      exists(
        tx,
        sql`SELECT EXISTS(SELECT 1 FROM terminal_locations WHERE tenant_id = ${tenantId}) AS v`,
      ).then((v) => ['organization', 'profit_centers', v]),
    );
    checks.push(
      exists(tx, sql`SELECT EXISTS(SELECT 1 FROM terminals WHERE tenant_id = ${tenantId}) AS v`).then(
        (v) => ['organization', 'terminals', v],
      ),
    );

    // ── Users ──
    checks.push(
      exists(tx, sql`SELECT EXISTS(SELECT 1 FROM users WHERE tenant_id = ${tenantId}) AS v`).then(
        (v) => ['users', 'invite_users', v],
      ),
    );
    checks.push(
      exists(tx, sql`SELECT EXISTS(SELECT 1 FROM roles WHERE tenant_id = ${tenantId}) AS v`).then(
        (v) => ['users', 'custom_roles', v],
      ),
    );

    // ── Catalog ──
    if (enabledModules.has('catalog')) {
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM catalog_categories WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['catalog', 'hierarchy', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM tax_rates WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['catalog', 'tax_config', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM catalog_items WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['catalog', 'items', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM catalog_modifier_groups WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['catalog', 'modifiers', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM catalog_items WHERE tenant_id = ${tenantId} AND item_type = 'package') AS v`,
        ).then((v) => ['catalog', 'packages', v]),
      );
    }

    // ── Inventory ──
    if (enabledModules.has('inventory')) {
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM vendors WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['inventory', 'vendors', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM receiving_receipts WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['inventory', 'opening_balances', v]),
      );
    }

    // ── Customers ──
    if (enabledModules.has('customers')) {
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM customers WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['customers', 'customer_records', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM membership_plans WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['customers', 'membership_plans', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM billing_accounts WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['customers', 'billing_accounts', v]),
      );
    }

    // ── Data Import ──
    checks.push(
      exists(
        tx,
        sql`SELECT EXISTS(SELECT 1 FROM import_jobs WHERE tenant_id = ${tenantId} AND status = 'completed') AS v`,
      ).then((v) => ['data_import', 'first_import_complete', v]),
    );

    // ── Accounting ──
    if (enabledModules.has('accounting')) {
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM bank_accounts WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['accounting', 'bank_accounts', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM sub_department_gl_defaults WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['accounting', 'mappings', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM gl_coa_import_logs WHERE tenant_id = ${tenantId} AND status = 'complete') AS v`,
        ).then((v) => ['accounting', 'import_coa', v]),
      );
    }

    // ── F&B ──
    if (enabledModules.has('pos_fnb')) {
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM floor_plan_rooms WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['fnb', 'floor_plans', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM fnb_tables WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['fnb', 'sync_tables', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM fnb_kitchen_stations WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['fnb', 'kds_stations', v]),
      );
    }

    // ── Reporting ──
    if (enabledModules.has('reporting')) {
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM report_definitions WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['reporting', 'custom_reports', v]),
      );
    }
    if (enabledModules.has('semantic')) {
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM semantic_lenses WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['reporting', 'ai_lenses', v]),
      );
    }

    // ── Merchant Services ──
    if (enabledModules.has('payments')) {
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM payment_providers WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['merchant_services', 'add_provider', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM payment_merchant_accounts WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['merchant_services', 'create_mid', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM terminal_merchant_assignments WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['merchant_services', 'assign_terminals', v]),
      );
      checks.push(
        exists(
          tx,
          sql`SELECT EXISTS(SELECT 1 FROM terminal_device_assignments WHERE tenant_id = ${tenantId}) AS v`,
        ).then((v) => ['merchant_services', 'assign_devices', v]),
      );
    }

    // ── Go Live ──
    checks.push(
      exists(tx, sql`SELECT EXISTS(SELECT 1 FROM orders WHERE tenant_id = ${tenantId}) AS v`).then(
        (v) => ['go_live', 'test_order', v],
      ),
    );

    // 3. Await all checks + fetch accounting settings in parallel
    const [checkResults, acctSettings] = await Promise.all([
      Promise.all(checks),
      enabledModules.has('accounting')
        ? tx
            .execute(
              sql`SELECT
                default_ap_control_account_id,
                default_ar_control_account_id,
                default_retained_earnings_account_id,
                auto_post_mode
              FROM accounting_settings
              WHERE tenant_id = ${tenantId}`,
            )
            .then((r) => Array.from(r as Iterable<Record<string, unknown>>)[0] ?? null)
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    // 4. Build the completion map from static defaults
    const c: StepCompletion = {
      organization: {
        locations: false,
        profit_centers: false,
        terminals: false,
        terminal_settings: false,
      },
      users: {
        invite_users: false,
        import_staff: false,
        custom_roles: false,
        location_assignments: false,
      },
      catalog: {
        hierarchy: false,
        tax_config: false,
        items: false,
        import_items: false,
        modifiers: false,
        packages: false,
      },
      inventory: {
        vendors: false,
        uom: false,
        costing: false,
        reorder_levels: false,
        opening_balances: false,
      },
      customers: {
        customer_records: false,
        membership_plans: false,
        billing_accounts: false,
      },
      data_import: { import_overview: true, first_import_complete: false },
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
        floor_plans: false,
        sync_tables: false,
        kds_stations: false,
        menu_periods: false,
        allergens: false,
        tip_pools: false,
      },
      reporting: {
        dashboard_widgets: false,
        custom_reports: false,
        ai_lenses: false,
      },
      merchant_services: {
        add_provider: false,
        create_mid: false,
        assign_terminals: false,
        assign_devices: false,
        test_transaction: false,
      },
      go_live: {
        all_phases_complete: false,
        test_order: false,
        verify_gl: false,
        final_review: false,
      },
    };

    // 5. Apply check results
    for (const [phase, step, value] of checkResults) {
      if (c[phase]) c[phase]![step] = value;
    }

    // catalog.import_items shares detection with items
    if (c.catalog) c.catalog.import_items = c.catalog.items ?? false;

    // 6. Apply accounting settings
    if (acctSettings) {
      c.accounting!.bootstrap = true;
      c.accounting!.control_accounts = !!(
        acctSettings.default_ap_control_account_id &&
        acctSettings.default_ar_control_account_id &&
        acctSettings.default_retained_earnings_account_id
      );
      c.accounting!.pos_posting = acctSettings.auto_post_mode === 'auto_post';
    }

    return c;
  });

  return NextResponse.json({ data: result });
}

export const GET = withMiddleware(handler, { authenticated: true });
