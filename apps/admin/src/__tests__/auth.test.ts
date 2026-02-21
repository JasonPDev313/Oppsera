import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────

const { mockDbSelect, mockDbUpdate, makeChain } = vi.hoisted(() => {
  const makeChain = (result: unknown[] = []): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.set = vi.fn(() => chain);
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => resolve(result));
    return chain;
  };
  return {
    makeChain,
    mockDbSelect: vi.fn(() => makeChain([])),
    mockDbUpdate: vi.fn(() => makeChain()),
  };
});

vi.mock('@oppsera/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  platformAdmins: {
    email: 'email',
    id: 'id',
    lastLoginAt: 'last_login_at',
  },
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: 'eq' })),
}));

// Mock jose for JWT ops
vi.mock('jose', () => ({
  SignJWT: vi.fn().mockReturnValue({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue('mock.jwt.token'),
  }),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: {
      adminId: 'admin_001',
      email: 'admin@oppsera.com',
      name: 'Admin User',
      role: 'admin',
    },
  }),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'mock.jwt.token' }),
  }),
}));

// ── Import after mocks ────────────────────────────────────────────

import {
  createAdminToken,
  verifyAdminToken,
  getAdminSession,
  makeSessionCookie,
  clearSessionCookie,
  requireRole,
} from '../lib/auth';

// ── Tests ────────────────────────────────────────────────────────

describe('createAdminToken', () => {
  beforeEach(() => {
    process.env.ADMIN_AUTH_SECRET = 'test-secret-that-is-at-least-32-chars!!';
  });

  it('returns a JWT string', async () => {
    const token = await createAdminToken({
      adminId: 'admin_001',
      email: 'admin@oppsera.com',
      name: 'Test Admin',
      role: 'admin',
    });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('throws when ADMIN_AUTH_SECRET is missing', async () => {
    const original = process.env.ADMIN_AUTH_SECRET;
    delete process.env.ADMIN_AUTH_SECRET;
    await expect(
      createAdminToken({ adminId: 'x', email: 'x@x.com', name: 'X', role: 'admin' }),
    ).rejects.toThrow('ADMIN_AUTH_SECRET');
    process.env.ADMIN_AUTH_SECRET = original;
  });
});

describe('verifyAdminToken', () => {
  beforeEach(() => {
    process.env.ADMIN_AUTH_SECRET = 'test-secret-that-is-at-least-32-chars!!';
  });

  it('returns session from valid token', async () => {
    const session = await verifyAdminToken('mock.jwt.token');
    expect(session).not.toBeNull();
    expect(session?.adminId).toBe('admin_001');
    expect(session?.email).toBe('admin@oppsera.com');
    expect(session?.role).toBe('admin');
  });

  it('returns null on invalid token', async () => {
    const { jwtVerify } = await import('jose');
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error('JWTExpired'));
    const session = await verifyAdminToken('bad.token');
    expect(session).toBeNull();
  });
});

describe('getAdminSession', () => {
  it('returns session when cookie is present and valid', async () => {
    process.env.ADMIN_AUTH_SECRET = 'test-secret-that-is-at-least-32-chars!!';
    const session = await getAdminSession();
    expect(session).not.toBeNull();
    expect(session?.adminId).toBe('admin_001');
  });

  it('returns null when cookie is missing', async () => {
    process.env.ADMIN_AUTH_SECRET = 'test-secret-that-is-at-least-32-chars!!';
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn().mockReturnValue(undefined),
    } as never);
    const session = await getAdminSession();
    expect(session).toBeNull();
  });
});

describe('makeSessionCookie', () => {
  it('returns httpOnly cookie config with correct name', () => {
    const cookie = makeSessionCookie('some.token');
    expect(cookie.name).toBe('oppsera_admin_session');
    expect(cookie.value).toBe('some.token');
    expect(cookie.options.httpOnly).toBe(true);
    expect(cookie.options.maxAge).toBeGreaterThan(0);
  });
});

describe('clearSessionCookie', () => {
  it('returns empty value with maxAge 0', () => {
    const cookie = clearSessionCookie();
    expect(cookie.value).toBe('');
    expect(cookie.options.maxAge).toBe(0);
  });
});

describe('requireRole', () => {
  const makeSession = (role: 'viewer' | 'admin' | 'super_admin') => ({
    adminId: 'x',
    email: 'x@x.com',
    name: 'X',
    role,
  });

  it('viewer satisfies viewer requirement', () => {
    expect(requireRole(makeSession('viewer'), 'viewer')).toBe(true);
  });

  it('viewer does NOT satisfy admin requirement', () => {
    expect(requireRole(makeSession('viewer'), 'admin')).toBe(false);
  });

  it('admin satisfies viewer requirement', () => {
    expect(requireRole(makeSession('admin'), 'viewer')).toBe(true);
  });

  it('admin satisfies admin requirement', () => {
    expect(requireRole(makeSession('admin'), 'admin')).toBe(true);
  });

  it('admin does NOT satisfy super_admin requirement', () => {
    expect(requireRole(makeSession('admin'), 'super_admin')).toBe(false);
  });

  it('super_admin satisfies all requirements', () => {
    expect(requireRole(makeSession('super_admin'), 'viewer')).toBe(true);
    expect(requireRole(makeSession('super_admin'), 'admin')).toBe(true);
    expect(requireRole(makeSession('super_admin'), 'super_admin')).toBe(true);
  });
});
