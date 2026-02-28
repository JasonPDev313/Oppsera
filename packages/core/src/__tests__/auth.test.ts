import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// ── Test Helpers ──────────────────────────────────────────────────────

const TEST_JWT_SECRET = 'test-jwt-secret-for-unit-tests';

function createTestJwt(
  payload: Record<string, unknown> = {},
  options?: jwt.SignOptions,
): string {
  return jwt.sign(
    { sub: 'supabase-uid-001', ...payload },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', ...options },
  );
}

function createExpiredJwt(): string {
  return jwt.sign(
    { sub: 'supabase-uid-001' },
    TEST_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '-1s' },
  );
}

// ── Hoisted mocks ─────────────────────────────────────────────────────

const {
  mockFindFirstUsers,
  mockFindFirstMemberships,
  mockFindFirstTenants,
  mockInsert,
  mockExecute,
  mockSelectResult,
} = vi.hoisted(() => {
  const mockSelectResult = vi.fn();
  return {
    mockFindFirstUsers: vi.fn(),
    mockFindFirstMemberships: vi.fn(),
    mockFindFirstTenants: vi.fn(),
    mockInsert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    mockExecute: vi.fn().mockResolvedValue(undefined),
    mockSelectResult,
  };
});

vi.mock('@oppsera/db', () => {
  // Build a fluent chain mock for db.select().from().innerJoin().where().orderBy().limit()
  const fluentChain = () => {
    const chain: Record<string, any> = {};
    const methods = ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit'];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // The final call in the chain is .limit() which is awaited — make it thenable
    chain.then = (resolve: (v: any) => void, reject: (e: any) => void) => {
      return mockSelectResult().then(resolve, reject);
    };
    return chain;
  };

  return {
    db: {
      query: {
        users: { findFirst: mockFindFirstUsers },
        memberships: { findFirst: mockFindFirstMemberships },
        tenants: { findFirst: mockFindFirstTenants },
      },
      select: vi.fn().mockImplementation(() => fluentChain()),
      insert: mockInsert,
      execute: mockExecute,
      transaction: vi.fn(),
    },
    sql: vi.fn(),
    users: { id: 'users.id', email: 'users.email', authProviderId: 'users.authProviderId' },
    memberships: { id: 'memberships.id', userId: 'memberships.userId', tenantId: 'memberships.tenantId', status: 'memberships.status', createdAt: 'memberships.createdAt' },
    tenants: { id: 'tenants.id', status: 'tenants.status' },
    locations: { tenantId: 'locations.tenantId', isActive: 'locations.isActive' },
    schema: {},
    isBreakerOpen: vi.fn().mockReturnValue(false),
    guardedQuery: vi.fn().mockImplementation((_op: string, fn: () => Promise<unknown>) => fn()),
    singleFlight: vi.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
    jitterTtl: vi.fn().mockImplementation((base: number) => base),
    jitterTtlMs: vi.fn().mockImplementation((base: number) => base),
    isPoolExhaustion: vi.fn().mockReturnValue(false),
    getPoolGuardStats: vi.fn().mockReturnValue({ tripped: 0, queries: 0 }),
  };
});

vi.mock('../auth/supabase-client', () => ({
  createSupabaseAdmin: vi.fn().mockReturnValue({
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      refreshSession: vi.fn(),
      admin: { signOut: vi.fn() },
    },
  }),
  createSupabaseClient: vi.fn(),
}));

// Set env vars for tests
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Static imports — vi.mock is hoisted so these get the mocked versions
import {
  AppError,
  AuthenticationError,
  TenantSuspendedError,
  MembershipInactiveError,
  ValidationError,
} from '@oppsera/shared';
import { authenticate, resolveTenant } from '../auth/middleware';
import { withMiddleware } from '../auth/with-middleware';
import { getAuthAdapter } from '../auth/get-adapter';

// ── Test Data ─────────────────────────────────────────────────────────

const mockUser = {
  id: 'usr_01HTEST000000000000000001',
  email: 'alex@sunsetgolf.com',
  name: 'Alex Admin',
  authProviderId: 'supabase-uid-001',
  isPlatformAdmin: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMembership = {
  id: 'mem_01HTEST000000000000000001',
  tenantId: 'tnt_01HTEST000000000000000001',
  userId: mockUser.id,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTenant = {
  id: 'tnt_01HTEST000000000000000001',
  name: 'Sunset Golf & Grill',
  slug: 'sunset-golf',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('Error Classes', () => {
  it('AppError has correct properties', () => {
    const err = new AppError('TEST_CODE', 'Test message', 418);
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('Test message');
    expect(err.statusCode).toBe(418);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('AuthenticationError defaults to 401', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('TenantSuspendedError has correct code', () => {
    const err = new TenantSuspendedError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('TENANT_SUSPENDED');
  });

  it('MembershipInactiveError has correct code', () => {
    const err = new MembershipInactiveError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('MEMBERSHIP_INACTIVE');
  });

  it('ValidationError includes details array', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const err = new ValidationError('Bad input', details);
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual(details);
  });
});

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirstUsers.mockResolvedValue(mockUser);
    // Combined user+membership+tenant select query returns array
    mockSelectResult.mockResolvedValue([{
      userId: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      membershipStatus: mockMembership.status,
      tenantId: mockMembership.tenantId,
      tenantStatus: mockTenant.status,
    }]);
  });

  it('rejects request with no Authorization header', async () => {
    const request = new Request('http://localhost:3000/api/v1/me');
    await expect(authenticate(request)).rejects.toThrow(AuthenticationError);
  });

  it('rejects request with non-Bearer auth format', async () => {
    const request = new Request('http://localhost:3000/api/v1/me', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    await expect(authenticate(request)).rejects.toThrow(AuthenticationError);
  });

  it('rejects request with invalid JWT', async () => {
    const request = new Request('http://localhost:3000/api/v1/me', {
      headers: { Authorization: 'Bearer invalid.jwt.token' },
    });
    await expect(authenticate(request)).rejects.toThrow(AuthenticationError);
  });

  it('rejects request with expired JWT', async () => {
    const expiredToken = createExpiredJwt();
    const request = new Request('http://localhost:3000/api/v1/me', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    await expect(authenticate(request)).rejects.toThrow(AuthenticationError);
  });

  it('rejects when user not found in database', async () => {
    // Combined query returns empty array when user doesn't exist
    mockSelectResult.mockResolvedValue([]);
    const token = createTestJwt();
    const request = new Request('http://localhost:3000/api/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(authenticate(request)).rejects.toThrow(AuthenticationError);
  });

  it('returns AuthUser on valid token with active membership', async () => {
    const token = createTestJwt();
    const request = new Request('http://localhost:3000/api/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const user = await authenticate(request);
    expect(user).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      tenantId: mockMembership.tenantId,
      tenantStatus: mockTenant.status,
      membershipStatus: mockMembership.status,
    });
  });
});

describe('resolveTenant middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws TenantSuspendedError for suspended tenant', async () => {
    const user = {
      id: 'usr_01H',
      email: 'test@test.com',
      name: 'Test',
      tenantId: 'tnt_01H',
      tenantStatus: 'suspended',
      membershipStatus: 'active',
    };
    await expect(resolveTenant(user)).rejects.toThrow(TenantSuspendedError);
  });

  it('throws MembershipInactiveError for inactive membership', async () => {
    const user = {
      id: 'usr_01H',
      email: 'test@test.com',
      name: 'Test',
      tenantId: 'tnt_01H',
      tenantStatus: 'active',
      membershipStatus: 'inactive',
    };
    await expect(resolveTenant(user)).rejects.toThrow(MembershipInactiveError);
  });

  it('returns RequestContext on success', async () => {
    const user = {
      id: 'usr_01H',
      email: 'test@test.com',
      name: 'Test',
      tenantId: 'tnt_01H',
      tenantStatus: 'active',
      membershipStatus: 'active',
    };

    const ctx = await resolveTenant(user);

    expect(ctx.tenantId).toBe('tnt_01H');
    expect(ctx.user).toBe(user);
    expect(ctx.requestId).toBeDefined();
    expect(ctx.requestId.length).toBe(26); // ULID length
  });
});

describe('getAuthAdapter singleton', () => {
  it('returns the same adapter instance on repeated calls', () => {
    const a = getAuthAdapter();
    const b = getAuthAdapter();
    expect(a).toBe(b);
  });
});

describe('withMiddleware', () => {
  it('returns error envelope for AppError with correct status', async () => {
    const handler = withMiddleware(
      async () => {
        throw new ValidationError('Bad request', [
          { field: 'email', message: 'Required' },
        ]);
      },
      { public: true },
    );

    const request = new Request('http://localhost:3000/test') as unknown as Parameters<typeof handler>[0];
    const response = await handler(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toHaveLength(1);
  });

  it('returns 500 for unexpected errors', async () => {
    const handler = withMiddleware(
      async () => {
        throw new Error('Something went wrong');
      },
      { public: true },
    );

    const request = new Request('http://localhost:3000/test') as unknown as Parameters<typeof handler>[0];
    const response = await handler(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
