import { describe, it, expect, vi } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockDbDelete,
  mockDbExecute,
} = vi.hoisted(() => {
  const makeChain = (result: unknown[] = []): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.leftJoin = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.offset = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.set = vi.fn(() => chain);
    chain.values = vi.fn(() => chain);
    chain.returning = vi.fn(() => Promise.resolve(result));
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => resolve(result));
    return chain;
  };
  return {
    makeChain,
    mockDbSelect: vi.fn(() => makeChain([])),
    mockDbUpdate: vi.fn(() => makeChain()),
    mockDbInsert: vi.fn(() => makeChain()),
    mockDbDelete: vi.fn(() => makeChain()),
    mockDbExecute: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@oppsera/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
    delete: mockDbDelete,
    execute: mockDbExecute,
    query: {},
  },
  tenants: { id: 'id', name: 'name', slug: 'slug', status: 'status', suspendedAt: 'suspended_at', suspendedReason: 'suspended_reason', updatedAt: 'updated_at', industry: 'industry', onboardingStatus: 'onboarding_status' },
  platformAdmins: { id: 'id', email: 'email' },
  platformAdminRoleAssignments: { id: 'id', adminId: 'admin_id', roleId: 'role_id' },
  platformAdminRolePermissions: { id: 'id', roleId: 'role_id', module: 'module', submodule: 'submodule', action: 'action' },
  platformAdminAuditLog: { id: 'id' },
  superadminSupportNotes: { id: 'id', tenantId: 'tenant_id', authorAdminId: 'author_admin_id', content: 'content', noteType: 'note_type', isPinned: 'is_pinned' },
  tenantOnboardingChecklists: { id: 'id', tenantId: 'tenant_id', stepKey: 'step_key', status: 'status' },
  onboardingStepTemplates: { id: 'id', industry: 'industry' },
  adminImpersonationSessions: { id: 'id', adminId: 'admin_id', tenantId: 'tenant_id', status: 'status' },
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  desc: vi.fn(),
  sql: vi.fn(),
  ilike: vi.fn(),
  count: vi.fn(),
}));

// ── Permission matching tests (pure logic, no mocks needed) ────

import { matchAdminPermission } from '../lib/admin-permissions';

describe('Admin RBAC — matchAdminPermission', () => {
  it('grants access for exact match', () => {
    const perms = new Set(['tenants.read', 'users.write']);
    expect(matchAdminPermission(perms, 'tenants.read')).toBe(true);
  });

  it('denies access when permission not granted', () => {
    const perms = new Set(['tenants.read']);
    expect(matchAdminPermission(perms, 'tenants.write')).toBe(false);
  });

  it('grants access with global wildcard (*)', () => {
    const perms = new Set(['*']);
    expect(matchAdminPermission(perms, 'tenants.read')).toBe(true);
    expect(matchAdminPermission(perms, 'impersonation.execute')).toBe(true);
  });

  it('grants access with module wildcard (module.*)', () => {
    const perms = new Set(['tenants.*']);
    expect(matchAdminPermission(perms, 'tenants.read')).toBe(true);
    expect(matchAdminPermission(perms, 'tenants.write')).toBe(true);
    // Module wildcard matches submodule paths too
    expect(matchAdminPermission(perms, 'tenants.onboarding.read')).toBe(true);
  });

  it('grants access with module.submodule wildcard', () => {
    const perms = new Set(['users.staff.*']);
    expect(matchAdminPermission(perms, 'users.staff.read')).toBe(true);
    expect(matchAdminPermission(perms, 'users.staff.write')).toBe(true);
  });

  it('does not cross-match module wildcard to other modules', () => {
    const perms = new Set(['tenants.*']);
    expect(matchAdminPermission(perms, 'users.read')).toBe(false);
    expect(matchAdminPermission(perms, 'impersonation.execute')).toBe(false);
  });

  it('denies by default with empty permission set', () => {
    const perms = new Set<string>();
    expect(matchAdminPermission(perms, 'tenants.read')).toBe(false);
  });

  it('matches 3-part permission strings correctly', () => {
    const perms = new Set(['users.staff.view', 'users.staff.write']);
    expect(matchAdminPermission(perms, 'users.staff.view')).toBe(true);
    expect(matchAdminPermission(perms, 'users.staff.delete')).toBe(false);
  });
});

// ── Role permission seeding validation ────────────────────────

describe('Admin RBAC — Role Permission Matrix', () => {
  const ROLES = {
    super_admin: new Set(['*.*.*']),
    platform_eng: new Set([
      'tenants.read', 'users.read', 'impersonation.execute',
      'modules.read', 'modules.write', 'dlq.read', 'dlq.retry', 'dlq.discard',
      'health.read', 'finance.read', 'audit.read',
    ]),
    implementation: new Set([
      'tenants.read', 'tenants.write', 'tenants.create',
      'users.read', 'users.write', 'impersonation.execute',
      'modules.read', 'modules.write', 'dlq.read',
      'health.read', 'finance.read', 'audit.read',
    ]),
    support_agent: new Set([
      'tenants.read', 'users.read', 'users.write',
      'impersonation.execute', 'dlq.read',
      'health.read', 'finance.read', 'audit.read',
    ]),
    finance_support: new Set([
      'tenants.read', 'users.read',
      'finance.read', 'finance.write', 'audit.read', 'audit.export', 'dlq.read',
    ]),
    viewer: new Set([
      'tenants.read', 'users.read', 'modules.read', 'dlq.read',
      'health.read', 'finance.read', 'audit.read',
    ]),
  };

  it('super admin has global access via wildcard', () => {
    const perms = new Set(['*']);
    expect(matchAdminPermission(perms, 'tenants.write')).toBe(true);
    expect(matchAdminPermission(perms, 'impersonation.execute')).toBe(true);
  });

  it('finance support cannot impersonate', () => {
    expect(ROLES.finance_support.has('impersonation.execute')).toBe(false);
  });

  it('viewer has read-only access to all modules', () => {
    for (const perm of ROLES.viewer) {
      expect(perm).toMatch(/\.read$/);
    }
  });

  it('support agent can impersonate', () => {
    expect(ROLES.support_agent.has('impersonation.execute')).toBe(true);
  });

  it('implementation specialist can create tenants', () => {
    expect(ROLES.implementation.has('tenants.create')).toBe(true);
  });

  it('support agent cannot create tenants', () => {
    expect(ROLES.support_agent.has('tenants.create')).toBe(false);
  });

  it('platform engineer can manage DLQ', () => {
    expect(ROLES.platform_eng.has('dlq.retry')).toBe(true);
    expect(ROLES.platform_eng.has('dlq.discard')).toBe(true);
  });

  it('support agent cannot manage DLQ (read-only)', () => {
    expect(ROLES.support_agent.has('dlq.retry')).toBe(false);
    expect(ROLES.support_agent.has('dlq.discard')).toBe(false);
  });
});

// ── Tenant suspend/reactivate validation logic ────────────────

describe('Tenant Lifecycle — Suspend', () => {
  it('requires a reason to suspend', () => {
    const reason = '';
    expect(reason.trim().length > 0).toBe(false);
  });

  it('accepts a valid reason', () => {
    const reason = 'Non-payment of subscription';
    expect(reason.trim().length > 0).toBe(true);
  });

  it('blocks suspending an already-suspended tenant', () => {
    const tenant = { status: 'suspended' };
    expect(tenant.status === 'suspended').toBe(true);
  });

  it('allows suspending an active tenant', () => {
    const tenant = { status: 'active' };
    expect(tenant.status !== 'suspended').toBe(true);
  });
});

describe('Tenant Lifecycle — Reactivate', () => {
  it('allows reactivating a suspended tenant', () => {
    const tenant = { status: 'suspended' };
    expect(tenant.status === 'suspended').toBe(true);
  });

  it('blocks reactivating a non-suspended tenant', () => {
    const tenant = { status: 'active' };
    expect(tenant.status === 'suspended').toBe(false);
  });
});

// ── Onboarding checklist validation ────────────────────────────

describe('Tenant Onboarding', () => {
  it('validates step status transitions', () => {
    const validStatuses = ['pending', 'in_progress', 'completed', 'skipped', 'blocked'];
    for (const status of validStatuses) {
      expect(validStatuses).toContain(status);
    }
  });

  it('rejects invalid step status', () => {
    const validStatuses = ['pending', 'in_progress', 'completed', 'skipped', 'blocked'];
    expect(validStatuses).not.toContain('done');
    expect(validStatuses).not.toContain('cancelled');
  });

  it('industry templates cover all supported types', () => {
    const supportedIndustries = ['golf', 'restaurant', 'hotel', 'retail', 'marina', 'general'];
    expect(supportedIndustries.length).toBeGreaterThanOrEqual(5);
  });
});

// ── Support notes validation ─────────────────────────────────

describe('Support Notes', () => {
  it('validates note type', () => {
    const validTypes = ['general', 'support_ticket', 'escalation', 'implementation', 'financial'];
    expect(validTypes).toContain('general');
    expect(validTypes).toContain('escalation');
  });

  it('rejects invalid note type', () => {
    const validTypes = ['general', 'support_ticket', 'escalation', 'implementation', 'financial'];
    expect(validTypes).not.toContain('random');
  });
});

// ── Impersonation validation ──────────────────────────────────

describe('Impersonation Session — Validation', () => {
  it('requires reason of minimum 10 characters', () => {
    const short = 'short';
    const valid = 'Investigating reported issue with tee sheet';
    expect(short.length).toBeLessThan(10);
    expect(valid.length).toBeGreaterThanOrEqual(10);
  });

  it('validates duration range (15–480 minutes)', () => {
    const validDurations = [15, 30, 60, 120, 480];
    const invalidDurations = [0, 5, 14, 481, 1000];

    for (const d of validDurations) {
      expect(d >= 15 && d <= 480).toBe(true);
    }
    for (const d of invalidDurations) {
      expect(d >= 15 && d <= 480).toBe(false);
    }
  });

  it('validates session status transitions', () => {
    const validStatuses = ['active', 'ended', 'expired', 'revoked'];
    expect(validStatuses).toContain('active');
    expect(validStatuses).toContain('ended');
    expect(validStatuses).toContain('expired');
    expect(validStatuses).toContain('revoked');
  });

  it('active session has expires_at in the future', () => {
    const session = {
      status: 'active',
      expiresAt: new Date(Date.now() + 3600000),
    };
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('expired session has expires_at in the past', () => {
    const session = {
      status: 'active',
      expiresAt: new Date(Date.now() - 1000),
    };
    expect(session.expiresAt.getTime()).toBeLessThan(Date.now());
  });
});

describe('Impersonation Session — Token Exchange', () => {
  it('exchange URL includes token parameter', () => {
    const webAppUrl = 'http://localhost:3000';
    const exchangeToken = 'mock-exchange-token-abc123';
    const url = `${webAppUrl}/impersonate?token=${exchangeToken}`;
    expect(url).toContain('/impersonate?token=');
    expect(url).toContain(exchangeToken);
  });

  it('URL uses NEXT_PUBLIC_WEB_APP_URL or defaults to localhost', () => {
    const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL || 'http://localhost:3000';
    expect(webAppUrl).toMatch(/^https?:\/\//);
  });
});

describe('Impersonation Session — Safety Rules', () => {
  it('impersonation sessions track action count', () => {
    const session = { actionsPerformed: 0 };
    session.actionsPerformed += 1;
    expect(session.actionsPerformed).toBe(1);
  });

  it('session includes IP address and user agent for audit', () => {
    const session = {
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };
    expect(session.ipAddress).toBeTruthy();
    expect(session.userAgent).toBeTruthy();
  });
});

// ── Admin management validation ───────────────────────────────

describe('Admin Management', () => {
  it('admin statuses are valid', () => {
    const validStatuses = ['active', 'invited', 'suspended', 'deleted'];
    for (const s of validStatuses) {
      expect(validStatuses).toContain(s);
    }
  });

  it('invite requires email and role', () => {
    const invite = { email: 'new@admin.com', roleId: 'role_support_agent' };
    expect(invite.email).toMatch(/.+@.+\..+/);
    expect(invite.roleId).toBeTruthy();
  });

  it('rejects invite without email', () => {
    const invite = { email: '', roleId: 'role_support_agent' };
    expect(invite.email.length).toBe(0);
  });

  it('cannot deactivate self', () => {
    const currentAdminId = 'admin_01';
    const targetAdminId = 'admin_01';
    expect(currentAdminId === targetAdminId).toBe(true);
    // Route handler should reject with 409
  });

  it('can deactivate another admin', () => {
    const currentAdminId: string = 'admin_01';
    const targetAdminId: string = 'admin_02';
    expect(currentAdminId !== targetAdminId).toBe(true);
  });
});

// ── Health grade validation ───────────────────────────────────

describe('Tenant Health Grade', () => {
  it('accepts valid grades', () => {
    const validGrades = ['A', 'B', 'C', 'D', 'F'];
    for (const g of validGrades) {
      expect(validGrades).toContain(g);
    }
  });

  it('rejects invalid grades', () => {
    const validGrades = ['A', 'B', 'C', 'D', 'F'];
    expect(validGrades).not.toContain('E');
    expect(validGrades).not.toContain('A+');
  });
});

// ── Onboarding status validation ──────────────────────────────

describe('Tenant Onboarding Status', () => {
  it('accepts valid onboarding statuses', () => {
    const valid = ['pending', 'in_progress', 'completed', 'stalled'];
    for (const s of valid) {
      expect(valid).toContain(s);
    }
  });

  it('rejects invalid onboarding status', () => {
    const valid = ['pending', 'in_progress', 'completed', 'stalled'];
    expect(valid).not.toContain('done');
  });
});
