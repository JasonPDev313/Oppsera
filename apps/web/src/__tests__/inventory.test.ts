import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock factories (vi.hoisted) ───────────────────────────────────────────────
const { mockExecute, mockInsert, mockSelect, mockUpdate, mockPublishWithOutbox, makeSelectChain } = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  return {
    makeSelectChain,
    mockExecute: vi.fn().mockResolvedValue([]),
    mockInsert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'MOV_001' }]),
      }),
    }),
    mockSelect: vi.fn(() => makeSelectChain()),
    mockUpdate: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    mockPublishWithOutbox: vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
        execute: mockExecute,
      };
      const result = await fn(tx);
      return (result as { result: unknown }).result;
    }),
  };
});

// ─── vi.mock calls ─────────────────────────────────────────────────────────────
vi.mock('@oppsera/db', () => ({
  db: { execute: mockExecute, select: mockSelect, insert: mockInsert, update: mockUpdate },
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, execute: mockExecute };
    return fn(tx);
  }),
  inventoryItems: { tenantId: 'tenant_id', id: 'id', locationId: 'location_id', catalogItemId: 'catalog_item_id', sku: 'sku', name: 'name', itemType: 'item_type', status: 'status', trackInventory: 'track_inventory', reorderPoint: 'reorder_point', reorderQuantity: 'reorder_quantity', parLevel: 'par_level', allowNegative: 'allow_negative', baseUnit: 'base_unit' },
  inventoryMovements: { tenantId: 'tenant_id', id: 'id', locationId: 'location_id', inventoryItemId: 'inventory_item_id', movementType: 'movement_type', quantityDelta: 'quantity_delta', unitCost: 'unit_cost', extendedCost: 'extended_cost', referenceType: 'reference_type', referenceId: 'reference_id', reason: 'reason', source: 'source', businessDate: 'business_date', batchId: 'batch_id', createdAt: 'created_at' },
  orderLines: { orderId: 'order_id', tenantId: 'tenant_id', catalogItemId: 'catalog_item_id', qty: 'qty', itemType: 'item_type', packageComponents: 'package_components' },
  locations: { tenantId: 'tenant_id', id: 'id', isActive: 'is_active' },
  sql: Object.assign(vi.fn((...args: unknown[]) => args), { raw: vi.fn((s: string) => s) }),
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: mockPublishWithOutbox,
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx: unknown, type: string, data: unknown) => ({ eventType: type, data })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'ULID_TEST'),
  AppError: class AppError extends Error { code: string; statusCode: number; constructor(code: string, msg: string, status: number) { super(msg); this.code = code; this.statusCode = status; } },
  NotFoundError: class NotFoundError extends Error { code = 'NOT_FOUND'; statusCode = 404; },
  ValidationError: class ValidationError extends Error { code = 'VALIDATION_ERROR'; statusCode = 400; details: unknown[]; constructor(msg: string, details: unknown[] = []) { super(msg); this.details = details; } },
  ConflictError: class ConflictError extends Error { code = 'CONFLICT'; statusCode = 409; },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((...args: unknown[]) => args),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), { raw: vi.fn((s: string) => s) }),
  sum: vi.fn((...args: unknown[]) => args),
  ilike: vi.fn((...args: unknown[]) => args),
}));

// ─── Environment ───────────────────────────────────────────────────────────────
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ─── Imports (after mocks) ─────────────────────────────────────────────────────
import {
  receiveInventorySchema,
  adjustInventorySchema,
  transferInventorySchema,
  recordShrinkSchema,
} from '@oppsera/module-inventory/validation';
import { receiveInventory } from '@oppsera/module-inventory/commands/receive-inventory';
import { adjustInventory } from '@oppsera/module-inventory/commands/adjust-inventory';
import { transferInventory } from '@oppsera/module-inventory/commands/transfer-inventory';
import { recordShrink } from '@oppsera/module-inventory/commands/record-shrink';
import { getOnHand } from '@oppsera/module-inventory/helpers/get-on-hand';
import { checkStockAlerts } from '@oppsera/module-inventory/helpers/stock-alerts';
import { findByCatalogItemId } from '@oppsera/module-inventory/helpers/find-by-catalog-item';
import { listInventoryItems } from '@oppsera/module-inventory/queries/list-inventory-items';
import { getMovements } from '@oppsera/module-inventory/queries/get-movements';
import { handleOrderPlaced, handleOrderVoided, handleCatalogItemCreated } from '@oppsera/module-inventory/events/consumers';
import { buildEventFromContext } from '@oppsera/core/events/build-event';

// ─── Test Data Factories ───────────────────────────────────────────────────────
function makeCtx(overrides = {}) {
  return {
    user: { id: 'USER_001', email: 'test@test.com', name: 'Test', tenantId: 'TNT_001', tenantStatus: 'active', membershipStatus: 'active' },
    tenantId: 'TNT_001',
    locationId: 'LOC_001',
    requestId: 'REQ_001',
    isPlatformAdmin: false,
    ...overrides,
  };
}

function makeInventoryItem(overrides = {}) {
  return {
    id: 'INV_001',
    tenantId: 'TNT_001',
    locationId: 'LOC_001',
    catalogItemId: 'CAT_001',
    sku: 'SKU-001',
    name: 'Test Item',
    itemType: 'retail',
    status: 'active',
    trackInventory: true,
    baseUnit: 'each',
    purchaseUnit: 'each',
    purchaseToBaseRatio: '1',
    costingMethod: 'fifo',
    standardCost: null,
    reorderPoint: '10',
    reorderQuantity: '50',
    parLevel: '100',
    allowNegative: false,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'USER_001',
    ...overrides,
  };
}

function makeMovement(overrides = {}) {
  return {
    id: 'MOV_001',
    tenantId: 'TNT_001',
    locationId: 'LOC_001',
    inventoryItemId: 'INV_001',
    movementType: 'receive',
    quantityDelta: '10',
    unitCost: '5.00',
    extendedCost: '50.00',
    referenceType: 'manual',
    referenceId: null,
    reason: 'Initial stock',
    source: 'manual',
    businessDate: '2024-01-15',
    employeeId: 'USER_001',
    terminalId: null,
    batchId: null,
    metadata: null,
    createdAt: new Date(),
    createdBy: 'USER_001',
    ...overrides,
  };
}

function makeEvent(overrides = {}): {
  eventId: string;
  eventType: string;
  occurredAt: string;
  tenantId: string;
  actorUserId?: string;
  idempotencyKey: string;
  data: Record<string, unknown>;
} {
  return {
    eventId: 'EVT_001',
    eventType: 'order.placed.v1',
    occurredAt: new Date().toISOString(),
    tenantId: 'TNT_001',
    actorUserId: 'USER_001',
    idempotencyKey: 'IDEM_001',
    data: {
      orderId: 'ORD_001',
      orderNumber: '0001',
      locationId: 'LOC_001',
      ...overrides,
    },
  };
}

// ─── Helper: reset mock chains after clearAllMocks ─────────────────────────────
function resetMockChains() {
  mockSelect.mockImplementation(() => makeSelectChain());
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'MOV_001' }]),
    }),
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('Inventory Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockChains();
  });

  // ── Validation Schemas ───────────────────────────────────────────────────────

  describe('receiveInventorySchema', () => {
    it('accepts valid receive input', () => {
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 25,
        unitCost: 3.50,
        businessDate: '2024-01-15',
        referenceType: 'manual' as const,
      };
      const result = receiveInventorySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(25);
        expect(result.data.inventoryItemId).toBe('INV_001');
        expect(result.data.businessDate).toBe('2024-01-15');
      }
    });

    it('rejects zero quantity', () => {
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 0,
        businessDate: '2024-01-15',
      };
      const result = receiveInventorySchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const quantityIssue = result.error.issues.find((i) => i.path.includes('quantity'));
        expect(quantityIssue).toBeDefined();
      }
    });

    it('defaults referenceType to manual', () => {
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 10,
        businessDate: '2024-01-15',
      };
      const result = receiveInventorySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.referenceType).toBe('manual');
      }
    });
  });

  describe('adjustInventorySchema', () => {
    it('accepts valid adjustment with negative delta', () => {
      const input = {
        inventoryItemId: 'INV_001',
        quantityDelta: -5,
        reason: 'Count correction',
        businessDate: '2024-01-15',
      };
      const result = adjustInventorySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantityDelta).toBe(-5);
        expect(result.data.reason).toBe('Count correction');
      }
    });

    it('requires reason for adjustments', () => {
      const input = {
        inventoryItemId: 'INV_001',
        quantityDelta: 5,
        businessDate: '2024-01-15',
      };
      const result = adjustInventorySchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        const reasonIssue = result.error.issues.find((i) => i.path.includes('reason'));
        expect(reasonIssue).toBeDefined();
      }
    });
  });

  describe('transferInventorySchema', () => {
    it('accepts valid transfer input', () => {
      const input = {
        catalogItemId: 'CAT_001',
        fromLocationId: 'LOC_001',
        toLocationId: 'LOC_002',
        quantity: 15,
        businessDate: '2024-01-15',
      };
      const result = transferInventorySchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(15);
        expect(result.data.fromLocationId).toBe('LOC_001');
        expect(result.data.toLocationId).toBe('LOC_002');
      }
    });

    it('requires positive quantity', () => {
      const zeroInput = {
        catalogItemId: 'CAT_001',
        fromLocationId: 'LOC_001',
        toLocationId: 'LOC_002',
        quantity: 0,
        businessDate: '2024-01-15',
      };
      const negInput = {
        ...zeroInput,
        quantity: -5,
      };
      const zeroResult = transferInventorySchema.safeParse(zeroInput);
      const negResult = transferInventorySchema.safeParse(negInput);
      expect(zeroResult.success).toBe(false);
      expect(negResult.success).toBe(false);
    });
  });

  describe('recordShrinkSchema', () => {
    it('accepts valid shrink input', () => {
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 3,
        shrinkType: 'waste' as const,
        reason: 'Expired product',
        businessDate: '2024-01-15',
      };
      const result = recordShrinkSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shrinkType).toBe('waste');
        expect(result.data.reason).toBe('Expired product');
      }
    });

    it('validates shrinkType enum', () => {
      const validTypes = ['waste', 'theft', 'damage', 'expiry', 'other'] as const;
      for (const shrinkType of validTypes) {
        const input = {
          inventoryItemId: 'INV_001',
          quantity: 1,
          shrinkType,
          reason: 'Test reason',
          businessDate: '2024-01-15',
        };
        expect(recordShrinkSchema.safeParse(input).success).toBe(true);
      }

      const invalidInput = {
        inventoryItemId: 'INV_001',
        quantity: 1,
        shrinkType: 'unknown_type',
        reason: 'Test reason',
        businessDate: '2024-01-15',
      };
      expect(recordShrinkSchema.safeParse(invalidInput).success).toBe(false);
    });
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  describe('getOnHand', () => {
    it('returns sum of movement deltas', async () => {
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '42' }]));

      const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, execute: mockExecute };
      const result = await getOnHand(tx, 'TNT_001', 'INV_001');

      expect(result).toBe(42);
      expect(mockSelect).toHaveBeenCalled();
    });

    it('returns 0 when no movements exist', async () => {
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '0' }]));

      const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, execute: mockExecute };
      const result = await getOnHand(tx, 'TNT_001', 'INV_001');

      expect(result).toBe(0);
    });
  });

  describe('checkStockAlerts', () => {
    it('returns negative stock event when on-hand < 0', () => {
      const ctx = makeCtx();
      const events = checkStockAlerts(ctx as any, {
        inventoryItemId: 'INV_001',
        catalogItemId: 'CAT_001',
        locationId: 'LOC_001',
        itemName: 'Test Item',
        currentOnHand: -5,
        reorderPoint: 10,
        reorderQuantity: 50,
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const negativeEvent = events.find((e: any) => e.eventType === 'inventory.negative.v1');
      expect(negativeEvent).toBeDefined();
      expect((negativeEvent as any).data.currentOnHand).toBe(-5);
    });

    it('returns low stock event when on-hand <= reorderPoint', () => {
      const ctx = makeCtx();
      const events = checkStockAlerts(ctx as any, {
        inventoryItemId: 'INV_001',
        catalogItemId: 'CAT_001',
        locationId: 'LOC_001',
        itemName: 'Test Item',
        currentOnHand: 8,
        reorderPoint: 10,
        reorderQuantity: 50,
      });

      expect(events.length).toBe(1);
      const lowStockEvent = events.find((e: any) => e.eventType === 'inventory.low_stock.v1');
      expect(lowStockEvent).toBeDefined();
      expect((lowStockEvent as any).data.currentOnHand).toBe(8);
      expect((lowStockEvent as any).data.reorderPoint).toBe(10);
    });

    it('returns no events when stock is healthy', () => {
      const ctx = makeCtx();
      const events = checkStockAlerts(ctx as any, {
        inventoryItemId: 'INV_001',
        catalogItemId: 'CAT_001',
        locationId: 'LOC_001',
        itemName: 'Test Item',
        currentOnHand: 50,
        reorderPoint: 10,
        reorderQuantity: 50,
      });

      expect(events).toHaveLength(0);
    });

    it('skips low stock check when reorderPoint is null', () => {
      const ctx = makeCtx();
      const events = checkStockAlerts(ctx as any, {
        inventoryItemId: 'INV_001',
        catalogItemId: 'CAT_001',
        locationId: 'LOC_001',
        itemName: 'Test Item',
        currentOnHand: 2,
        reorderPoint: null,
        reorderQuantity: null,
      });

      // on-hand is 2 (positive), reorderPoint is null => no low_stock event, no negative event
      expect(events).toHaveLength(0);
    });
  });

  describe('findByCatalogItemId', () => {
    it('returns inventory item when found', async () => {
      const item = makeInventoryItem();
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));

      const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, execute: mockExecute };
      const result = await findByCatalogItemId(tx, 'TNT_001', 'CAT_001', 'LOC_001');

      expect(result).toEqual(item);
      expect(result!.id).toBe('INV_001');
    });

    it('returns null when not found', async () => {
      mockSelect.mockImplementationOnce(() => makeSelectChain([]));

      const tx = { select: mockSelect, insert: mockInsert, update: mockUpdate, execute: mockExecute };
      const result = await findByCatalogItemId(tx, 'TNT_001', 'CAT_NONEXISTENT', 'LOC_001');

      expect(result).toBeNull();
    });
  });

  // ── Commands ─────────────────────────────────────────────────────────────────

  describe('receiveInventory', () => {
    it('creates a receive movement and returns updated on-hand', async () => {
      const item = makeInventoryItem();
      const movement = makeMovement();

      // Call 1: lookup inventory item => found
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      // Call 2: getOnHand SUM => 20
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '20' }]));
      // Insert returns the movement
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([movement]),
        }),
      });

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 10,
        unitCost: 5.0,
        businessDate: '2024-01-15',
        referenceType: 'manual' as const,
      };

      const result = await receiveInventory(ctx as any, input);

      expect(result).toBeDefined();
      expect(result.currentOnHand).toBe(20);
      expect(result.movement).toEqual(movement);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('throws NotFoundError for missing inventory item', async () => {
      // Lookup returns empty
      mockSelect.mockImplementationOnce(() => makeSelectChain([]));

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_MISSING',
        quantity: 10,
        businessDate: '2024-01-15',
      };

      await expect(receiveInventory(ctx as any, input)).rejects.toThrow();
    });

    it('throws ValidationError for inactive item', async () => {
      const inactiveItem = makeInventoryItem({ status: 'discontinued' });
      mockSelect.mockImplementationOnce(() => makeSelectChain([inactiveItem]));

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 10,
        businessDate: '2024-01-15',
      };

      await expect(receiveInventory(ctx as any, input)).rejects.toThrow(
        'Cannot receive inventory for inactive item',
      );
    });

    it('emits inventory.received.v1 event', async () => {
      const item = makeInventoryItem();
      const movement = makeMovement();

      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '10' }]));
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([movement]),
        }),
      });

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 10,
        unitCost: 5.0,
        businessDate: '2024-01-15',
      };

      await receiveInventory(ctx as any, input);

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        'inventory.received.v1',
        expect.objectContaining({
          inventoryItemId: 'INV_001',
          catalogItemId: 'CAT_001',
          locationId: 'LOC_001',
          quantity: 10,
          source: 'manual',
        }),
      );
    });
  });

  describe('adjustInventory', () => {
    it('creates an adjustment movement with positive delta', async () => {
      const item = makeInventoryItem();
      const movement = makeMovement({ movementType: 'adjustment', quantityDelta: '5' });

      // Call 1: lookup inventory item
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      // Call 2: getOnHand before => 20
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '20' }]));
      // Call 3: getOnHand after => 25
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '25' }]));
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([movement]),
        }),
      });

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantityDelta: 5,
        reason: 'Found extra stock',
        businessDate: '2024-01-15',
      };

      const result = await adjustInventory(ctx as any, input);

      expect(result).toBeDefined();
      expect(result.currentOnHand).toBe(25);
      expect(mockInsert).toHaveBeenCalled();
    });

    it('creates an adjustment movement with negative delta', async () => {
      const item = makeInventoryItem();
      const movement = makeMovement({ movementType: 'adjustment', quantityDelta: '-3' });

      // Call 1: lookup inventory item
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      // Call 2: getOnHand before => 20 (will be 20 + (-3) = 17, >= 0, passes check)
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '20' }]));
      // Call 3: getOnHand after => 17
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '17' }]));
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([movement]),
        }),
      });

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantityDelta: -3,
        reason: 'Count correction',
        businessDate: '2024-01-15',
      };

      const result = await adjustInventory(ctx as any, input);

      expect(result).toBeDefined();
      expect(result.currentOnHand).toBe(17);
    });

    it('throws when negative adjustment would cause negative stock and allowNegative is false', async () => {
      const item = makeInventoryItem({ allowNegative: false });

      // Call 1: lookup inventory item
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      // Call 2: getOnHand before => 3 (adjusting by -10 would go to -7)
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '3' }]));

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantityDelta: -10,
        reason: 'Count correction',
        businessDate: '2024-01-15',
      };

      await expect(adjustInventory(ctx as any, input)).rejects.toThrow(
        'Adjustment would result in negative inventory',
      );
    });

    it('allows negative stock when allowNegative is true', async () => {
      const item = makeInventoryItem({ allowNegative: true });
      const movement = makeMovement({ movementType: 'adjustment', quantityDelta: '-10' });

      // Call 1: lookup inventory item
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      // Call 2: getOnHand before => 3 (will be 3 + (-10) = -7, but allowNegative is true)
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '3' }]));
      // Call 3: getOnHand after => -7
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '-7' }]));
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([movement]),
        }),
      });

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantityDelta: -10,
        reason: 'Count correction',
        businessDate: '2024-01-15',
      };

      const result = await adjustInventory(ctx as any, input);

      expect(result).toBeDefined();
      expect(result.currentOnHand).toBe(-7);
    });
  });

  describe('transferInventory', () => {
    it('creates transfer_out and transfer_in movements', async () => {
      const sourceItem = makeInventoryItem({ id: 'INV_SRC', locationId: 'LOC_001' });
      const destItem = makeInventoryItem({ id: 'INV_DST', locationId: 'LOC_002' });
      const sourceMovement = makeMovement({ id: 'MOV_SRC', movementType: 'transfer_out', inventoryItemId: 'INV_SRC' });
      const destMovement = makeMovement({ id: 'MOV_DST', movementType: 'transfer_in', inventoryItemId: 'INV_DST' });

      // Call 1: findByCatalogItemId at source => sourceItem
      mockSelect.mockImplementationOnce(() => makeSelectChain([sourceItem]));
      // Call 2: findByCatalogItemId at dest => destItem
      mockSelect.mockImplementationOnce(() => makeSelectChain([destItem]));
      // Call 3: getOnHand at source before => 50
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '50' }]));
      // Call 4: getOnHand at source after => 40
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '40' }]));
      // Call 5: getOnHand at dest after => 10
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '10' }]));

      // Two inserts: transfer_out then transfer_in
      mockInsert
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([sourceMovement]),
          }),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([destMovement]),
          }),
        });

      const ctx = makeCtx();
      const input = {
        catalogItemId: 'CAT_001',
        fromLocationId: 'LOC_001',
        toLocationId: 'LOC_002',
        quantity: 10,
        businessDate: '2024-01-15',
      };

      const result = await transferInventory(ctx as any, input);

      expect(result).toBeDefined();
      expect(result.sourceMovement).toEqual(sourceMovement);
      expect(result.destMovement).toEqual(destMovement);
      expect(result.sourceOnHand).toBe(40);
      expect(result.destOnHand).toBe(10);
      // Two inserts: transfer_out + transfer_in
      const insertCallCount = mockInsert.mock.calls.length as number;
      expect(insertCallCount).toBe(2);
    });

    it('throws when source and destination are same location', async () => {
      const ctx = makeCtx();
      const input = {
        catalogItemId: 'CAT_001',
        fromLocationId: 'LOC_001',
        toLocationId: 'LOC_001',
        quantity: 10,
        businessDate: '2024-01-15',
      };

      await expect(transferInventory(ctx as any, input)).rejects.toThrow(
        'Source and destination locations must be different',
      );
    });

    it('throws when source has insufficient stock', async () => {
      const sourceItem = makeInventoryItem({ id: 'INV_SRC', locationId: 'LOC_001' });
      const destItem = makeInventoryItem({ id: 'INV_DST', locationId: 'LOC_002' });

      // Call 1: findByCatalogItemId at source
      mockSelect.mockImplementationOnce(() => makeSelectChain([sourceItem]));
      // Call 2: findByCatalogItemId at dest
      mockSelect.mockImplementationOnce(() => makeSelectChain([destItem]));
      // Call 3: getOnHand at source before => 5 (less than requested 10)
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '5' }]));

      const ctx = makeCtx();
      const input = {
        catalogItemId: 'CAT_001',
        fromLocationId: 'LOC_001',
        toLocationId: 'LOC_002',
        quantity: 10,
        businessDate: '2024-01-15',
      };

      await expect(transferInventory(ctx as any, input)).rejects.toThrow(
        'Insufficient stock at source location for transfer',
      );
    });

    it('always enforces non-negative at source regardless of allowNegative', async () => {
      // Even when the source item has allowNegative=true, transfers still check for sufficient stock
      const sourceItem = makeInventoryItem({ id: 'INV_SRC', locationId: 'LOC_001', allowNegative: true });
      const destItem = makeInventoryItem({ id: 'INV_DST', locationId: 'LOC_002' });

      // Call 1: findByCatalogItemId at source
      mockSelect.mockImplementationOnce(() => makeSelectChain([sourceItem]));
      // Call 2: findByCatalogItemId at dest
      mockSelect.mockImplementationOnce(() => makeSelectChain([destItem]));
      // Call 3: getOnHand at source before => 3 (less than requested 10)
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '3' }]));

      const ctx = makeCtx();
      const input = {
        catalogItemId: 'CAT_001',
        fromLocationId: 'LOC_001',
        toLocationId: 'LOC_002',
        quantity: 10,
        businessDate: '2024-01-15',
      };

      // Transfer enforces non-negative regardless of allowNegative flag
      await expect(transferInventory(ctx as any, input)).rejects.toThrow(
        'Insufficient stock at source location for transfer',
      );
    });
  });

  describe('recordShrink', () => {
    it('creates a shrink movement with negative delta', async () => {
      const item = makeInventoryItem();
      const movement = makeMovement({
        movementType: 'shrink',
        quantityDelta: '-5',
        metadata: { shrinkType: 'waste' },
      });

      // Call 1: lookup inventory item
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      // Call 2: getOnHand before => 20
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '20' }]));
      // Call 3: getOnHand after => 15
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '15' }]));
      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([movement]),
        }),
      });

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 5,
        shrinkType: 'waste' as const,
        reason: 'Expired product',
        businessDate: '2024-01-15',
      };

      const result = await recordShrink(ctx as any, input);

      expect(result).toBeDefined();
      expect(result.currentOnHand).toBe(15);
      expect(result.movement.movementType).toBe('shrink');
    });

    it('throws when shrink would cause negative stock', async () => {
      const item = makeInventoryItem({ allowNegative: false });

      // Call 1: lookup inventory item
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      // Call 2: getOnHand before => 3 (shrinking by 10 would make -7)
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '3' }]));

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 10,
        shrinkType: 'damage' as const,
        reason: 'Broken items',
        businessDate: '2024-01-15',
      };

      await expect(recordShrink(ctx as any, input)).rejects.toThrow(
        'Shrink would result in negative inventory',
      );
    });

    it('stores shrinkType in metadata', async () => {
      const item = makeInventoryItem();
      const movement = makeMovement({
        movementType: 'shrink',
        quantityDelta: '-2',
        metadata: { shrinkType: 'theft' },
      });

      // Call 1: lookup inventory item
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      // Call 2: getOnHand before => 20
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '20' }]));
      // Call 3: getOnHand after => 18
      mockSelect.mockImplementationOnce(() => makeSelectChain([{ total: '18' }]));

      // Capture the insert call to verify metadata
      const valuesCapture = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([movement]),
      });
      mockInsert.mockReturnValue({ values: valuesCapture });

      const ctx = makeCtx();
      const input = {
        inventoryItemId: 'INV_001',
        quantity: 2,
        shrinkType: 'theft' as const,
        reason: 'Stolen from display',
        businessDate: '2024-01-15',
      };

      await recordShrink(ctx as any, input);

      // Verify the values passed to insert contain metadata with shrinkType
      expect(valuesCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { shrinkType: 'theft' },
        }),
      );
    });
  });

  // ── Queries ──────────────────────────────────────────────────────────────────

  describe('listInventoryItems', () => {
    it('returns items with computed on-hand', async () => {
      const item1 = makeInventoryItem({ id: 'INV_001', name: 'Item 1' });
      const item2 = makeInventoryItem({ id: 'INV_002', name: 'Item 2' });

      // select().from(inventoryItems).where().orderBy().limit() => rows
      mockSelect.mockImplementationOnce(() => makeSelectChain([item1, item2]));
      // execute() for on-hand SUM query => on-hand map
      mockExecute.mockResolvedValueOnce([
        { inventory_item_id: 'INV_001', on_hand: '25' },
        { inventory_item_id: 'INV_002', on_hand: '13' },
      ]);

      const result = await listInventoryItems({
        tenantId: 'TNT_001',
        locationId: 'LOC_001',
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.onHand).toBe(25);
      expect(result.items[1]!.onHand).toBe(13);
      expect(result.hasMore).toBe(false);
    });

    it('applies cursor pagination correctly', async () => {
      // Return limit+1 items to signal hasMore
      const items = Array.from({ length: 51 }, (_, i) =>
        makeInventoryItem({ id: `INV_${String(i).padStart(3, '0')}` }),
      );
      mockSelect.mockImplementationOnce(() => makeSelectChain(items));
      mockExecute.mockResolvedValueOnce(
        items.slice(0, 50).map((itm) => ({
          inventory_item_id: itm.id,
          on_hand: '10',
        })),
      );

      const result = await listInventoryItems({
        tenantId: 'TNT_001',
        limit: 50,
      });

      expect(result.items).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('INV_049');
    });

    it('filters by status and itemType', async () => {
      const item = makeInventoryItem({ status: 'active', itemType: 'retail' });
      mockSelect.mockImplementationOnce(() => makeSelectChain([item]));
      mockExecute.mockResolvedValueOnce([{ inventory_item_id: 'INV_001', on_hand: '5' }]);

      const result = await listInventoryItems({
        tenantId: 'TNT_001',
        status: 'active',
        itemType: 'retail',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe('active');
      expect(result.items[0]!.itemType).toBe('retail');
    });
  });

  describe('getMovements', () => {
    it('returns movements for an inventory item', async () => {
      const mov1 = makeMovement({ id: 'MOV_001', movementType: 'receive' });
      const mov2 = makeMovement({ id: 'MOV_002', movementType: 'sale' });

      mockSelect.mockImplementationOnce(() => makeSelectChain([mov1, mov2]));

      const result = await getMovements({
        tenantId: 'TNT_001',
        inventoryItemId: 'INV_001',
      });

      expect(result.movements).toHaveLength(2);
      expect(result.movements[0]!.id).toBe('MOV_001');
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('applies cursor pagination', async () => {
      // Return limit+1 items to signal hasMore
      const movements = Array.from({ length: 51 }, (_, i) =>
        makeMovement({ id: `MOV_${String(i).padStart(3, '0')}` }),
      );
      mockSelect.mockImplementationOnce(() => makeSelectChain(movements));

      const result = await getMovements({
        tenantId: 'TNT_001',
        inventoryItemId: 'INV_001',
        limit: 50,
      });

      expect(result.movements).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('MOV_049');
    });
  });

  // ── Event Consumers ──────────────────────────────────────────────────────────

  describe('handleOrderPlaced', () => {
    it('creates sale movements for each order line', async () => {
      const orderLine1 = {
        catalogItemId: 'CAT_001',
        qty: '2',
        itemType: 'retail',
        packageComponents: null,
      };
      const orderLine2 = {
        catalogItemId: 'CAT_002',
        qty: '1',
        itemType: 'retail',
        packageComponents: null,
      };
      const invItem1 = makeInventoryItem({ id: 'INV_001', catalogItemId: 'CAT_001', trackInventory: true });
      const invItem2 = makeInventoryItem({ id: 'INV_002', catalogItemId: 'CAT_002', trackInventory: true });

      // Call 1: fetch order lines => 2 lines
      mockSelect.mockImplementationOnce(() => makeSelectChain([orderLine1, orderLine2]));
      // Call 2: find inventory item for line 1 => found
      mockSelect.mockImplementationOnce(() => makeSelectChain([invItem1]));
      // Call 3: find inventory item for line 2 => found
      mockSelect.mockImplementationOnce(() => makeSelectChain([invItem2]));

      const event = makeEvent({ orderId: 'ORD_001', locationId: 'LOC_001', businessDate: '2024-01-15' });
      await handleOrderPlaced(event);

      // Two execute calls for two sale movements
      const executeCallCount = mockExecute.mock.calls.length as number;
      expect(executeCallCount).toBe(2);
    });

    it('deducts components for package items', async () => {
      const packageLine = {
        catalogItemId: 'CAT_PKG',
        qty: '1',
        itemType: 'package',
        packageComponents: [
          { catalogItemId: 'CAT_COMP_1', name: 'Comp 1', qty: 2 },
          { catalogItemId: 'CAT_COMP_2', name: 'Comp 2', qty: 3 },
        ],
      };
      const comp1Inv = makeInventoryItem({ id: 'INV_COMP1', catalogItemId: 'CAT_COMP_1', trackInventory: true });
      const comp2Inv = makeInventoryItem({ id: 'INV_COMP2', catalogItemId: 'CAT_COMP_2', trackInventory: true });

      // Call 1: fetch order lines => 1 package line
      mockSelect.mockImplementationOnce(() => makeSelectChain([packageLine]));
      // Call 2: find inventory item for component 1
      mockSelect.mockImplementationOnce(() => makeSelectChain([comp1Inv]));
      // Call 3: find inventory item for component 2
      mockSelect.mockImplementationOnce(() => makeSelectChain([comp2Inv]));

      const event = makeEvent({ orderId: 'ORD_001', locationId: 'LOC_001' });
      await handleOrderPlaced(event);

      // Two execute calls for two component movements
      const executeCallCount = mockExecute.mock.calls.length as number;
      expect(executeCallCount).toBe(2);
    });

    it('skips items without inventory tracking', async () => {
      const orderLine = {
        catalogItemId: 'CAT_001',
        qty: '2',
        itemType: 'retail',
        packageComponents: null,
      };
      const invItem = makeInventoryItem({ id: 'INV_001', catalogItemId: 'CAT_001', trackInventory: false });

      // Call 1: fetch order lines
      mockSelect.mockImplementationOnce(() => makeSelectChain([orderLine]));
      // Call 2: find inventory item (trackInventory = false)
      mockSelect.mockImplementationOnce(() => makeSelectChain([invItem]));

      const event = makeEvent({ orderId: 'ORD_001', locationId: 'LOC_001' });
      await handleOrderPlaced(event);

      // No execute calls since trackInventory is false
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('handleOrderVoided', () => {
    it('creates void_reversal movements for each sale movement', async () => {
      const saleMov1 = makeMovement({
        id: 'MOV_SALE_1',
        movementType: 'sale',
        quantityDelta: '-2',
        referenceType: 'order',
        referenceId: 'ORD_001',
        locationId: 'LOC_001',
        inventoryItemId: 'INV_001',
        businessDate: '2024-01-15',
      });
      const saleMov2 = makeMovement({
        id: 'MOV_SALE_2',
        movementType: 'sale',
        quantityDelta: '-1',
        referenceType: 'order',
        referenceId: 'ORD_001',
        locationId: 'LOC_001',
        inventoryItemId: 'INV_002',
        businessDate: '2024-01-15',
      });

      // Call 1: find sale movements for the order
      mockSelect.mockImplementationOnce(() => makeSelectChain([saleMov1, saleMov2]));

      const event = makeEvent({ orderId: 'ORD_001' });
      event.eventType = 'order.voided.v1';
      await handleOrderVoided(event);

      // Two execute calls for two void_reversal movements
      const executeCallCount = mockExecute.mock.calls.length as number;
      expect(executeCallCount).toBe(2);
    });
  });

  describe('handleCatalogItemCreated', () => {
    it('auto-creates inventory items for all locations', async () => {
      const loc1 = { id: 'LOC_001', tenantId: 'TNT_001', isActive: true };
      const loc2 = { id: 'LOC_002', tenantId: 'TNT_001', isActive: true };
      const loc3 = { id: 'LOC_003', tenantId: 'TNT_001', isActive: true };

      // Call 1: fetch active locations
      mockSelect.mockImplementationOnce(() => makeSelectChain([loc1, loc2, loc3]));

      const event: {
        eventId: string;
        eventType: string;
        occurredAt: string;
        tenantId: string;
        actorUserId: string;
        idempotencyKey: string;
        data: Record<string, unknown>;
      } = {
        eventId: 'EVT_002',
        eventType: 'catalog.item.created.v1',
        occurredAt: new Date().toISOString(),
        tenantId: 'TNT_001',
        actorUserId: 'USER_001',
        idempotencyKey: 'IDEM_002',
        data: {
          itemId: 'CAT_NEW',
          name: 'New Catalog Item',
          sku: 'SKU-NEW',
          itemType: 'retail',
          isActive: true,
        },
      };

      await handleCatalogItemCreated(event);

      // Three execute calls for three locations
      const executeCallCount = mockExecute.mock.calls.length as number;
      expect(executeCallCount).toBe(3);
    });
  });
});
