import { describe, it, expect, vi, beforeEach } from 'vitest';
import { voidJournalEntry } from '../commands/void-journal-entry';
import type { RequestContext } from '@oppsera/core/auth/context';

vi.mock('@oppsera/db', () => ({
  db: { transaction: vi.fn() },
  withTenant: vi.fn(),
  sql: vi.fn(),
  glJournalEntries: { id: 'id', tenantId: 'tenant_id' },
  glJournalLines: { journalEntryId: 'journal_entry_id' },
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
  })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

vi.mock('../helpers/generate-journal-number', () => ({
  generateJournalNumber: vi.fn().mockResolvedValue(2),
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

describe('voidJournalEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should void a posted entry and create reversal', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{
          id: 'je-1',
          tenantId: 'tenant-1',
          journalNumber: 1,
          sourceModule: 'manual',
          sourceReferenceId: null,
          businessDate: '2026-01-15',
          postingPeriod: '2026-01',
          currency: 'USD',
          status: 'posted',
          memo: 'Original entry',
          createdBy: 'user-1',
        }]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn()
          .mockResolvedValueOnce([{
            id: 'je-reversal',
            status: 'posted',
            journalNumber: 2,
            reversalOfId: 'je-1',
          }])
          .mockResolvedValueOnce([{ id: 'jl-rev-1', debitAmount: '0', creditAmount: '100.00' }])
          .mockResolvedValueOnce([{ id: 'jl-rev-2', debitAmount: '100.00', creditAmount: '0' }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn(),
        orderBy: vi.fn().mockReturnThis(),
      };

      // Lines query: second where call returns lines
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function(this: any) {
        whereCallCount++;
        if (whereCallCount === 2) {
          // Lines query
          return Promise.resolve([
            { id: 'jl-1', accountId: 'acct-1', debitAmount: '100.00', creditAmount: '0', locationId: null, departmentId: null, customerId: null, vendorId: null, memo: null },
            { id: 'jl-2', accountId: 'acct-2', debitAmount: '0', creditAmount: '100.00', locationId: null, departmentId: null, customerId: null, vendorId: null, memo: null },
          ]);
        }
        return this;
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await voidJournalEntry(ctx, 'je-1', 'Error correction');

    expect(result).toBeDefined();
    expect(result.voidedEntry.status).toBe('voided');
    expect(result.reversalEntry).toBeDefined();
    expect(result.reversalEntry.id).toBe('je-reversal');
  });

  it('should reject voiding a non-posted entry', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{
          id: 'je-draft',
          tenantId: 'tenant-1',
          status: 'draft',
        }]),
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(voidJournalEntry(ctx, 'je-draft', 'test'))
      .rejects.toThrow('Only posted entries can be voided');
  });

  it('should reject voiding a non-existent entry', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]), // Not found
      };
      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await expect(voidJournalEntry(ctx, 'nonexistent', 'test'))
      .rejects.toThrow('not found');
  });

  it('reversal entry should have swapped debits and credits', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    let insertedValues: any[] = [];

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([{
          id: 'je-1',
          tenantId: 'tenant-1',
          journalNumber: 1,
          sourceModule: 'manual',
          sourceReferenceId: null,
          businessDate: '2026-01-15',
          postingPeriod: '2026-01',
          currency: 'USD',
          status: 'posted',
          memo: 'Original',
          createdBy: 'user-1',
        }]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn(function(this: any, vals: any) {
          insertedValues.push(vals);
          return this;
        }),
        returning: vi.fn()
          .mockResolvedValueOnce([{ id: 'je-rev', status: 'posted' }])  // reversal entry
          .mockResolvedValueOnce([{ id: 'jl-rev-1', debitAmount: '0', creditAmount: '200.00' }])
          .mockResolvedValueOnce([{ id: 'jl-rev-2', debitAmount: '200.00', creditAmount: '0' }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn(),
      };

      let whereCount = 0;
      (mockTx.where as any).mockImplementation(function(this: any) {
        whereCount++;
        if (whereCount === 2) {
          return Promise.resolve([
            { id: 'jl-1', accountId: 'acct-cash', debitAmount: '200.00', creditAmount: '0', locationId: null, departmentId: null, customerId: null, vendorId: null, memo: 'Cash' },
            { id: 'jl-2', accountId: 'acct-rev', debitAmount: '0', creditAmount: '200.00', locationId: null, departmentId: null, customerId: null, vendorId: null, memo: 'Revenue' },
          ]);
        }
        return this;
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    await voidJournalEntry(ctx, 'je-1', 'Correction');

    // Check the reversal line inserts have swapped amounts
    // insertedValues[0] = reversal entry header
    // insertedValues[1] = first reversed line
    // insertedValues[2] = second reversed line
    const reversedLine1 = insertedValues[1];
    const reversedLine2 = insertedValues[2];

    // Original: debit=200, credit=0 → Reversal: debit=0, credit=200
    expect(reversedLine1.debitAmount).toBe('0');
    expect(reversedLine1.creditAmount).toBe('200.00');

    // Original: debit=0, credit=200 → Reversal: debit=200, credit=0
    expect(reversedLine2.debitAmount).toBe('200.00');
    expect(reversedLine2.creditAmount).toBe('0');
  });
});
