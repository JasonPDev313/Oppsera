import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postJournalEntry } from '../commands/post-journal-entry';
import { postDraftEntry } from '../commands/post-draft-entry';
import type { RequestContext } from '@oppsera/core/auth/context';

// Mock dependencies
vi.mock('@oppsera/db', () => {
  const mockTx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn(),
  };
  return {
    db: { transaction: vi.fn(async (fn: any) => fn(mockTx)) },
    withTenant: vi.fn(),
    sql: vi.fn(),
    glJournalEntries: { id: 'id', tenantId: 'tenant_id', sourceModule: 'source_module', sourceReferenceId: 'source_reference_id', status: 'status' },
    glJournalLines: { journalEntryId: 'journal_entry_id', accountId: 'account_id' },
    glAccounts: { id: 'id', tenantId: 'tenant_id', isActive: 'is_active' },
    accountingSettings: { tenantId: 'tenant_id' },
    glClassifications: {},
    glAccountTemplates: {},
    glClassificationTemplates: {},
    glUnmappedEvents: {},
    glJournalNumberCounters: {},
  };
});

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(async (_ctx: any, fn: any) => {
    const mockTx = createMockTx();
    const { result } = await fn(mockTx);
    return result;
  }),
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

vi.mock('../helpers/validate-journal', () => ({
  validateJournal: vi.fn().mockResolvedValue({
    postingPeriod: '2026-01',
    settings: {
      baseCurrency: 'USD',
      autoPostMode: 'auto_post',
      lockPeriodThrough: null,
      defaultRoundingAccountId: null,
      roundingToleranceCents: 5,
    },
    validatedLines: [
      { accountId: 'acct-1', debitAmount: '100.00', creditAmount: '0', debit: 100, credit: 0 },
      { accountId: 'acct-2', debitAmount: '0', creditAmount: '100.00', debit: 0, credit: 100 },
    ],
    roundingLine: null,
  }),
}));

vi.mock('../helpers/generate-journal-number', () => ({
  generateJournalNumber: vi.fn().mockResolvedValue(1),
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

function createMockTx() {
  const entryRow = {
    id: 'je-1',
    tenantId: 'tenant-1',
    journalNumber: 1,
    sourceModule: 'manual',
    sourceReferenceId: null,
    businessDate: '2026-01-15',
    postingPeriod: '2026-01',
    currency: 'USD',
    status: 'posted',
    memo: 'Test entry',
    postedAt: new Date(),
    createdBy: 'user-1',
    createdAt: new Date(),
  };

  const lineRow = {
    id: 'jl-1',
    journalEntryId: 'je-1',
    accountId: 'acct-1',
    debitAmount: '100.00',
    creditAmount: '0',
    locationId: null,
    departmentId: null,
    customerId: null,
    vendorId: null,
    memo: null,
    sortOrder: 0,
  };

  let selectCallCount = 0;
  const tx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => {
      selectCallCount++;
      // First select: idempotency check (return empty = no duplicate)
      if (selectCallCount === 1) return Promise.resolve([]);
      return Promise.resolve([entryRow]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn()
      .mockResolvedValueOnce([entryRow])       // journal entry insert
      .mockResolvedValueOnce([lineRow])          // first line
      .mockResolvedValueOnce([{ ...lineRow, id: 'jl-2', accountId: 'acct-2', debitAmount: '0', creditAmount: '100.00' }]), // second line
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([{ last_number: 1 }]),
  };
  return tx;
}

function createCtx(overrides?: Record<string, unknown>): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
    ...overrides,
  } as unknown as RequestContext;
}

describe('postJournalEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should post a balanced entry successfully', async () => {
    const ctx = createCtx();
    const input = {
      businessDate: '2026-01-15',
      sourceModule: 'manual',
      memo: 'Test balanced entry',
      lines: [
        { accountId: 'acct-1', debitAmount: '100.00', creditAmount: '0' },
        { accountId: 'acct-2', debitAmount: '0', creditAmount: '100.00' },
      ],
    };

    const result = await postJournalEntry(ctx, input);
    expect(result).toBeDefined();
    expect(result.id).toBe('je-1');
    expect(result.lines).toBeDefined();
  });

  it('should return existing entry for duplicate sourceReferenceId (idempotent)', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Override to return existing entry on idempotency check
      (mockTx.limit as any).mockReset();
      let callCount = 0;
      (mockTx.limit as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First: idempotency check returns existing entry
          return Promise.resolve([{
            id: 'existing-je',
            tenantId: 'tenant-1',
            sourceModule: 'pos',
            sourceReferenceId: 'ref-123',
            status: 'posted',
          }]);
        }
        return Promise.resolve([]);
      });
      // Override returning for lines fetch (the where after idempotency find)
      (mockTx.returning as any).mockResolvedValue([]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await postJournalEntry(ctx, {
      businessDate: '2026-01-15',
      sourceModule: 'pos',
      sourceReferenceId: 'ref-123',
      lines: [
        { accountId: 'acct-1', debitAmount: '50.00' },
        { accountId: 'acct-2', creditAmount: '50.00' },
      ],
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('existing-je');
  });

  it('should create draft when autoPostMode is draft_only', async () => {
    const { validateJournal } = await import('../helpers/validate-journal');
    (validateJournal as any).mockResolvedValueOnce({
      postingPeriod: '2026-01',
      settings: {
        baseCurrency: 'USD',
        autoPostMode: 'draft_only',
        lockPeriodThrough: null,
        defaultRoundingAccountId: null,
        roundingToleranceCents: 5,
      },
      validatedLines: [],
      roundingLine: null,
    });

    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.returning as any).mockReset();
      (mockTx.returning as any)
        .mockResolvedValueOnce([{ id: 'je-draft', status: 'draft', postedAt: null }])
        .mockResolvedValueOnce([{ id: 'jl-1' }])
        .mockResolvedValueOnce([{ id: 'jl-2' }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await postJournalEntry(ctx, {
      businessDate: '2026-01-15',
      sourceModule: 'manual',
      lines: [
        { accountId: 'acct-1', debitAmount: '100.00' },
        { accountId: 'acct-2', creditAmount: '100.00' },
      ],
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('draft');
  });

  it('should force-post even in draft_only mode', async () => {
    const { validateJournal } = await import('../helpers/validate-journal');
    (validateJournal as any).mockResolvedValueOnce({
      postingPeriod: '2026-01',
      settings: {
        baseCurrency: 'USD',
        autoPostMode: 'draft_only',
        lockPeriodThrough: null,
        defaultRoundingAccountId: null,
        roundingToleranceCents: 5,
      },
      validatedLines: [],
      roundingLine: null,
    });

    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');
    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.returning as any).mockReset();
      (mockTx.returning as any)
        .mockResolvedValueOnce([{ id: 'je-forced', status: 'posted', postedAt: new Date() }])
        .mockResolvedValueOnce([{ id: 'jl-1', debitAmount: '100.00' }])
        .mockResolvedValueOnce([{ id: 'jl-2', debitAmount: '0' }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await postJournalEntry(ctx, {
      businessDate: '2026-01-15',
      sourceModule: 'manual',
      forcePost: true,
      lines: [
        { accountId: 'acct-1', debitAmount: '100.00' },
        { accountId: 'acct-2', creditAmount: '100.00' },
      ],
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('posted');
  });
});

describe('postDraftEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should transition draft → posted', async () => {
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
            // Load draft entry
            return Promise.resolve([{
              id: 'je-draft',
              tenantId: 'tenant-1',
              status: 'draft',
              businessDate: '2026-01-15',
              sourceModule: 'manual',
              currency: 'USD',
              journalNumber: 5,
              sourceReferenceId: null,
            }]);
          }
          return Promise.resolve([]);
        }),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce([{
          id: 'je-draft',
          status: 'posted',
          postedAt: new Date(),
        }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn(),
        orderBy: vi.fn().mockReturnThis(),
      };

      // Override where to return lines for the second call (lines query has no .limit)
      let whereCallCount = 0;
      (mockTx.where as any).mockImplementation(function(this: any) {
        whereCallCount++;
        if (whereCallCount === 2) {
          // Lines query — returns array directly (no .limit)
          return [
            { accountId: 'acct-1', debitAmount: '100.00', creditAmount: '0' },
            { accountId: 'acct-2', debitAmount: '0', creditAmount: '100.00' },
          ];
        }
        return this;
      });

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const result = await postDraftEntry(ctx, 'je-draft');
    expect(result).toBeDefined();
    expect(result.status).toBe('posted');
  });
});
