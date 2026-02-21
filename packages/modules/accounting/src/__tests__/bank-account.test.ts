import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveBankAccount } from '../commands/save-bank-account';
import { listBankAccounts } from '../queries/list-bank-accounts';
import type { RequestContext } from '@oppsera/core/auth/context';

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn() },
  withTenant: vi.fn(),
  sql: vi.fn((...args: any[]) => args),
  glAccounts: { id: 'id', tenantId: 'tenant_id' },
  bankAccounts: { id: 'id', tenantId: 'tenant_id', isDefault: 'is_default' },
  glClassifications: {},
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

describe('saveBankAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a bank account successfully', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    const newBankAccount = {
      id: 'ba-new',
      tenantId: 'tenant-1',
      name: 'Main Checking',
      glAccountId: 'acct-cash',
      accountNumberLast4: '4321',
      bankName: 'First National',
      isActive: true,
      isDefault: false,
    };

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{ id: 'acct-cash' }]),  // GL account exists
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([newBankAccount]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await saveBankAccount(ctx, {
      name: 'Main Checking',
      glAccountId: 'acct-cash',
      accountNumberLast4: '4321',
      bankName: 'First National',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('ba-new');
    expect(result.name).toBe('Main Checking');
    expect(result.glAccountId).toBe('acct-cash');
  });

  it('should update an existing bank account', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    const updatedBankAccount = {
      id: 'ba-1',
      tenantId: 'tenant-1',
      name: 'Main Checking Updated',
      glAccountId: 'acct-cash',
      isActive: true,
      isDefault: false,
    };

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      let limitCallCount = 0;
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() => {
          limitCallCount++;
          if (limitCallCount === 1) {
            // GL account validation
            return Promise.resolve([{ id: 'acct-cash' }]);
          }
          // Existing bank account lookup
          return Promise.resolve([{
            id: 'ba-1',
            tenantId: 'tenant-1',
            name: 'Main Checking',
            glAccountId: 'acct-cash',
          }]);
        }),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([updatedBankAccount]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await saveBankAccount(ctx, {
      id: 'ba-1',
      name: 'Main Checking Updated',
      glAccountId: 'acct-cash',
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Main Checking Updated');
  });

  it('should clear other defaults when setting isDefault', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    let updateCalled = false;

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{ id: 'acct-cash' }]),  // GL account exists
        update: vi.fn(function(this: any) {
          updateCalled = true;
          return this;
        }),
        set: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([{
          id: 'ba-new',
          tenantId: 'tenant-1',
          name: 'Primary Account',
          glAccountId: 'acct-cash',
          isDefault: true,
          isActive: true,
        }]),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await saveBankAccount(ctx, {
      name: 'Primary Account',
      glAccountId: 'acct-cash',
      isDefault: true,
    });

    expect(result.isDefault).toBe(true);
    // The update call clears other defaults before inserting the new one
    expect(updateCalled).toBe(true);
  });

  it('should reject when GL account does not exist', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]),  // GL account not found
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(saveBankAccount(ctx, {
      name: 'Bad Account',
      glAccountId: 'nonexistent-gl',
    })).rejects.toThrow('not found');
  });
});

describe('listBankAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return bank accounts list', async () => {
    const { withTenant } = await import('@oppsera/db');
    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = {
        execute: vi.fn().mockResolvedValueOnce([
          {
            id: 'ba-1',
            tenant_id: 'tenant-1',
            gl_account_id: 'acct-cash',
            account_number: '1010',
            account_name: 'Cash on Hand',
            bank_name: 'First National',
            bank_account_number: null,
            bank_routing_number: null,
            account_type: 'checking',
            is_active: true,
            last_reconciled_date: '2026-01-31',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-15T00:00:00Z',
          },
          {
            id: 'ba-2',
            tenant_id: 'tenant-1',
            gl_account_id: 'acct-savings',
            account_number: '1020',
            account_name: 'Savings',
            bank_name: 'First National',
            bank_account_number: null,
            bank_routing_number: null,
            account_type: 'savings',
            is_active: true,
            last_reconciled_date: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]),
      };
      return fn(mockTx);
    });

    const result = await listBankAccounts({ tenantId: 'tenant-1' });

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('ba-1');
    expect(result[0]!.accountNumber).toBe('1010');
    expect(result[0]!.bankName).toBe('First National');
    expect(result[0]!.isActive).toBe(true);
    expect(result[0]!.lastReconciledDate).toBe('2026-01-31');
    expect(result[1]!.lastReconciledDate).toBeNull();
  });
});
