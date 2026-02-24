import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReturn } from '../commands/create-return';

vi.mock('@oppsera/db', () => ({
  orders: {},
  orderLines: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_a, _b) => ({ type: 'eq' })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  inArray: vi.fn((_a, _b) => ({ type: 'inArray' })),
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(async (_ctx: any, fn: any) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{}]),
    };
    return (await fn(mockTx)).result;
  }),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, type, data) => ({ type, data })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

vi.mock('../helpers/idempotency', () => ({
  checkIdempotency: vi.fn().mockResolvedValue({ isDuplicate: false }),
  saveIdempotencyKey: vi.fn(),
}));

vi.mock('../helpers/order-number', () => ({
  getNextOrderNumber: vi.fn().mockResolvedValue('RTN-001'),
}));

const baseCtx = {
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  user: { id: 'user-1', email: 'test@test.com', role: 'manager' },
  requestId: 'req-1',
};

describe('createReturn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject when no locationId', async () => {
    const ctx = { ...baseCtx, locationId: undefined } as any;

    await expect(
      createReturn(ctx, 'order-1', {
        clientRequestId: 'cr-1',
        returnLines: [{ originalLineId: 'line-1', qty: 1, reason: 'defective' }],
      }),
    ).rejects.toThrow('X-Location-Id header is required');
  });

  it('should create return order with negative amounts for partial return', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    const originalOrder = {
      id: 'order-1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      orderNumber: 'ORD-001',
      status: 'paid',
      customerId: 'cust-1',
      terminalId: 'term-1',
    };

    const originalLines = [
      {
        id: 'line-1',
        catalogItemId: 'item-1',
        catalogItemName: 'Widget A',
        catalogItemSku: 'WA-001',
        itemType: 'retail',
        qty: '2.0000',
        unitPrice: 1000,
        lineSubtotal: 2000,
        lineTax: 160,
        lineTotal: 2160,
        subDepartmentId: 'subdept-1',
        taxGroupId: 'tax-1',
        packageComponents: null,
      },
      {
        id: 'line-2',
        catalogItemId: 'item-2',
        catalogItemName: 'Widget B',
        catalogItemSku: 'WB-001',
        itemType: 'retail',
        qty: '3.0000',
        unitPrice: 500,
        lineSubtotal: 1500,
        lineTax: 120,
        lineTotal: 1620,
        subDepartmentId: 'subdept-2',
        taxGroupId: 'tax-1',
        packageComponents: null,
      },
    ];

    (publishWithOutbox as any).mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([originalOrder]) // fetch original order
          .mockResolvedValueOnce([originalLines[0]]), // fetch matching lines (only line-1 requested)
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{}]),
      };
      const result = await fn(mockTx);
      return result.result;
    });

    const result = await createReturn(baseCtx as any, 'order-1', {
      clientRequestId: 'cr-1',
      returnLines: [
        { originalLineId: 'line-1', qty: 1, reason: 'defective' },
      ],
    });

    expect(result.returnType).toBe('partial');
    expect(result.originalOrderId).toBe('order-1');
    expect(result.lines).toHaveLength(1);
    // Return 1 of 2 items at $10 each: subtotal = $10, tax = $0.80
    expect(result.lines[0].returnedSubtotal).toBe(1000);
    expect(result.lines[0].returnedTax).toBe(80);
    expect(result.lines[0].returnedTotal).toBe(1080);
  });

  it('should detect full return when all lines returned at full qty', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    const originalOrder = {
      id: 'order-1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      status: 'paid',
      customerId: null,
      terminalId: 'term-1',
    };

    const originalLines = [
      {
        id: 'line-1',
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        catalogItemSku: null,
        itemType: 'retail',
        qty: '1.0000',
        unitPrice: 2000,
        lineSubtotal: 2000,
        lineTax: 0,
        lineTotal: 2000,
        subDepartmentId: null,
        taxGroupId: null,
        packageComponents: null,
      },
    ];

    (publishWithOutbox as any).mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([originalOrder])
          .mockResolvedValueOnce(originalLines),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{}]),
      };
      return (await fn(mockTx)).result;
    });

    const result = await createReturn(baseCtx as any, 'order-1', {
      clientRequestId: 'cr-2',
      returnLines: [
        { originalLineId: 'line-1', qty: 1, reason: 'customer request' },
      ],
    });

    expect(result.returnType).toBe('full');
    expect(result.returnTotal).toBe(2000);
  });

  it('should reject return qty exceeding original qty', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    const originalOrder = {
      id: 'order-1',
      status: 'paid',
      customerId: null,
      terminalId: null,
    };

    const originalLines = [
      {
        id: 'line-1',
        catalogItemId: 'item-1',
        catalogItemName: 'Widget',
        catalogItemSku: null,
        itemType: 'retail',
        qty: '2.0000',
        unitPrice: 1000,
        lineSubtotal: 2000,
        lineTax: 0,
        lineTotal: 2000,
        subDepartmentId: null,
        taxGroupId: null,
        packageComponents: null,
      },
    ];

    (publishWithOutbox as any).mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([originalOrder])
          .mockResolvedValueOnce(originalLines),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{}]),
      };
      return (await fn(mockTx)).result;
    });

    await expect(
      createReturn(baseCtx as any, 'order-1', {
        clientRequestId: 'cr-3',
        returnLines: [
          { originalLineId: 'line-1', qty: 5, reason: 'defective' },
        ],
      }),
    ).rejects.toThrow('exceeds original qty');
  });

  it('should reject return on non-paid order', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn()
          .mockResolvedValueOnce([{ id: 'order-1', status: 'open' }]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{}]),
      };
      return (await fn(mockTx)).result;
    });

    await expect(
      createReturn(baseCtx as any, 'order-1', {
        clientRequestId: 'cr-4',
        returnLines: [
          { originalLineId: 'line-1', qty: 1, reason: 'defective' },
        ],
      }),
    ).rejects.toThrow("must be 'paid' to return");
  });

  it('should reject return on non-existent order', async () => {
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (publishWithOutbox as any).mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce([]), // no order
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{}]),
      };
      return (await fn(mockTx)).result;
    });

    await expect(
      createReturn(baseCtx as any, 'order-1', {
        clientRequestId: 'cr-5',
        returnLines: [
          { originalLineId: 'line-1', qty: 1, reason: 'defective' },
        ],
      }),
    ).rejects.toThrow('not found');
  });

  it('should be idempotent', async () => {
    const { checkIdempotency } = await import('../helpers/idempotency');
    const { publishWithOutbox } = await import('@oppsera/core/events/publish-with-outbox');

    (checkIdempotency as any).mockResolvedValueOnce({
      isDuplicate: true,
      originalResult: { returnOrderId: 'existing-return' },
    });

    (publishWithOutbox as any).mockImplementation(async (_ctx: any, fn: any) => {
      const mockTx = {};
      return (await fn(mockTx)).result;
    });

    const result = await createReturn(baseCtx as any, 'order-1', {
      clientRequestId: 'cr-dup',
      returnLines: [{ originalLineId: 'line-1', qty: 1, reason: 'test' }],
    });

    expect(result.returnOrderId).toBe('existing-return');
  });
});
