import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveSubDepartmentAccounts,
  resolvePaymentTypeAccounts,
  resolveTaxGroupAccount,
  logUnmappedEvent,
} from '../helpers/resolve-mapping';
import { saveSubDepartmentDefaults } from '../commands/save-sub-department-defaults';
import { saveTaxGroupDefaults } from '../commands/save-tax-group-defaults';
import type { RequestContext } from '@oppsera/core/auth/context';

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn() },
  withTenant: vi.fn(),
  sql: vi.fn((...args: any[]) => args),
  glAccounts: { id: 'id', tenantId: 'tenant_id' },
  subDepartmentGlDefaults: { tenantId: 'tenant_id', subDepartmentId: 'sub_department_id' },
  paymentTypeGlDefaults: { tenantId: 'tenant_id', paymentTypeId: 'payment_type_id' },
  taxGroupGlDefaults: { tenantId: 'tenant_id', taxGroupId: 'tax_group_id' },
  glClassifications: {},
  accountingSettings: {},
  glUnmappedEvents: {},
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

vi.mock('../helpers/ensure-accounting-settings', () => ({
  ensureAccountingSettings: vi.fn().mockResolvedValue({ created: false, autoWired: 0 }),
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

describe('resolveSubDepartmentAccounts', () => {
  it('should return mapping when found', async () => {
    const mockTx = {
      execute: vi.fn().mockResolvedValueOnce([{
        sub_department_id: 'subdept-1',
        revenue_account_id: 'acct-rev',
        cogs_account_id: 'acct-cogs',
        inventory_asset_account_id: 'acct-inv',
      }]),
    };

    const result = await resolveSubDepartmentAccounts(mockTx as any, 'tenant-1', 'subdept-1');

    expect(result).not.toBeNull();
    expect(result!.subDepartmentId).toBe('subdept-1');
    expect(result!.revenueAccountId).toBe('acct-rev');
    expect(result!.cogsAccountId).toBe('acct-cogs');
    expect(result!.inventoryAccountId).toBe('acct-inv');
  });

  it('should return null when not found', async () => {
    const mockTx = {
      execute: vi.fn().mockResolvedValueOnce([]),
    };

    const result = await resolveSubDepartmentAccounts(mockTx as any, 'tenant-1', 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('resolvePaymentTypeAccounts', () => {
  it('should return mapping when found', async () => {
    const mockTx = {
      execute: vi.fn().mockResolvedValueOnce([{
        payment_type_id: 'cash',
        cash_account_id: 'acct-cash',
        clearing_account_id: 'acct-clearing',
        fee_expense_account_id: null,
      }]),
    };

    const result = await resolvePaymentTypeAccounts(mockTx as any, 'tenant-1', 'cash');

    expect(result).not.toBeNull();
    expect(result!.paymentTypeId).toBe('cash');
    expect(result!.depositAccountId).toBe('acct-cash');
    expect(result!.clearingAccountId).toBe('acct-clearing');
    expect(result!.feeExpenseAccountId).toBeNull();
  });

  it('should return null when not found', async () => {
    const mockTx = {
      execute: vi.fn().mockResolvedValueOnce([]),
    };

    const result = await resolvePaymentTypeAccounts(mockTx as any, 'tenant-1', 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('resolveTaxGroupAccount', () => {
  it('should return account ID when found', async () => {
    const mockTx = {
      execute: vi.fn().mockResolvedValueOnce([{
        tax_payable_account_id: 'acct-tax',
      }]),
    };

    const result = await resolveTaxGroupAccount(mockTx as any, 'tenant-1', 'tax-group-1');
    expect(result).toBe('acct-tax');
  });

  it('should return null when not found', async () => {
    const mockTx = {
      execute: vi.fn().mockResolvedValueOnce([]),
    };

    const result = await resolveTaxGroupAccount(mockTx as any, 'tenant-1', 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('logUnmappedEvent', () => {
  it('should insert an unmapped event record', async () => {
    const mockTx = {
      execute: vi.fn().mockResolvedValueOnce([]),
    };

    await logUnmappedEvent(mockTx as any, 'tenant-1', {
      eventType: 'order.placed.v1',
      sourceModule: 'orders',
      sourceReferenceId: 'order-123',
      entityType: 'sub_department',
      entityId: 'subdept-1',
      reason: 'No GL mapping found for sub-department',
    });

    expect(mockTx.execute).toHaveBeenCalledTimes(1);
  });
});

describe('saveSubDepartmentDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new mapping when none exists', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    const newDefaults = {
      tenantId: 'tenant-1',
      subDepartmentId: 'subdept-1',
      revenueAccountId: 'acct-rev',
      cogsAccountId: null,
      inventoryAssetAccountId: null,
      discountAccountId: null,
      returnsAccountId: null,
    };

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]),  // no existing mapping
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([newDefaults]),
      };

      // For the inArray accounts validation: return the referenced account
      (mockTx.where as any)
        .mockResolvedValueOnce([{ id: 'acct-rev' }])  // accounts validation
        .mockReturnThis();  // subsequent calls chain normally

      // Re-mock select chain for the UPSERT existence check
      (mockTx.select as any).mockImplementation(() => {
        return mockTx;
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await saveSubDepartmentDefaults(ctx, 'subdept-1', {
      revenueAccountId: 'acct-rev',
    });

    expect(result).toBeDefined();
    expect(result.subDepartmentId).toBe('subdept-1');
    expect(result.revenueAccountId).toBe('acct-rev');
  });

  it('should reject invalid account references', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      let selectCallCount = 0;
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => {
          selectCallCount++;
          if (selectCallCount === 1) {
            // Account validation — returns empty (account not found)
            return Promise.resolve([]);
          }
          return mockTx;
        }),
        limit: vi.fn().mockReturnThis(),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(saveSubDepartmentDefaults(ctx, 'subdept-1', {
      revenueAccountId: 'nonexistent-acct',
    })).rejects.toThrow('not found');
  });
});

describe('saveTaxGroupDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new tax group mapping', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    const newDefaults = {
      tenantId: 'tenant-1',
      taxGroupId: 'tax-1',
      taxPayableAccountId: 'acct-tax-payable',
    };

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      let whereCallCount = 0;
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => {
          whereCallCount++;
          if (whereCallCount === 1) {
            // Account validation — account found
            return Promise.resolve([{ id: 'acct-tax-payable' }]);
          }
          // Existence check — chain continues
          return mockTx;
        }),
        limit: vi.fn().mockResolvedValueOnce([]),  // no existing mapping
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([newDefaults]),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await saveTaxGroupDefaults(ctx, 'tax-1', {
      taxPayableAccountId: 'acct-tax-payable',
    });

    expect(result).toBeDefined();
    expect(result.taxGroupId).toBe('tax-1');
    expect(result.taxPayableAccountId).toBe('acct-tax-payable');
  });
});
