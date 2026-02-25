import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGlAccount } from '../commands/create-gl-account';
import { updateGlAccount } from '../commands/update-gl-account';
import type { RequestContext } from '@oppsera/core/auth/context';

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn() },
  withTenant: vi.fn(),
  sql: vi.fn(),
  glAccounts: { id: 'id', tenantId: 'tenant_id', accountNumber: 'account_number' },
  glJournalEntries: { id: 'id', tenantId: 'tenant_id', status: 'status' },
  glJournalLines: { journalEntryId: 'journal_entry_id', accountId: 'account_id' },
  glClassifications: {},
  accountingSettings: {},
  glAccountChangeLogs: { id: 'id', tenantId: 'tenant_id', accountId: 'account_id' },
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

describe('createGlAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an account successfully', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    const newAccount = {
      id: 'acct-new',
      tenantId: 'tenant-1',
      accountNumber: '1010',
      name: 'Cash on Hand',
      accountType: 'asset',
      normalBalance: 'debit',
      classificationId: null,
      parentAccountId: null,
      isControlAccount: false,
      controlAccountType: null,
      allowManualPosting: true,
      description: null,
    };

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]),  // no duplicate
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([newAccount]),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await createGlAccount(ctx, {
      accountNumber: '1010',
      name: 'Cash on Hand',
      accountType: 'asset',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('acct-new');
    expect(result.accountNumber).toBe('1010');
    expect(result.name).toBe('Cash on Hand');
    expect(result.accountType).toBe('asset');
    expect(result.normalBalance).toBe('debit');
  });

  it('should reject duplicate accountNumber', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{ id: 'existing-acct' }]),  // duplicate found
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(createGlAccount(ctx, {
      accountNumber: '1010',
      name: 'Duplicate',
      accountType: 'asset',
    })).rejects.toThrow("Account number '1010' already exists");
  });

  it('should set normalBalance to debit for asset type', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    let insertedValues: any = null;

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn(function(this: any, vals: any) {
          // Only capture the first insert (account), not subsequent inserts (change log)
          if (insertedValues === null) insertedValues = vals;
          return this;
        }),
        returning: vi.fn().mockResolvedValueOnce([{
          id: 'acct-1', normalBalance: 'debit', accountType: 'asset',
        }]),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await createGlAccount(ctx, {
      accountNumber: '1000',
      name: 'Assets',
      accountType: 'asset',
    });

    expect(insertedValues).toBeDefined();
    expect(insertedValues.normalBalance).toBe('debit');
  });

  it('should set normalBalance to credit for revenue type', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    let insertedValues: any = null;

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn(function(this: any, vals: any) {
          if (insertedValues === null) insertedValues = vals;
          return this;
        }),
        returning: vi.fn().mockResolvedValueOnce([{
          id: 'acct-rev', normalBalance: 'credit', accountType: 'revenue',
        }]),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await createGlAccount(ctx, {
      accountNumber: '4000',
      name: 'Sales Revenue',
      accountType: 'revenue',
    });

    expect(insertedValues).toBeDefined();
    expect(insertedValues.normalBalance).toBe('credit');
  });
});

describe('updateGlAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update account successfully', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{
          id: 'acct-1',
          tenantId: 'tenant-1',
          accountNumber: '1010',
          name: 'Cash',
          accountType: 'asset',
          normalBalance: 'debit',
        }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([{
          id: 'acct-1',
          tenantId: 'tenant-1',
          accountNumber: '1010',
          name: 'Cash on Hand (Updated)',
          accountType: 'asset',
          normalBalance: 'debit',
        }]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        execute: vi.fn(),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await updateGlAccount(ctx, 'acct-1', { name: 'Cash on Hand (Updated)' });

    expect(result).toBeDefined();
    expect(result.name).toBe('Cash on Hand (Updated)');
  });

  it('should throw NotFoundError for non-existent account', async () => {
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
    await expect(updateGlAccount(ctx, 'nonexistent', { name: 'X' }))
      .rejects.toThrow('not found');
  });

  it('should block accountType change when posted journal lines exist', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{
          id: 'acct-1',
          tenantId: 'tenant-1',
          accountNumber: '1010',
          name: 'Cash',
          accountType: 'asset',
          normalBalance: 'debit',
        }]),
        execute: vi.fn().mockResolvedValueOnce([{ '?column?': 1 }]),  // posted lines exist
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn(),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(updateGlAccount(ctx, 'acct-1', { accountType: 'liability' }))
      .rejects.toThrow('Cannot change account type on an account with posted journal lines');
  });
});
