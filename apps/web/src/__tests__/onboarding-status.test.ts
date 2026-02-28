import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Hoisted mocks ─────────────────────────────────────────────────

const {
  mockWithMiddleware,
  mockWithTenant,
  mockExecute,
} = vi.hoisted(() => {
  const mockExecute = vi.fn();

  const mockWithMiddleware = vi.fn(
    (handler: (...args: any[]) => any, _options: unknown) => {
      return async (request: any) => {
        const ctx = {
          user: { id: 'user_001' },
          tenantId: 'tenant_001',
          locationId: undefined as string | undefined,
          requestId: 'req_001',
          isPlatformAdmin: false,
          params: {} as Record<string, string>,
        };
        return handler(request, ctx);
      };
    },
  );

  // withTenant calls the callback with a fake tx object that uses mockExecute
  const mockWithTenant = vi.fn(
    async (_tenantId: string, cb: (tx: any) => Promise<any>) => {
      const tx = { execute: mockExecute };
      return cb(tx);
    },
  );

  return {
    mockWithMiddleware,
    mockWithTenant,
    mockExecute,
  };
});

// ── Module mocks ──────────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/core/auth/context', () => ({}));

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
}));

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    // Return the raw SQL string for inspection in tests
    const result = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '');
    return result;
  },
}));

// ── Helpers ───────────────────────────────────────────────────────

function makeRequest(url = 'http://localhost:3000/api/v1/onboarding/status') {
  return new Request(url) as unknown as NextRequest;
}

/**
 * Build a single combined row that the single-query route expects.
 * The route does one `tx.execute(sql`...`)` returning one row with all columns.
 */
function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return [{
    enabled_modules: [],
    org_locations: false,
    org_profit_centers: false,
    org_terminals: false,
    usr_invite_users: false,
    usr_custom_roles: false,
    cat_hierarchy: false,
    cat_tax_config: false,
    cat_items: false,
    cat_modifiers: false,
    cat_packages: false,
    inv_vendors: false,
    inv_opening_balances: false,
    cust_customer_records: false,
    cust_membership_plans: false,
    cust_billing_accounts: false,
    di_first_import: false,
    acct_bank_accounts: false,
    acct_mappings: false,
    acct_settings: null,
    fnb_floor_plans: false,
    fnb_sync_tables: false,
    fnb_kds_stations: false,
    rpt_custom_reports: false,
    rpt_ai_lenses: false,
    ms_add_provider: false,
    ms_create_mid: false,
    ms_assign_terminals: false,
    ms_assign_devices: false,
    gl_test_order: false,
    ...overrides,
  }];
}

// ── Tests ─────────────────────────────────────────────────────────

describe('GET /api/v1/onboarding/status', () => {
  beforeEach(() => {
    // mockReset clears mockReturnValueOnce queues (gotcha #58 — clearAllMocks does NOT)
    mockExecute.mockReset();
    // Clear call history but keep implementation (withTenant needs its callback-calling impl)
    mockWithTenant.mockClear();
    // Don't touch mockWithMiddleware — it's called once at module import time (cached)
  });

  it('returns status 200 with completion data', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      org_locations: true,
      usr_invite_users: true,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toBeDefined();

    // Organization
    expect(body.data.organization.locations).toBe(true);
    expect(body.data.organization.profit_centers).toBe(false);
    expect(body.data.organization.terminals).toBe(false);

    // Users
    expect(body.data.users.invite_users).toBe(true);
    expect(body.data.users.custom_roles).toBe(false);

    // Data Import defaults
    expect(body.data.data_import.import_overview).toBe(true); // always true by default
    expect(body.data.data_import.first_import_complete).toBe(false);

    // Go Live
    expect(body.data.go_live.test_order).toBe(false);
  });

  it('exports GET handler wired through withMiddleware with authenticated: true', async () => {
    // withMiddleware is called at module evaluation time (first import only — cached after)
    const mod = await import('../app/api/v1/onboarding/status/route');
    expect(mod.GET).toBeDefined();
    expect(typeof mod.GET).toBe('function');

    // Verify withMiddleware was called during module evaluation (call persists across tests
    // because we intentionally don't clear mockWithMiddleware in beforeEach)
    expect(mockWithMiddleware).toHaveBeenCalledWith(
      expect.any(Function),
      { authenticated: true },
    );
  });

  it('calls withTenant with the correct tenant ID', async () => {
    mockExecute.mockResolvedValueOnce(buildRow());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    await GET(makeRequest());

    expect(mockWithTenant).toHaveBeenCalledWith('tenant_001', expect.any(Function));
  });

  it('includes catalog checks when catalog module is enabled', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['catalog'],
      cat_hierarchy: true,
      cat_tax_config: true,
      cat_items: true,
      cat_modifiers: false,
      cat_packages: false,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.catalog.hierarchy).toBe(true);
    expect(body.data.catalog.tax_config).toBe(true);
    expect(body.data.catalog.items).toBe(true);
    expect(body.data.catalog.modifiers).toBe(false);
    expect(body.data.catalog.packages).toBe(false);
    // import_items mirrors items
    expect(body.data.catalog.import_items).toBe(true);
  });

  it('includes inventory checks when inventory module is enabled', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['inventory'],
      inv_vendors: true,
      inv_opening_balances: false,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.inventory.vendors).toBe(true);
    expect(body.data.inventory.opening_balances).toBe(false);
  });

  it('includes customer checks when customers module is enabled', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['customers'],
      cust_customer_records: true,
      cust_membership_plans: false,
      cust_billing_accounts: true,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.customers.customer_records).toBe(true);
    expect(body.data.customers.membership_plans).toBe(false);
    expect(body.data.customers.billing_accounts).toBe(true);
  });

  it('includes accounting checks and settings when accounting module is enabled', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['accounting'],
      acct_bank_accounts: true,
      acct_mappings: true,
      acct_settings: {
        default_ap_control_account_id: 'acct_ap',
        default_ar_control_account_id: 'acct_ar',
        default_retained_earnings_account_id: 'acct_re',
        auto_post_mode: 'auto_post',
      },
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.accounting.bank_accounts).toBe(true);
    expect(body.data.accounting.mappings).toBe(true);
    expect(body.data.accounting.bootstrap).toBe(true);
    expect(body.data.accounting.control_accounts).toBe(true);
    expect(body.data.accounting.pos_posting).toBe(true);
  });

  it('sets accounting.control_accounts to false when any control account is missing', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['accounting'],
      acct_settings: {
        default_ap_control_account_id: 'acct_ap',
        default_ar_control_account_id: null, // missing
        default_retained_earnings_account_id: 'acct_re',
        auto_post_mode: 'manual',
      },
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.accounting.bootstrap).toBe(true);
    expect(body.data.accounting.control_accounts).toBe(false);
    expect(body.data.accounting.pos_posting).toBe(false);
  });

  it('includes F&B checks when pos_fnb module is enabled', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['pos_fnb'],
      fnb_floor_plans: true,
      fnb_sync_tables: true,
      fnb_kds_stations: false,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.fnb.floor_plans).toBe(true);
    expect(body.data.fnb.sync_tables).toBe(true);
    expect(body.data.fnb.kds_stations).toBe(false);
  });

  it('includes reporting checks when reporting/semantic modules are enabled', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['reporting', 'semantic'],
      rpt_custom_reports: true,
      rpt_ai_lenses: false,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.reporting.custom_reports).toBe(true);
    expect(body.data.reporting.ai_lenses).toBe(false);
  });

  it('includes merchant services checks when payments module is enabled', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['payments'],
      ms_add_provider: true,
      ms_create_mid: true,
      ms_assign_terminals: false,
      ms_assign_devices: false,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.merchant_services.add_provider).toBe(true);
    expect(body.data.merchant_services.create_mid).toBe(true);
    expect(body.data.merchant_services.assign_terminals).toBe(false);
    expect(body.data.merchant_services.assign_devices).toBe(false);
  });

  it('skips module-gated checks when modules are not enabled', async () => {
    // No modules enabled at all
    mockExecute.mockResolvedValueOnce(buildRow());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // Module-gated phases should still have default false values
    expect(body.data.catalog.hierarchy).toBe(false);
    expect(body.data.catalog.items).toBe(false);
    expect(body.data.inventory.vendors).toBe(false);
    expect(body.data.customers.customer_records).toBe(false);
    expect(body.data.accounting.bootstrap).toBe(false);
    expect(body.data.fnb.floor_plans).toBe(false);
    expect(body.data.reporting.custom_reports).toBe(false);
    expect(body.data.merchant_services.add_provider).toBe(false);

    // Single combined query — only 1 execute call
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('returns all default phases even when no checks run', async () => {
    mockExecute.mockResolvedValueOnce(buildRow());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // All 12 phase keys present
    const expectedPhases = [
      'organization', 'users', 'catalog', 'inventory', 'customers',
      'data_import', 'accounting', 'pos_config', 'fnb', 'reporting',
      'merchant_services', 'go_live',
    ];
    for (const phase of expectedPhases) {
      expect(body.data[phase]).toBeDefined();
    }
  });

  it('sets data_import.import_overview to true by default', async () => {
    mockExecute.mockResolvedValueOnce(buildRow());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.data_import.import_overview).toBe(true);
  });

  it('handles query returning empty result gracefully', async () => {
    // Return empty array — no rows from the combined query
    mockExecute.mockResolvedValueOnce([]);

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // Should still succeed with empty completion (buildEmptyCompletion)
    expect(response.status).toBe(200);
    expect(body.data.organization.locations).toBe(false);
    expect(body.data.catalog.hierarchy).toBe(false);
  });

  it('handles individual EXISTS check failure gracefully via empty result', async () => {
    // The combined query returns a single row — if the query itself fails,
    // withTenant will throw and middleware returns 500.
    // But within the row, false values represent non-existence.
    mockExecute.mockResolvedValueOnce(buildRow({
      org_locations: false,
      org_profit_centers: true,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.organization.locations).toBe(false);
    expect(body.data.organization.profit_centers).toBe(true);
  });

  it('handles all modules enabled with full data', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: [
        'catalog', 'inventory', 'customers', 'accounting',
        'pos_fnb', 'reporting', 'semantic', 'payments',
      ],
      org_locations: true,
      org_profit_centers: true,
      org_terminals: true,
      usr_invite_users: true,
      usr_custom_roles: true,
      cat_hierarchy: true,
      cat_tax_config: true,
      cat_items: true,
      cat_modifiers: true,
      cat_packages: true,
      inv_vendors: true,
      inv_opening_balances: true,
      cust_customer_records: true,
      cust_membership_plans: true,
      cust_billing_accounts: true,
      di_first_import: true,
      acct_bank_accounts: true,
      acct_mappings: true,
      acct_settings: {
        default_ap_control_account_id: 'acct_ap',
        default_ar_control_account_id: 'acct_ar',
        default_retained_earnings_account_id: 'acct_re',
        auto_post_mode: 'auto_post',
      },
      fnb_floor_plans: true,
      fnb_sync_tables: true,
      fnb_kds_stations: true,
      rpt_custom_reports: true,
      rpt_ai_lenses: true,
      ms_add_provider: true,
      ms_create_mid: true,
      ms_assign_terminals: true,
      ms_assign_devices: true,
      gl_test_order: true,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);

    // All auto-detected steps should be true
    expect(body.data.organization.locations).toBe(true);
    expect(body.data.catalog.items).toBe(true);
    expect(body.data.catalog.import_items).toBe(true); // mirrors items
    expect(body.data.inventory.vendors).toBe(true);
    expect(body.data.customers.customer_records).toBe(true);
    expect(body.data.data_import.first_import_complete).toBe(true);
    expect(body.data.accounting.bootstrap).toBe(true);
    expect(body.data.accounting.control_accounts).toBe(true);
    expect(body.data.accounting.pos_posting).toBe(true);
    expect(body.data.fnb.floor_plans).toBe(true);
    expect(body.data.reporting.custom_reports).toBe(true);
    expect(body.data.reporting.ai_lenses).toBe(true);
    expect(body.data.merchant_services.add_provider).toBe(true);
    expect(body.data.go_live.test_order).toBe(true);
  });

  it('handles accounting settings being null (no settings row)', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['accounting'],
      acct_settings: null, // no settings row
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // No settings row → no bootstrap → all false
    expect(body.data.accounting.bootstrap).toBe(false);
    expect(body.data.accounting.control_accounts).toBe(false);
    expect(body.data.accounting.pos_posting).toBe(false);
  });

  it('includes all default step keys in every phase', async () => {
    mockExecute.mockResolvedValueOnce(buildRow());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // Verify each phase has all expected step keys
    const expectedSteps: Record<string, string[]> = {
      organization: ['locations', 'profit_centers', 'terminals', 'terminal_settings'],
      users: ['invite_users', 'import_staff', 'custom_roles', 'location_assignments'],
      catalog: ['hierarchy', 'tax_config', 'items', 'import_items', 'modifiers', 'packages'],
      inventory: ['vendors', 'uom', 'costing', 'reorder_levels', 'opening_balances'],
      customers: ['customer_records', 'membership_plans', 'billing_accounts'],
      data_import: ['import_overview', 'first_import_complete'],
      accounting: ['bootstrap', 'import_coa', 'control_accounts', 'mappings', 'bank_accounts', 'pos_posting'],
      pos_config: ['pos_terminal_prefs', 'quick_menu', 'drawer_defaults', 'tip_config'],
      fnb: ['floor_plans', 'sync_tables', 'kds_stations', 'menu_periods', 'allergens', 'tip_pools'],
      reporting: ['dashboard_widgets', 'custom_reports', 'ai_lenses'],
      merchant_services: ['add_provider', 'create_mid', 'assign_terminals', 'assign_devices', 'test_transaction'],
      go_live: ['all_phases_complete', 'test_order', 'verify_gl', 'final_review'],
    };

    for (const [phase, steps] of Object.entries(expectedSteps)) {
      for (const step of steps) {
        expect(body.data[phase]).toHaveProperty(step);
      }
    }
  });

  it('import_items mirrors items completion status', async () => {
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: ['catalog'],
      cat_items: false,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // items = false → import_items = false
    expect(body.data.catalog.items).toBe(false);
    expect(body.data.catalog.import_items).toBe(false);
  });

  it('uses single combined query for all checks', async () => {
    mockExecute.mockResolvedValueOnce(buildRow());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    await GET(makeRequest());

    // Route now uses a single combined SQL query instead of sequential calls
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('catalog checks are false when catalog module not enabled even if data exists', async () => {
    // Data exists in DB but module is not enabled
    mockExecute.mockResolvedValueOnce(buildRow({
      enabled_modules: [], // catalog NOT enabled
      cat_hierarchy: true,
      cat_items: true,
    }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // Module gating: even though DB has data, module is off → false
    expect(body.data.catalog.hierarchy).toBe(false);
    expect(body.data.catalog.items).toBe(false);
  });
});
