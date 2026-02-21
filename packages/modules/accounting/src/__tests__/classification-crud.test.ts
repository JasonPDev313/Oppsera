import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGlClassification } from '../commands/create-gl-classification';
import { updateGlClassification } from '../commands/update-gl-classification';
import type { RequestContext } from '@oppsera/core/auth/context';

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn() },
  withTenant: vi.fn(),
  sql: vi.fn(),
  glClassifications: { id: 'id', tenantId: 'tenant_id', name: 'name' },
  glAccounts: {},
  accountingSettings: {},
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, eventType, data) => ({
    eventId: 'evt-1',
    eventType,
    data,
    tenantId: 'tenant-1',
    occurredAt: new Date().toISOString(),
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
  NotFoundError: class extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) { super(`${entity} ${id ?? ''} not found`); }
  },
  AppError: class extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, status = 400) {
      super(message);
      this.code = code;
      this.statusCode = status;
    }
  },
  ConflictError: class extends Error {
    code = 'CONFLICT';
    statusCode = 409;
    constructor(message: string) { super(message); }
  },
}));

function createCtx(): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
  } as unknown as RequestContext;
}

describe('createGlClassification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a classification successfully', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    const newClassification = {
      id: 'cls-new',
      tenantId: 'tenant-1',
      name: 'Cash & Bank',
      accountType: 'asset',
      sortOrder: 10,
    };

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]),  // no duplicate
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([newClassification]),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await createGlClassification(ctx, {
      name: 'Cash & Bank',
      accountType: 'asset',
      sortOrder: 10,
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('cls-new');
    expect(result.name).toBe('Cash & Bank');
    expect(result.accountType).toBe('asset');
  });

  it('should reject duplicate name per tenant', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{ id: 'existing-cls' }]),  // duplicate found
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(createGlClassification(ctx, {
      name: 'Cash & Bank',
      accountType: 'asset',
    })).rejects.toThrow("Classification name 'Cash & Bank' already exists");
  });
});

describe('updateGlClassification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update classification successfully', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      let limitCallCount = 0;
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() => {
          limitCallCount++;
          if (limitCallCount === 1) {
            // Load existing classification
            return Promise.resolve([{
              id: 'cls-1',
              tenantId: 'tenant-1',
              name: 'Cash & Bank',
              accountType: 'asset',
              sortOrder: 10,
            }]);
          }
          // Name uniqueness check — no duplicate
          return Promise.resolve([]);
        }),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([{
          id: 'cls-1',
          tenantId: 'tenant-1',
          name: 'Cash & Bank Accounts',
          accountType: 'asset',
          sortOrder: 10,
        }]),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await updateGlClassification(ctx, 'cls-1', { name: 'Cash & Bank Accounts' });

    expect(result).toBeDefined();
    expect(result.name).toBe('Cash & Bank Accounts');
  });

  it('should throw NotFoundError for non-existent classification', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]),  // not found
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(updateGlClassification(ctx, 'nonexistent', { name: 'X' }))
      .rejects.toThrow('not found');
  });

  it('should reject duplicate name when renaming', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      let limitCallCount = 0;
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() => {
          limitCallCount++;
          if (limitCallCount === 1) {
            // Load existing
            return Promise.resolve([{
              id: 'cls-1',
              tenantId: 'tenant-1',
              name: 'Cash & Bank',
              accountType: 'asset',
              sortOrder: 10,
            }]);
          }
          // Name uniqueness check — duplicate found
          return Promise.resolve([{ id: 'cls-other' }]);
        }),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(updateGlClassification(ctx, 'cls-1', { name: 'Payables' }))
      .rejects.toThrow("Classification name 'Payables' already exists");
  });
});
