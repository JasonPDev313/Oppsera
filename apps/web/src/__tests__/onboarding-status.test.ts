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

/** Build a response from mockExecute for an EXISTS check */
function existsTrue() {
  return [{ v: true }];
}
function existsFalse() {
  return [{ v: false }];
}

/** Build entitlements rows */
function entitlementRows(...moduleKeys: string[]) {
  return moduleKeys.map((mk) => ({ module_key: mk }));
}

/** Build accounting settings row */
function acctSettings(opts: {
  ap?: string | null;
  ar?: string | null;
  retained?: string | null;
  autoPost?: string;
} = {}) {
  return [{
    default_ap_control_account_id: opts.ap ?? null,
    default_ar_control_account_id: opts.ar ?? null,
    default_retained_earnings_account_id: opts.retained ?? null,
    auto_post_mode: opts.autoPost ?? 'manual',
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
    // No modules enabled — only always-visible checks run
    mockExecute
      // 1. entitlements query
      .mockResolvedValueOnce([]) // no modules enabled
      // Organization checks (3)
      .mockResolvedValueOnce(existsTrue())   // locations
      .mockResolvedValueOnce(existsFalse())  // profit_centers
      .mockResolvedValueOnce(existsFalse())  // terminals
      // Users checks (2)
      .mockResolvedValueOnce(existsTrue())   // invite_users
      .mockResolvedValueOnce(existsFalse())  // custom_roles
      // Data Import check (1)
      .mockResolvedValueOnce(existsFalse())  // first_import_complete
      // Go Live check (1)
      .mockResolvedValueOnce(existsFalse()); // test_order

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
    mockExecute
      .mockResolvedValueOnce([]) // entitlements
      .mockResolvedValue(existsFalse()); // all checks

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    await GET(makeRequest());

    expect(mockWithTenant).toHaveBeenCalledWith('tenant_001', expect.any(Function));
  });

  it('includes catalog checks when catalog module is enabled', async () => {
    mockExecute
      // entitlements
      .mockResolvedValueOnce(entitlementRows('catalog'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Catalog checks (5)
      .mockResolvedValueOnce(existsTrue())   // hierarchy
      .mockResolvedValueOnce(existsTrue())   // tax_config
      .mockResolvedValueOnce(existsTrue())   // items
      .mockResolvedValueOnce(existsFalse())  // modifiers
      .mockResolvedValueOnce(existsFalse())  // packages
      // Data Import (1)
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

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
    mockExecute
      .mockResolvedValueOnce(entitlementRows('inventory'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Inventory checks (2)
      .mockResolvedValueOnce(existsTrue())   // vendors
      .mockResolvedValueOnce(existsFalse())  // opening_balances
      // Data Import (1)
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.inventory.vendors).toBe(true);
    expect(body.data.inventory.opening_balances).toBe(false);
  });

  it('includes customer checks when customers module is enabled', async () => {
    mockExecute
      .mockResolvedValueOnce(entitlementRows('customers'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Customers checks (3)
      .mockResolvedValueOnce(existsTrue())   // customer_records
      .mockResolvedValueOnce(existsFalse())  // membership_plans
      .mockResolvedValueOnce(existsTrue())   // billing_accounts
      // Data Import (1)
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.customers.customer_records).toBe(true);
    expect(body.data.customers.membership_plans).toBe(false);
    expect(body.data.customers.billing_accounts).toBe(true);
  });

  it('includes accounting checks and settings when accounting module is enabled', async () => {
    // Push order: org(3) → users(2) → data_import(1) → accounting(3) → go_live(1) + acctSettings
    mockExecute
      .mockResolvedValueOnce(entitlementRows('accounting'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1) — pushed BEFORE module-specific checks
      .mockResolvedValueOnce(existsFalse())
      // Accounting checks (3)
      .mockResolvedValueOnce(existsTrue())   // bank_accounts
      .mockResolvedValueOnce(existsTrue())   // mappings
      .mockResolvedValueOnce(existsFalse())  // import_coa
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse())
      // Accounting settings (fetched in parallel with checks)
      .mockResolvedValueOnce(acctSettings({
        ap: 'acct_ap',
        ar: 'acct_ar',
        retained: 'acct_re',
        autoPost: 'auto_post',
      }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.accounting.bank_accounts).toBe(true);
    expect(body.data.accounting.mappings).toBe(true);
    expect(body.data.accounting.import_coa).toBe(false);
    expect(body.data.accounting.bootstrap).toBe(true);
    expect(body.data.accounting.control_accounts).toBe(true);
    expect(body.data.accounting.pos_posting).toBe(true);
  });

  it('sets accounting.control_accounts to false when any control account is missing', async () => {
    // Push order: org(3) → users(2) → data_import(1) → accounting(3) → go_live(1) + acctSettings
    mockExecute
      .mockResolvedValueOnce(entitlementRows('accounting'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1) — pushed BEFORE module-specific checks
      .mockResolvedValueOnce(existsFalse())
      // Accounting checks (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse())
      // Accounting settings — missing AR control
      .mockResolvedValueOnce(acctSettings({
        ap: 'acct_ap',
        ar: null, // missing
        retained: 'acct_re',
        autoPost: 'manual',
      }));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.accounting.bootstrap).toBe(true);
    expect(body.data.accounting.control_accounts).toBe(false);
    expect(body.data.accounting.pos_posting).toBe(false);
  });

  it('includes F&B checks when pos_fnb module is enabled', async () => {
    // Push order: org(3) → users(2) → data_import(1) → fnb(3) → go_live(1)
    mockExecute
      .mockResolvedValueOnce(entitlementRows('pos_fnb'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1) — pushed BEFORE module-specific checks
      .mockResolvedValueOnce(existsFalse())
      // F&B checks (3)
      .mockResolvedValueOnce(existsTrue())   // floor_plans
      .mockResolvedValueOnce(existsTrue())   // sync_tables
      .mockResolvedValueOnce(existsFalse())  // kds_stations
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.fnb.floor_plans).toBe(true);
    expect(body.data.fnb.sync_tables).toBe(true);
    expect(body.data.fnb.kds_stations).toBe(false);
  });

  it('includes reporting checks when reporting/semantic modules are enabled', async () => {
    // Push order: org(3) → users(2) → data_import(1) → reporting(1) → semantic(1) → go_live(1)
    mockExecute
      .mockResolvedValueOnce(entitlementRows('reporting', 'semantic'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1) — pushed BEFORE module-specific checks
      .mockResolvedValueOnce(existsFalse())
      // Reporting checks (1 for 'reporting', 1 for 'semantic')
      .mockResolvedValueOnce(existsTrue())   // custom_reports
      .mockResolvedValueOnce(existsFalse())  // ai_lenses
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.reporting.custom_reports).toBe(true);
    expect(body.data.reporting.ai_lenses).toBe(false);
  });

  it('includes merchant services checks when payments module is enabled', async () => {
    // Push order: org(3) → users(2) → data_import(1) → merchant_services(4) → go_live(1)
    mockExecute
      .mockResolvedValueOnce(entitlementRows('payments'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1) — pushed BEFORE module-specific checks
      .mockResolvedValueOnce(existsFalse())
      // Merchant services checks (4)
      .mockResolvedValueOnce(existsTrue())   // add_provider
      .mockResolvedValueOnce(existsTrue())   // create_mid
      .mockResolvedValueOnce(existsFalse())  // assign_terminals
      .mockResolvedValueOnce(existsFalse())  // assign_devices
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

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
    mockExecute
      .mockResolvedValueOnce([]) // entitlements — empty
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1)
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

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

    // Only 8 execute calls: 1 entitlements + 3 org + 2 users + 1 data_import + 1 go_live
    expect(mockExecute).toHaveBeenCalledTimes(8);
  });

  it('returns all default phases even when no checks run', async () => {
    mockExecute
      .mockResolvedValueOnce([]) // entitlements
      .mockResolvedValue(existsFalse()); // all checks

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
    mockExecute
      .mockResolvedValueOnce([]) // entitlements
      .mockResolvedValue(existsFalse()); // all checks

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.data.data_import.import_overview).toBe(true);
  });

  it('handles entitlements query failure gracefully', async () => {
    mockExecute
      // entitlements throws
      .mockRejectedValueOnce(new Error('Table does not exist'))
      // Organization (3)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1)
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // Should still succeed — treats as no modules enabled
    expect(response.status).toBe(200);
    expect(body.data.organization.locations).toBe(true);
    // Module-gated phases should be all false (no modules enabled)
    expect(body.data.catalog.hierarchy).toBe(false);
  });

  it('handles individual EXISTS check failure gracefully', async () => {
    mockExecute
      .mockResolvedValueOnce([]) // entitlements
      // Organization: locations check throws, profit_centers OK, terminals OK
      .mockRejectedValueOnce(new Error('Table missing'))
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1)
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // Failed check returns false, doesn't crash
    expect(response.status).toBe(200);
    expect(body.data.organization.locations).toBe(false);
    expect(body.data.organization.profit_centers).toBe(true);
  });

  it('handles all modules enabled with full data', async () => {
    // Push order: org(3) → users(2) → catalog(5) → inventory(2) → customers(3) →
    //             data_import(1) → accounting(3) → fnb(3) → reporting(1) → semantic(1) →
    //             merchant_services(4) → go_live(1) + acctSettings(1)
    mockExecute
      .mockResolvedValueOnce(entitlementRows(
        'catalog', 'inventory', 'customers', 'accounting',
        'pos_fnb', 'reporting', 'semantic', 'payments',
      ))
      // Organization (3)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      // Users (2)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      // Catalog (5)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      // Inventory (2)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      // Customers (3)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      // Data Import (1) — pushed BEFORE module-specific checks below
      .mockResolvedValueOnce(existsTrue())
      // Accounting (3)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      // F&B (3)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      // Reporting (1)
      .mockResolvedValueOnce(existsTrue())
      // Semantic (1)
      .mockResolvedValueOnce(existsTrue())
      // Merchant services (4)
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      .mockResolvedValueOnce(existsTrue())
      // Go Live (1)
      .mockResolvedValueOnce(existsTrue())
      // Accounting settings
      .mockResolvedValueOnce(acctSettings({
        ap: 'acct_ap',
        ar: 'acct_ar',
        retained: 'acct_re',
        autoPost: 'auto_post',
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

  it('handles accounting settings query failure gracefully', async () => {
    // Push order: org(3) → users(2) → data_import(1) → accounting(3) → go_live(1) + acctSettings
    mockExecute
      .mockResolvedValueOnce(entitlementRows('accounting'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1) — pushed BEFORE module-specific checks
      .mockResolvedValueOnce(existsFalse())
      // Accounting checks (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse())
      // Accounting settings — throws
      .mockRejectedValueOnce(new Error('Table missing'));

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // Should gracefully handle — accounting stays all false
    expect(response.status).toBe(200);
    expect(body.data.accounting.bootstrap).toBe(false);
    expect(body.data.accounting.control_accounts).toBe(false);
    expect(body.data.accounting.pos_posting).toBe(false);
  });

  it('handles empty accounting settings result', async () => {
    // Push order: org(3) → users(2) → data_import(1) → accounting(3) → go_live(1) + acctSettings
    mockExecute
      .mockResolvedValueOnce(entitlementRows('accounting'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Data Import (1) — pushed BEFORE module-specific checks
      .mockResolvedValueOnce(existsFalse())
      // Accounting checks (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse())
      // Accounting settings — empty result (no settings row)
      .mockResolvedValueOnce([]);

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // No settings row → no bootstrap → all false
    expect(body.data.accounting.bootstrap).toBe(false);
    expect(body.data.accounting.control_accounts).toBe(false);
  });

  it('includes all default step keys in every phase', async () => {
    mockExecute
      .mockResolvedValueOnce([]) // entitlements
      .mockResolvedValue(existsFalse()); // all checks

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
    mockExecute
      .mockResolvedValueOnce(entitlementRows('catalog'))
      // Organization (3)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Users (2)
      .mockResolvedValueOnce(existsFalse())
      .mockResolvedValueOnce(existsFalse())
      // Catalog (5)
      .mockResolvedValueOnce(existsFalse())  // hierarchy
      .mockResolvedValueOnce(existsFalse())  // tax_config
      .mockResolvedValueOnce(existsFalse())  // items = false
      .mockResolvedValueOnce(existsFalse())  // modifiers
      .mockResolvedValueOnce(existsFalse())  // packages
      // Data Import (1)
      .mockResolvedValueOnce(existsFalse())
      // Go Live (1)
      .mockResolvedValueOnce(existsFalse());

    const { GET } = await import('../app/api/v1/onboarding/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    // items = false → import_items = false
    expect(body.data.catalog.items).toBe(false);
    expect(body.data.catalog.import_items).toBe(false);
  });
});
