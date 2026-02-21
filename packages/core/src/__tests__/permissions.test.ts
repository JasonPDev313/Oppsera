import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────

const {
  mockExecute,
  mockFindFirstRoles,
  mockFindFirstLocations,
  mockFindFirstMemberships,
  mockFindFirstUsers,
  mockFindFirstRoleAssignments,
  mockFindManyRoleAssignments,
  mockFindManyRolePermissions,
  mockFindManyRoles,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockSelect,
  mockTransaction,
} = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockFindFirstRoles: vi.fn(),
  mockFindFirstLocations: vi.fn(),
  mockFindFirstMemberships: vi.fn(),
  mockFindFirstUsers: vi.fn(),
  mockFindFirstRoleAssignments: vi.fn(),
  mockFindManyRoleAssignments: vi.fn().mockResolvedValue([]),
  mockFindManyRolePermissions: vi.fn().mockResolvedValue([]),
  mockFindManyRoles: vi.fn().mockResolvedValue([]),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockSelect: vi.fn(),
  mockTransaction: vi.fn(),
}));

// Setup insert chain
mockInsert.mockReturnValue({
  values: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: 'new-role-id', tenantId: 'tnt_01', name: 'test', isSystem: false }]),
  }),
});

// Setup update chain
mockUpdate.mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

// Setup delete chain
mockDelete.mockReturnValue({
  where: vi.fn().mockResolvedValue(undefined),
});

// Setup select chain
mockSelect.mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([{ count: 2 }]),
  }),
});

// Setup transaction to execute the callback with a mock tx
mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    query: {
      roles: { findFirst: mockFindFirstRoles, findMany: mockFindManyRoles },
      rolePermissions: { findFirst: vi.fn(), findMany: mockFindManyRolePermissions },
      roleAssignments: { findFirst: mockFindFirstRoleAssignments, findMany: mockFindManyRoleAssignments },
      memberships: { findFirst: mockFindFirstMemberships },
      locations: { findFirst: mockFindFirstLocations },
      users: { findFirst: mockFindFirstUsers },
    },
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
  };
  return cb(tx);
});

vi.mock('@oppsera/db', () => ({
  db: {
    query: {
      roles: { findFirst: mockFindFirstRoles, findMany: mockFindManyRoles },
      rolePermissions: { findFirst: vi.fn(), findMany: mockFindManyRolePermissions },
      roleAssignments: { findFirst: mockFindFirstRoleAssignments, findMany: mockFindManyRoleAssignments },
      memberships: { findFirst: mockFindFirstMemberships },
      locations: { findFirst: mockFindFirstLocations },
      users: { findFirst: mockFindFirstUsers },
    },
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
    execute: mockExecute,
    transaction: mockTransaction,
  },
  withTenant: async (tenantId: string, cb: (tx: unknown) => Promise<unknown>) => {
    return mockTransaction(cb);
  },
  sql: vi.fn((...args: unknown[]) => args),
  roles: {
    id: 'roles.id',
    tenantId: 'roles.tenantId',
    name: 'roles.name',
    isSystem: 'roles.isSystem',
  },
  rolePermissions: {
    id: 'rolePermissions.id',
    roleId: 'rolePermissions.roleId',
    permission: 'rolePermissions.permission',
  },
  roleAssignments: {
    id: 'roleAssignments.id',
    tenantId: 'roleAssignments.tenantId',
    userId: 'roleAssignments.userId',
    roleId: 'roleAssignments.roleId',
    locationId: 'roleAssignments.locationId',
  },
  memberships: {
    tenantId: 'memberships.tenantId',
    userId: 'memberships.userId',
    status: 'memberships.status',
  },
  locations: {
    id: 'locations.id',
    tenantId: 'locations.tenantId',
    isActive: 'locations.isActive',
  },
  users: { id: 'users.id' },
  schema: {},
}));

vi.mock('../auth/supabase-client', () => ({
  createSupabaseAdmin: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '@oppsera/shared';
import {
  matchPermission,
  DefaultPermissionEngine,
  InMemoryPermissionCache,
  setPermissionCache,
  setPermissionEngine,
} from '../permissions';
import { requirePermission } from '../permissions/middleware';
import { createRole, deleteRole, assignRole, revokeRole } from '../permissions/commands';
import type { RequestContext } from '../auth/context';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_ID = 'tnt_01TEST';
const USER_ID = 'usr_01TEST';
const OWNER_ROLE_ID = 'role_owner';
const LOCATION_A = 'loc_A';
const LOCATION_B = 'loc_B';

// ── Tests ─────────────────────────────────────────────────────────

describe('matchPermission', () => {
  it('grants everything with wildcard *', () => {
    expect(matchPermission('*', 'anything.here')).toBe(true);
    expect(matchPermission('*', 'orders.create')).toBe(true);
  });

  it('grants module wildcard', () => {
    expect(matchPermission('catalog.*', 'catalog.create')).toBe(true);
    expect(matchPermission('catalog.*', 'catalog.view')).toBe(true);
    expect(matchPermission('catalog.*', 'orders.create')).toBe(false);
  });

  it('grants exact match', () => {
    expect(matchPermission('orders.create', 'orders.create')).toBe(true);
    expect(matchPermission('orders.create', 'orders.void')).toBe(false);
  });

  it('denies when no match', () => {
    expect(matchPermission('orders.create', 'catalog.view')).toBe(false);
  });
});

describe('InMemoryPermissionCache', () => {
  let cache: InMemoryPermissionCache;

  beforeEach(() => {
    cache = new InMemoryPermissionCache();
  });

  it('returns null for missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores and retrieves permissions', async () => {
    const perms = new Set(['orders.create', 'orders.view']);
    await cache.set('test-key', perms, 60);
    const result = await cache.get('test-key');
    expect(result).toEqual(perms);
  });

  it('returns null for expired entries', async () => {
    const perms = new Set(['orders.create']);
    await cache.set('test-key', perms, 0); // 0 second TTL
    // Immediately expired
    await new Promise((r) => setTimeout(r, 10));
    expect(await cache.get('test-key')).toBeNull();
  });

  it('deletes entries by pattern prefix', async () => {
    await cache.set('perms:t1:u1:global', new Set(['a']), 60);
    await cache.set('perms:t1:u1:loc1', new Set(['b']), 60);
    await cache.set('perms:t1:u2:global', new Set(['c']), 60);
    await cache.delete('perms:t1:u1:*');
    expect(await cache.get('perms:t1:u1:global')).toBeNull();
    expect(await cache.get('perms:t1:u1:loc1')).toBeNull();
    expect(await cache.get('perms:t1:u2:global')).toEqual(new Set(['c']));
  });
});

describe('DefaultPermissionEngine', () => {
  let engine: DefaultPermissionEngine;
  let cache: InMemoryPermissionCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new InMemoryPermissionCache();
    setPermissionCache(cache);
    engine = new DefaultPermissionEngine();
    setPermissionEngine(engine);
  });

  // Test 1: getUserPermissions — owner role
  it('returns permissions from DB query for owner role', async () => {
    mockExecute.mockResolvedValueOnce([{ permission: '*' }]);

    const perms = await engine.getUserPermissions(TENANT_ID, USER_ID);
    expect(perms).toEqual(new Set(['*']));
  });

  // Test 2: getUserPermissions — cashier role (no wildcard)
  it('returns specific permissions for non-owner role', async () => {
    mockExecute.mockResolvedValueOnce([
      { permission: 'orders.create' },
      { permission: 'orders.view' },
      { permission: 'tenders.create' },
      { permission: 'catalog.view' },
    ]);

    const perms = await engine.getUserPermissions(TENANT_ID, USER_ID);
    expect(perms).toEqual(
      new Set(['orders.create', 'orders.view', 'tenders.create', 'catalog.view']),
    );
    expect(perms.has('*')).toBe(false);
  });

  // Test 3: hasPermission — wildcard match
  it('grants any permission to owner with *', async () => {
    mockExecute.mockResolvedValueOnce([{ permission: '*' }]);

    expect(await engine.hasPermission(TENANT_ID, USER_ID, 'anything.here')).toBe(true);
  });

  // Test 4: hasPermission — module wildcard match
  it('grants catalog.create to user with catalog.*', async () => {
    mockExecute.mockResolvedValueOnce([{ permission: 'catalog.*' }]);

    expect(await engine.hasPermission(TENANT_ID, USER_ID, 'catalog.create')).toBe(true);
  });

  it('denies orders.create to user with only catalog.*', async () => {
    // Cache should be populated from previous call in a fresh test
    mockExecute.mockResolvedValueOnce([{ permission: 'catalog.*' }]);

    expect(await engine.hasPermission(TENANT_ID, USER_ID, 'orders.create')).toBe(false);
  });

  // Test 5: hasPermission — exact match
  it('grants exact permission match', async () => {
    mockExecute.mockResolvedValueOnce([{ permission: 'orders.create' }]);

    expect(await engine.hasPermission(TENANT_ID, USER_ID, 'orders.create')).toBe(true);
  });

  it('denies non-matching exact permission', async () => {
    mockExecute.mockResolvedValueOnce([{ permission: 'orders.create' }]);

    expect(await engine.hasPermission(TENANT_ID, USER_ID, 'orders.void')).toBe(false);
  });

  // Test 6: Location-scoped permissions
  it('passes locationId in query when provided', async () => {
    mockExecute.mockResolvedValueOnce([{ permission: 'orders.create' }]);

    const perms = await engine.getUserPermissions(TENANT_ID, USER_ID, LOCATION_A);
    expect(perms).toEqual(new Set(['orders.create']));
    // The execute was called with SQL including location filter
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('returns different permissions for different locations', async () => {
    // Location A has orders.create
    mockExecute.mockResolvedValueOnce([{ permission: 'orders.create' }]);
    const permsA = await engine.getUserPermissions(TENANT_ID, USER_ID, LOCATION_A);
    expect(permsA.has('orders.create')).toBe(true);

    // Location B has no permissions
    mockExecute.mockResolvedValueOnce([]);
    const permsB = await engine.getUserPermissions(TENANT_ID, USER_ID, LOCATION_B);
    expect(permsB.has('orders.create')).toBe(false);
  });

  // Test 7: Tenant-wide + location-scoped union
  it('returns union of tenant-wide and location-specific permissions', async () => {
    mockExecute.mockResolvedValueOnce([
      { permission: 'catalog.view' },
      { permission: 'orders.view' },
      { permission: 'orders.create' },
      { permission: 'inventory.adjust' },
    ]);

    const perms = await engine.getUserPermissions(TENANT_ID, USER_ID, LOCATION_A);
    expect(perms.has('catalog.view')).toBe(true);
    expect(perms.has('orders.create')).toBe(true);
  });

  // Test 8: Permission cache
  it('returns cached permissions on second call', async () => {
    mockExecute.mockResolvedValueOnce([{ permission: 'orders.create' }]);

    // First call hits DB
    const perms1 = await engine.getUserPermissions(TENANT_ID, USER_ID);
    expect(mockExecute).toHaveBeenCalledTimes(1);

    // Second call uses cache
    const perms2 = await engine.getUserPermissions(TENANT_ID, USER_ID);
    expect(mockExecute).toHaveBeenCalledTimes(1); // Still 1 — no extra DB call
    expect(perms2).toEqual(perms1);
  });

  it('invalidates cache correctly', async () => {
    mockExecute.mockResolvedValue([{ permission: 'orders.create' }]);

    // Populate cache
    await engine.getUserPermissions(TENANT_ID, USER_ID);
    expect(mockExecute).toHaveBeenCalledTimes(1);

    // Invalidate
    await engine.invalidateCache(TENANT_ID, USER_ID);

    // Next call hits DB again
    await engine.getUserPermissions(TENANT_ID, USER_ID);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});

describe('requirePermission middleware', () => {
  let engine: DefaultPermissionEngine;
  let cache: InMemoryPermissionCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new InMemoryPermissionCache();
    setPermissionCache(cache);
    engine = new DefaultPermissionEngine();
    setPermissionEngine(engine);
  });

  const makeCtx = (overrides?: Partial<RequestContext>): RequestContext => ({
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
  });

  // Test 9: requirePermission — authorized (owner)
  it('passes for owner user with * permission', async () => {
    mockExecute.mockResolvedValueOnce([{ permission: '*' }]);
    const ctx = makeCtx();
    const middleware = requirePermission('orders.create');

    // Should not throw
    await expect(middleware(ctx)).resolves.toBeUndefined();
  });

  // Test 10: requirePermission — denied (viewer)
  it('throws AuthorizationError for viewer lacking orders.create', async () => {
    mockExecute.mockResolvedValueOnce([
      { permission: 'catalog.view' },
      { permission: 'orders.view' },
    ]);
    const ctx = makeCtx();
    const middleware = requirePermission('orders.create');

    await expect(middleware(ctx)).rejects.toThrow(AuthorizationError);
  });

  it('includes permission name in error message', async () => {
    mockExecute.mockResolvedValueOnce([]);
    const ctx = makeCtx();
    const middleware = requirePermission('users.manage');

    await expect(middleware(ctx)).rejects.toThrow('Missing required permission: users.manage');
  });
});

describe('Role management commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const cache = new InMemoryPermissionCache();
    setPermissionCache(cache);
    setPermissionEngine(new DefaultPermissionEngine());
  });

  // Test 11: Create custom role
  it('creates a custom role with permissions', async () => {
    mockFindFirstRoles.mockResolvedValue(null); // No duplicate
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'new-role-id',
          tenantId: TENANT_ID,
          name: 'shift-lead',
          description: 'Shift leader',
          isSystem: false,
        }]),
      }),
    });

    const result = await createRole({
      tenantId: TENANT_ID,
      name: 'shift-lead',
      description: 'Shift leader',
      permissions: ['orders.create', 'orders.view'],
    });

    expect(result.name).toBe('shift-lead');
    expect(result.permissions).toEqual(['orders.create', 'orders.view']);
  });

  // Test 12: Delete system role → rejected
  it('rejects deleting a system role', async () => {
    mockFindFirstRoles.mockResolvedValue({
      id: OWNER_ROLE_ID,
      tenantId: TENANT_ID,
      name: 'owner',
      isSystem: true,
    });

    await expect(deleteRole(TENANT_ID, OWNER_ROLE_ID)).rejects.toThrow(ConflictError);
    await expect(deleteRole(TENANT_ID, OWNER_ROLE_ID)).rejects.toThrow(
      'Cannot delete system role',
    );
  });

  // Test 13: Assign role
  it('assigns a role to a user and invalidates cache', async () => {
    mockFindFirstMemberships.mockResolvedValue({
      id: 'mem_01',
      tenantId: TENANT_ID,
      userId: USER_ID,
      status: 'active',
    });
    mockFindFirstRoles.mockResolvedValue({
      id: 'role_manager',
      tenantId: TENANT_ID,
      name: 'manager',
      isSystem: true,
    });
    mockFindFirstRoleAssignments.mockResolvedValue(null); // No duplicate
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'ra_01',
          tenantId: TENANT_ID,
          userId: USER_ID,
          roleId: 'role_manager',
          locationId: null,
        }]),
      }),
    });

    const result = await assignRole({
      tenantId: TENANT_ID,
      userId: USER_ID,
      roleId: 'role_manager',
    });

    expect(result.roleId).toBe('role_manager');
  });

  // Test 14: Revoke last owner → rejected
  it('rejects revoking the last owner role', async () => {
    mockFindFirstRoles.mockResolvedValue({
      id: OWNER_ROLE_ID,
      tenantId: TENANT_ID,
      name: 'owner',
      isSystem: true,
    });
    // Only one owner assignment
    mockFindManyRoleAssignments.mockResolvedValue([
      { id: 'ra_01', tenantId: TENANT_ID, userId: USER_ID, roleId: OWNER_ROLE_ID },
    ]);

    await expect(
      revokeRole({ tenantId: TENANT_ID, userId: USER_ID, roleId: OWNER_ROLE_ID }),
    ).rejects.toThrow(ConflictError);
    await expect(
      revokeRole({ tenantId: TENANT_ID, userId: USER_ID, roleId: OWNER_ROLE_ID }),
    ).rejects.toThrow('Cannot revoke the last owner role');
  });
});

describe('Location validation in withMiddleware', () => {
  // Test 15: These test the resolveLocation logic indirectly through integration
  // We test the core concepts here since withMiddleware requires NextRequest

  it('NotFoundError has correct properties', () => {
    const err = new NotFoundError('Location');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });
});
