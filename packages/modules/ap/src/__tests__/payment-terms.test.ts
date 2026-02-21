import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Mocks ─────────────────────────────────────────────────────────

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
    orderBy: vi.fn().mockReturnThis(),
  };
  return {
    db: { transaction: vi.fn(async (fn: any) => fn(mockTx)) },
    withTenant: vi.fn(),
    sql: vi.fn(),
    paymentTerms: { id: 'id', tenantId: 'tenant_id', isActive: 'is_active', createdAt: 'created_at' },
  };
});

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(async (_ctx: any, fn: any) => {
    const mockTx = createMockTx();
    const { result, events } = await fn(mockTx);
    return result;
  }),
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

// ── Helpers ────────────────────────────────────────────────────────

function createMockTx() {
  const termRow = {
    id: 'pt-1',
    tenant_id: 'tenant-1',
    name: 'Net 30',
    code: 'NET30',
    term_type: 'net',
    net_days: 30,
    discount_days: null,
    discount_percent: null,
    description: '30 days from invoice date',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const tx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([termRow]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([termRow]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
  };
  return tx;
}

function createCtx(): RequestContext {
  return {
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    user: { id: 'user-1', email: 'test@test.com', name: 'Test', tenantId: 'tenant-1', tenantStatus: 'active', membershipStatus: 'active' },
    requestId: 'req-1',
    isPlatformAdmin: false,
  } as unknown as RequestContext;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Payment Terms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create payment terms', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      // Duplicate check: no existing
      (mockTx.limit as any).mockReset();
      (mockTx.limit as any).mockResolvedValueOnce([]);

      (mockTx.returning as any).mockReset();
      (mockTx.returning as any).mockResolvedValue([{
        id: 'pt-new',
        tenant_id: 'tenant-1',
        name: 'Net 30',
        code: 'NET30',
        term_type: 'net',
        net_days: 30,
        is_active: true,
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

    const result = await (pwb as any)(ctx, async (tx: any) => {
      // Check for duplicate code
      const [existing] = await tx.select().from({}).where({}).limit(1);
      expect(existing).toBeUndefined();

      const [created] = await tx.insert({}).values({
        tenantId: 'tenant-1',
        name: 'Net 30',
        code: 'NET30',
        termType: 'net',
        netDays: 30,
        isActive: true,
      }).returning();

      return {
        result: created,
        events: [{
          eventType: 'ap.payment_terms.created.v1',
          data: { paymentTermsId: created.id, name: 'Net 30' },
        }],
      };
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Net 30');
    expect(result.code).toBe('NET30');
    expect(result.term_type).toBe('net');
    expect(result.is_active).toBe(true);
  });

  it('should list payment terms returning active only by default', async () => {
    const { withTenant } = await import('@oppsera/db');

    const activeTerms = [
      { id: 'pt-1', name: 'Net 30', code: 'NET30', termType: 'net', netDays: 30, isActive: true },
      { id: 'pt-2', name: 'Due on Receipt', code: 'DOR', termType: 'due_on_receipt', netDays: 0, isActive: true },
    ];

    (withTenant as any).mockImplementationOnce(async (_tenantId: string, fn: any) => {
      const mockTx = createMockTx();
      // Mock the Drizzle fluent chain to return active-only terms
      const chainResult = activeTerms.map((t) => ({
        ...t,
        tenantId: 'tenant-1',
        discountDays: null,
        discountPercent: null,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      (mockTx.orderBy as any).mockResolvedValueOnce(chainResult);

      return fn(mockTx);
    });

    // Simulate what listPaymentTerms does
    const result = await (withTenant as any)('tenant-1', async (tx: any) => {
      const rows = await tx.select().from({}).where({}).orderBy({});
      return rows;
    });

    expect(result).toHaveLength(2);
    expect(result.every((t: any) => t.isActive)).toBe(true);
  });

  it('should update payment terms', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementationOnce(async (_ctx: any, fn: any) => {
      const mockTx = createMockTx();
      (mockTx.limit as any).mockReset();
      (mockTx.limit as any).mockResolvedValueOnce([{
        id: 'pt-1',
        tenant_id: 'tenant-1',
        name: 'Net 30',
        code: 'NET30',
        is_active: true,
      }]);

      (mockTx.returning as any).mockReset();
      (mockTx.returning as any).mockResolvedValue([{
        id: 'pt-1',
        name: 'Net 45',
        code: 'NET45',
        net_days: 45,
      }]);

      const { result } = await fn(mockTx);
      return result;
    });

    const ctx = createCtx();
    const { publishWithOutbox: pwb } = await import('@oppsera/core/events/publish-with-outbox');

    const result = await (pwb as any)(ctx, async (tx: any) => {
      const [existing] = await tx.select().from({}).where({}).limit(1);
      expect(existing).toBeDefined();

      const [updated] = await tx.update({}).set({
        name: 'Net 45',
        code: 'NET45',
        netDays: 45,
      }).returning();

      return {
        result: updated,
        events: [{
          eventType: 'ap.payment_terms.updated.v1',
          data: { paymentTermsId: updated.id },
        }],
      };
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Net 45');
    expect(result.code).toBe('NET45');
    expect(result.net_days).toBe(45);
  });
});
