import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────

const {
  mockExecute,
  mockFindManyEntitlements,
  mockFindFirstLocations,
  mockSelect,
  mockTransaction,
} = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockFindManyEntitlements: vi.fn().mockResolvedValue([]),
  mockFindFirstLocations: vi.fn(),
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
}));

mockSelect.mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([{ count: 5 }]),
  }),
});

mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    query: {
      entitlements: { findMany: mockFindManyEntitlements },
    },
    select: mockSelect,
  };
  return cb(tx);
});

vi.mock('@oppsera/db', () => ({
  db: {
    query: {
      entitlements: { findMany: mockFindManyEntitlements },
      locations: { findFirst: mockFindFirstLocations },
      roles: { findFirst: vi.fn(), findMany: vi.fn() },
      rolePermissions: { findFirst: vi.fn(), findMany: vi.fn() },
      roleAssignments: { findFirst: vi.fn(), findMany: vi.fn() },
      memberships: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    execute: mockExecute,
    select: mockSelect,
    transaction: mockTransaction,
  },
  withTenant: async (_tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
    return mockTransaction(cb);
  },
  sql: vi.fn((...args: unknown[]) => args),
  entitlements: {
    tenantId: 'entitlements.tenantId',
  },
  memberships: {
    tenantId: 'memberships.tenantId',
    status: 'memberships.status',
  },
  locations: {
    id: 'locations.id',
    tenantId: 'locations.tenantId',
    isActive: 'locations.isActive',
  },
  schema: {},
  isBreakerOpen: vi.fn().mockReturnValue(false),
  guardedQuery: vi.fn().mockImplementation((_op: string, fn: () => Promise<unknown>) => fn()),
  singleFlight: vi.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
  jitterTtl: vi.fn().mockImplementation((base: number) => base),
  jitterTtlMs: vi.fn().mockImplementation((base: number) => base),
  isPoolExhaustion: vi.fn().mockReturnValue(false),
  getPoolGuardStats: vi.fn().mockReturnValue({ tripped: 0, queries: 0 }),
}));

vi.mock('../auth/supabase-client', () => ({
  createSupabaseAdmin: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import {
  AppError,
  ModuleNotEnabledError,
} from '@oppsera/shared';
import {
  DefaultEntitlementEngine,
  InMemoryEntitlementCache,
  setEntitlementCache,
  setEntitlementEngine,
  MODULE_REGISTRY,
} from '../entitlements';
import { requireEntitlement } from '../entitlements/middleware';
import { checkSeatLimit, checkLocationLimit } from '../entitlements/limits';
import type { RequestContext } from '../auth/context';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_ID = 'tnt_01TEST';
const USER_ID = 'usr_01TEST';

const seedEntitlements = [
  { moduleKey: 'platform_core', isEnabled: true, expiresAt: null, limits: { max_seats: 25, max_locations: 10, max_devices: 10 }, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
  { moduleKey: 'catalog', isEnabled: true, expiresAt: null, limits: {}, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
  { moduleKey: 'pos_retail', isEnabled: true, expiresAt: null, limits: {}, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
  { moduleKey: 'payments', isEnabled: true, expiresAt: null, limits: {}, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
  { moduleKey: 'inventory', isEnabled: true, expiresAt: null, limits: {}, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
  { moduleKey: 'customers', isEnabled: true, expiresAt: null, limits: {}, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
  { moduleKey: 'reporting', isEnabled: true, expiresAt: null, limits: {}, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
];

function makeCtx(overrides?: Partial<RequestContext>): RequestContext {
  return {
    user: {
      id: USER_ID,
      email: 'test@test.com',
      name: 'Test User',
      tenantId: TENANT_ID,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    tenantId: TENANT_ID,
    requestId: 'req_01',
    isPlatformAdmin: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('InMemoryEntitlementCache', () => {
  let cache: InMemoryEntitlementCache;

  beforeEach(() => {
    cache = new InMemoryEntitlementCache();
  });

  it('returns null for missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores and retrieves entitlements', async () => {
    const entries = new Map([
      ['catalog', { isEnabled: true, expiresAt: null, limits: {} }],
    ]);
    await cache.set('test-key', entries, 60);
    const result = await cache.get('test-key');
    expect(result?.get('catalog')?.isEnabled).toBe(true);
  });

  it('returns null for expired entries', async () => {
    const entries = new Map([
      ['catalog', { isEnabled: true, expiresAt: null, limits: {} }],
    ]);
    await cache.set('test-key', entries, 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(await cache.get('test-key')).toBeNull();
  });

  it('deletes entries by key', async () => {
    const entries = new Map([
      ['catalog', { isEnabled: true, expiresAt: null, limits: {} }],
    ]);
    await cache.set('key1', entries, 60);
    await cache.delete('key1');
    expect(await cache.get('key1')).toBeNull();
  });
});

describe('DefaultEntitlementEngine', () => {
  let engine: DefaultEntitlementEngine;
  let cache: InMemoryEntitlementCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new InMemoryEntitlementCache();
    setEntitlementCache(cache);
    engine = new DefaultEntitlementEngine();
    setEntitlementEngine(engine);
  });

  // Test 1: isModuleEnabled — enabled module
  it('returns true for enabled module', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    expect(await engine.isModuleEnabled(TENANT_ID, 'catalog')).toBe(true);
  });

  // Test 2: isModuleEnabled — disabled module
  it('returns false for disabled module', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce([
      { moduleKey: 'marketing', isEnabled: false, expiresAt: null, limits: {}, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
    ]);
    expect(await engine.isModuleEnabled(TENANT_ID, 'marketing')).toBe(false);
  });

  // Test 3: isModuleEnabled — no entitlement row
  it('returns false for module with no entitlement row', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    expect(await engine.isModuleEnabled(TENANT_ID, 'golf_ops')).toBe(false);
  });

  // Test 4: isModuleEnabled — expired entitlement
  it('returns false for expired entitlement', async () => {
    const pastDate = new Date('2020-01-01');
    mockFindManyEntitlements.mockResolvedValueOnce([
      { moduleKey: 'catalog', isEnabled: true, expiresAt: pastDate, limits: {}, planTier: 'standard', tenantId: TENANT_ID, activatedAt: new Date() },
    ]);
    expect(await engine.isModuleEnabled(TENANT_ID, 'catalog')).toBe(false);
  });

  // Test 5: platform_core always enabled (early-returns without querying DB)
  it('returns true for platform_core even without entitlement row', async () => {
    expect(await engine.isModuleEnabled(TENANT_ID, 'platform_core')).toBe(true);
  });

  // Test 9: getEnabledModules
  it('returns all enabled module keys', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    const enabled = await engine.getEnabledModules(TENANT_ID);
    expect(enabled).toContain('platform_core');
    expect(enabled).toContain('catalog');
    expect(enabled).toContain('pos_retail');
    expect(enabled).toContain('payments');
    expect(enabled).toContain('inventory');
    expect(enabled).toContain('customers');
    expect(enabled).toContain('reporting');
    expect(enabled).toHaveLength(7); // 6 non-core from seed + platform_core (deduplicated)
  });

  // Test 10: getModuleLimits
  it('returns limits for platform_core', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    const limits = await engine.getModuleLimits(TENANT_ID, 'platform_core');
    expect(limits).toEqual({ max_seats: 25, max_locations: 10, max_devices: 10 });
  });

  it('returns null for module with no entitlement', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    const limits = await engine.getModuleLimits(TENANT_ID, 'golf_ops');
    expect(limits).toBeNull();
  });

  // Test 13: Entitlements cache
  it('returns cached entitlements on second call', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);

    // First call hits DB
    await engine.isModuleEnabled(TENANT_ID, 'catalog');
    expect(mockFindManyEntitlements).toHaveBeenCalledTimes(1);

    // Second call uses cache
    await engine.isModuleEnabled(TENANT_ID, 'inventory');
    expect(mockFindManyEntitlements).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache correctly', async () => {
    mockFindManyEntitlements.mockResolvedValue(seedEntitlements);

    // Populate cache
    await engine.isModuleEnabled(TENANT_ID, 'catalog');
    expect(mockFindManyEntitlements).toHaveBeenCalledTimes(1);

    // Invalidate
    await engine.invalidateEntitlements(TENANT_ID);

    // Next call hits DB again
    await engine.isModuleEnabled(TENANT_ID, 'catalog');
    expect(mockFindManyEntitlements).toHaveBeenCalledTimes(2);
  });
});

describe('requireEntitlement middleware', () => {
  let engine: DefaultEntitlementEngine;
  let cache: InMemoryEntitlementCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new InMemoryEntitlementCache();
    setEntitlementCache(cache);
    engine = new DefaultEntitlementEngine();
    setEntitlementEngine(engine);
  });

  // Test 6: requireEntitlement — enabled
  it('passes for enabled module', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    const ctx = makeCtx();
    const middleware = requireEntitlement('catalog');
    await expect(middleware(ctx)).resolves.toBeUndefined();
  });

  // Test 7: requireEntitlement — disabled
  it('throws ModuleNotEnabledError for disabled module', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    const ctx = makeCtx();
    const middleware = requireEntitlement('golf_ops');
    await expect(middleware(ctx)).rejects.toThrow(ModuleNotEnabledError);
  });

  it('includes module key in error message', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    const ctx = makeCtx();
    const middleware = requireEntitlement('golf_ops');
    await expect(middleware(ctx)).rejects.toThrow('golf_ops module is not enabled');
  });

  // Test 8: Full middleware chain ordering
  it('entitlement check runs before permission check', async () => {
    // Module disabled — should fail with MODULE_NOT_ENABLED, not AUTHORIZATION_DENIED
    mockFindManyEntitlements.mockResolvedValueOnce([]);
    const ctx = makeCtx();
    const entMiddleware = requireEntitlement('catalog');
    await expect(entMiddleware(ctx)).rejects.toThrow(ModuleNotEnabledError);
    await expect(entMiddleware(ctx)).rejects.not.toThrow('AUTHORIZATION_DENIED');
  });
});

describe('ModuleNotEnabledError', () => {
  it('has correct properties', () => {
    const err = new ModuleNotEnabledError('catalog');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('MODULE_NOT_ENABLED');
    expect(err.message).toContain('catalog');
  });
});

describe('Limit checking helpers', () => {
  let engine: DefaultEntitlementEngine;
  let cache: InMemoryEntitlementCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new InMemoryEntitlementCache();
    setEntitlementCache(cache);
    engine = new DefaultEntitlementEngine();
    setEntitlementEngine(engine);
  });

  // Test 11: checkSeatLimit
  it('does not throw when under seat limit', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      }),
    });
    await expect(checkSeatLimit(TENANT_ID)).resolves.toBeUndefined();
  });

  it('throws when at seat limit', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 25 }]),
      }),
    });
    const error = await checkSeatLimit(TENANT_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('SEAT_LIMIT_REACHED');
    expect(error.message).toContain('Maximum 25 users allowed');
  });

  // Test 12: checkLocationLimit
  it('does not throw when under location limit', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      }),
    });
    await expect(checkLocationLimit(TENANT_ID)).resolves.toBeUndefined();
  });

  it('throws when at location limit', async () => {
    mockFindManyEntitlements.mockResolvedValueOnce(seedEntitlements);
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 10 }]),
      }),
    });
    const error = await checkLocationLimit(TENANT_ID).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('LOCATION_LIMIT_REACHED');
    expect(error.message).toContain('Maximum 10 locations allowed');
  });

  it('does nothing when no limits set', async () => {
    // No platform_core entitlement = no limits
    mockFindManyEntitlements.mockResolvedValueOnce([]);
    await expect(checkSeatLimit(TENANT_ID)).resolves.toBeUndefined();
  });
});

describe('MODULE_REGISTRY', () => {
  it('contains 22 module definitions', () => {
    expect(MODULE_REGISTRY).toHaveLength(22);
  });

  it('contains all expected V1 modules', () => {
    const v1Keys = MODULE_REGISTRY.filter((m) => m.phase === 'v1').map((m) => m.key);
    expect(v1Keys).toContain('platform_core');
    expect(v1Keys).toContain('catalog');
    expect(v1Keys).toContain('orders');
    expect(v1Keys).toContain('pos_retail');
    expect(v1Keys).toContain('pos_fnb');
    expect(v1Keys).toContain('payments');
    expect(v1Keys).toContain('inventory');
    expect(v1Keys).toContain('customers');
    expect(v1Keys).toContain('reporting');
    expect(v1Keys).toContain('room_layouts');
    expect(v1Keys).toContain('accounting');
    expect(v1Keys).toContain('ap');
    expect(v1Keys).toContain('project_costing');
    expect(v1Keys).toContain('expense_management');
    expect(v1Keys).toContain('ar');
    expect(v1Keys).toContain('pms');
    expect(v1Keys).toContain('semantic');
    expect(v1Keys).toContain('club_membership');
    expect(v1Keys).toContain('legacy_import');
  });

  it('each module has key, name, phase, description', () => {
    for (const mod of MODULE_REGISTRY) {
      expect(mod.key).toBeTruthy();
      expect(mod.name).toBeTruthy();
      expect(mod.phase).toBeTruthy();
      expect(mod.description).toBeTruthy();
    }
  });
});
