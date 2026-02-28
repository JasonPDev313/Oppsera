import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────

const {
  mockExecute,
  mockInsert,
  mockAdminInsert,
  mockAdminExecute,
} = vi.hoisted(() => ({
  mockExecute: vi.fn().mockResolvedValue([]),
  mockInsert: vi.fn(),
  mockAdminInsert: vi.fn(),
  mockAdminExecute: vi.fn().mockResolvedValue([]),
}));

// Default insert chain: insert().values()
mockInsert.mockReturnValue({
  values: vi.fn().mockResolvedValue(undefined),
});

mockAdminInsert.mockReturnValue({
  values: vi.fn().mockResolvedValue(undefined),
});

vi.mock('@oppsera/db', () => ({
  db: {
    execute: mockExecute,
    insert: mockInsert,
    query: {},
  },
  createAdminClient: vi.fn(() => ({
    execute: mockAdminExecute,
    insert: mockAdminInsert,
  })),
  auditLog: {
    id: 'auditLog.id',
    tenantId: 'auditLog.tenantId',
    locationId: 'auditLog.locationId',
    actorUserId: 'auditLog.actorUserId',
    actorType: 'auditLog.actorType',
    action: 'auditLog.action',
    entityType: 'auditLog.entityType',
    entityId: 'auditLog.entityId',
    changes: 'auditLog.changes',
    metadata: 'auditLog.metadata',
    createdAt: 'auditLog.createdAt',
  },
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((str: string) => str),
  }),
  schema: {},
  isBreakerOpen: vi.fn().mockReturnValue(false),
  guardedQuery: vi.fn().mockImplementation((_op: string, fn: () => Promise<unknown>) => fn()),
  singleFlight: vi.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
  jitterTtl: vi.fn().mockImplementation((base: number) => base),
  jitterTtlMs: vi.fn().mockImplementation((base: number) => base),
  isPoolExhaustion: vi.fn().mockReturnValue(false),
  getPoolGuardStats: vi.fn().mockReturnValue({ tripped: 0, queries: 0 }),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((str: string) => str),
  }),
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST_001'),
}));

vi.mock('../../auth/supabase-client', () => ({
  createSupabaseAdmin: vi.fn(),
  createSupabaseClient: vi.fn(),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import type { RequestContext } from '../../auth/context';
import { DrizzleAuditLogger } from '../audit-logger';
import { auditLog, auditLogSystem } from '../helpers';
import { computeChanges } from '../diff';
import { setAuditLogger, getAuditLogger } from '../index';
import type { AuditLogger } from '../index';

// ── Test Data ─────────────────────────────────────────────────────

const TENANT_A = 'tnt_TENANT_A';
const USER_ID = 'usr_01TEST';
const LOCATION_ID = 'loc_01TEST';
const REQUEST_ID = 'req_01TEST';

function makeCtx(overrides?: Partial<RequestContext>): RequestContext {
  return {
    user: {
      id: USER_ID,
      email: 'test@test.com',
      name: 'Test User',
      tenantId: TENANT_A,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    tenantId: TENANT_A,
    requestId: REQUEST_ID,
    isPlatformAdmin: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('Audit Logging', () => {
  let logger: DrizzleAuditLogger;
  let mockLogger: AuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new DrizzleAuditLogger();

    // Create a mock logger for helper tests
    mockLogger = {
      log: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ entries: [], cursor: undefined }),
    };
    setAuditLogger(mockLogger);
  });

  // ── Test 1: auditLog writes to audit_log table ─────────────────

  describe('auditLog helper', () => {
    it('writes entry with correct tenant, action, entity from context', async () => {
      const ctx = makeCtx();
      await auditLog(ctx, 'test.action', 'test_entity', 'entity_123');

      expect(mockLogger.log).toHaveBeenCalledWith({
        tenantId: TENANT_A,
        locationId: undefined,
        actorUserId: USER_ID,
        actorType: 'user',
        action: 'test.action',
        entityType: 'test_entity',
        entityId: 'entity_123',
        changes: undefined,
        metadata: {
          requestId: REQUEST_ID,
        },
      });
    });

    // ── Test 2: auditLog records changes ─────────────────────────

    it('records changes in the audit entry', async () => {
      const ctx = makeCtx();
      const changes = { name: { old: 'A', new: 'B' } };
      await auditLog(ctx, 'item.updated', 'catalog_item', 'item_123', changes);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { name: { old: 'A', new: 'B' } },
        }),
      );
    });

    // ── Test 3: auditLog records metadata from context ───────────

    it('records requestId in metadata', async () => {
      const ctx = makeCtx();
      await auditLog(ctx, 'test.action', 'test_entity', 'entity_123');

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            requestId: REQUEST_ID,
          }),
        }),
      );
    });

    it('includes locationId when present in context', async () => {
      const ctx = makeCtx({ locationId: LOCATION_ID });
      await auditLog(ctx, 'test.action', 'test_entity', 'entity_123');

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: LOCATION_ID,
        }),
      );
    });
  });

  // ── Test 4: auditLogSystem writes with actorType 'system' ─────

  describe('auditLogSystem helper', () => {
    it('writes with actorType system and no actorUserId', async () => {
      await auditLogSystem(TENANT_A, 'system.action', 'entity', 'id_123');

      expect(mockLogger.log).toHaveBeenCalledWith({
        tenantId: TENANT_A,
        actorType: 'system',
        action: 'system.action',
        entityType: 'entity',
        entityId: 'id_123',
        metadata: undefined,
      });
    });

    it('includes metadata when provided', async () => {
      await auditLogSystem(TENANT_A, 'system.action', 'entity', 'id_123', {
        source: 'worker',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { source: 'worker' },
        }),
      );
    });
  });

  // ── Tests 5-7: computeChanges ──────────────────────────────────

  describe('computeChanges', () => {
    it('detects changed fields', () => {
      const old = { name: 'A', price: 10 };
      const updated = { name: 'B', price: 10 };
      const result = computeChanges(old, updated);
      expect(result).toEqual({ name: { old: 'A', new: 'B' } });
    });

    it('returns undefined when no changes', () => {
      const obj = { name: 'A', price: 10 };
      const result = computeChanges(obj, { ...obj });
      expect(result).toBeUndefined();
    });

    it('ignores specified fields by default', () => {
      const old = { name: 'A', updatedAt: '2026-01-01' };
      const updated = { name: 'A', updatedAt: '2026-02-01' };
      const result = computeChanges(old, updated);
      expect(result).toBeUndefined();
    });

    it('detects nested object changes', () => {
      const old = { settings: { theme: 'light' } };
      const updated = { settings: { theme: 'dark' } };
      const result = computeChanges(old, updated);
      expect(result).toEqual({
        settings: {
          old: { theme: 'light' },
          new: { theme: 'dark' },
        },
      });
    });

    it('allows custom ignoreFields', () => {
      const old = { name: 'A', version: 1 };
      const updated = { name: 'A', version: 2 };
      const result = computeChanges(old, updated, ['version']);
      expect(result).toBeUndefined();
    });

    it('detects array changes', () => {
      const old = { tags: ['a', 'b'] };
      const updated = { tags: ['a', 'c'] };
      const result = computeChanges(old, updated);
      expect(result).toEqual({
        tags: { old: ['a', 'b'], new: ['a', 'c'] },
      });
    });
  });

  // ── Tests 8-12: DrizzleAuditLogger ─────────────────────────────

  describe('DrizzleAuditLogger', () => {
    describe('log', () => {
      it('inserts via normal db for user actor type', async () => {
        await logger.log({
          tenantId: TENANT_A,
          actorUserId: USER_ID,
          actorType: 'user',
          action: 'role.created',
          entityType: 'role',
          entityId: 'role_123',
        });

        expect(mockInsert).toHaveBeenCalled();
        expect(mockAdminInsert).not.toHaveBeenCalled();
      });

      it('inserts via admin client for system actor type', async () => {
        await logger.log({
          tenantId: TENANT_A,
          actorType: 'system',
          action: 'system.cleanup',
          entityType: 'partition',
          entityId: 'audit_log_2025_01',
        });

        expect(mockAdminInsert).toHaveBeenCalled();
      });

      it('inserts via admin client for api_key actor type', async () => {
        await logger.log({
          tenantId: TENANT_A,
          actorType: 'api_key',
          action: 'api.access',
          entityType: 'resource',
          entityId: 'res_123',
        });

        expect(mockAdminInsert).toHaveBeenCalled();
      });

      it('does not throw on insert failure', async () => {
        mockInsert.mockReturnValueOnce({
          values: vi.fn().mockRejectedValue(new Error('DB error')),
        });

        await expect(
          logger.log({
            tenantId: TENANT_A,
            actorType: 'user',
            action: 'test',
            entityType: 'test',
            entityId: 'test',
          }),
        ).resolves.toBeUndefined();
      });
    });

    describe('query', () => {
      it('filters by tenant', async () => {
        const now = new Date();
        mockExecute.mockResolvedValueOnce([
          {
            id: 'audit_001',
            tenant_id: TENANT_A,
            location_id: null,
            actor_user_id: USER_ID,
            actor_type: 'user',
            action: 'role.created',
            entity_type: 'role',
            entity_id: 'role_001',
            changes: null,
            metadata: null,
            created_at: now,
          },
        ]);

        const result = await logger.query(TENANT_A, {});
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0]!.tenantId).toBe(TENANT_A);
      });

      it('filters by entity type', async () => {
        mockExecute.mockResolvedValueOnce([]);

        await logger.query(TENANT_A, { entityType: 'order' });

        const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
        expect(sqlArg).toContain('entity_type');
      });

      it('filters by date range', async () => {
        mockExecute.mockResolvedValueOnce([]);

        await logger.query(TENANT_A, {
          from: new Date('2026-01-01'),
          to: new Date('2026-02-01'),
        });

        const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
        expect(sqlArg).toContain('created_at >=');
        expect(sqlArg).toContain('created_at <');
      });

      it('supports cursor pagination', async () => {
        const dates = Array.from({ length: 4 }, (_, i) => {
          const d = new Date('2026-02-01');
          d.setHours(d.getHours() + i);
          return d;
        });

        // First query: return 4 rows (limit=3, so hasMore=true)
        mockExecute.mockResolvedValueOnce(
          dates.map((d, i) => ({
            id: `audit_${String(i).padStart(3, '0')}`,
            tenant_id: TENANT_A,
            location_id: null,
            actor_user_id: USER_ID,
            actor_type: 'user',
            action: 'test.action',
            entity_type: 'test',
            entity_id: `entity_${i}`,
            changes: null,
            metadata: null,
            created_at: d,
          })),
        );

        const page1 = await logger.query(TENANT_A, { limit: 3 });
        expect(page1.entries).toHaveLength(3);
        expect(page1.cursor).toBeDefined();

        // Second query with cursor
        mockExecute.mockResolvedValueOnce([]);
        const page2 = await logger.query(TENANT_A, {
          limit: 3,
          cursor: page1.cursor,
        });
        expect(page2.entries).toHaveLength(0);
        expect(page2.cursor).toBeUndefined();
      });

      it('filters by action', async () => {
        mockExecute.mockResolvedValueOnce([]);

        await logger.query(TENANT_A, { action: 'catalog.item.created' });

        const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
        expect(sqlArg).toContain('action');
      });

      it('filters by actorUserId', async () => {
        mockExecute.mockResolvedValueOnce([]);

        await logger.query(TENANT_A, { actorUserId: USER_ID });

        const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
        expect(sqlArg).toContain('actor_user_id');
      });

      it('limits results to max 100', async () => {
        mockExecute.mockResolvedValueOnce([]);

        await logger.query(TENANT_A, { limit: 200 });

        const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
        expect(sqlArg).toContain('LIMIT');
        expect(sqlArg).toContain('101');
      });

      it('defaults limit to 50', async () => {
        mockExecute.mockResolvedValueOnce([]);

        await logger.query(TENANT_A, {});

        const sqlArg = JSON.stringify(mockExecute.mock.calls[0]);
        expect(sqlArg).toContain('LIMIT');
        expect(sqlArg).toContain('51');
      });
    });
  });

  // ── Test: getAuditLogger singleton ─────────────────────────────

  describe('getAuditLogger singleton', () => {
    it('returns the logger set via setAuditLogger', () => {
      const custom: AuditLogger = {
        log: vi.fn(),
        query: vi.fn(),
      };
      setAuditLogger(custom);
      expect(getAuditLogger()).toBe(custom);
    });
  });
});
