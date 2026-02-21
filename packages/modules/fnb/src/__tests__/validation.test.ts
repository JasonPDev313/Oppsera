import { describe, it, expect } from 'vitest';
import {
  createTableSchema,
  updateTableSchema,
  updateTableStatusSchema,
  seatTableSchema,
  combineTablesSchema,
  uncombineTablesSchema,
  syncTablesFromFloorPlanSchema,
  listTablesFilterSchema,
  listTableStatusHistorySchema,
} from '../validation';

describe('createTableSchema', () => {
  it('validates a minimal valid input', () => {
    const result = createTableSchema.safeParse({
      roomId: 'room-1',
      tableNumber: 1,
      displayLabel: 'Table 1',
      capacityMax: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacityMin).toBe(1); // default
      expect(result.data.tableType).toBe('standard'); // default
      expect(result.data.shape).toBe('square'); // default
      expect(result.data.isCombinable).toBe(true); // default
    }
  });

  it('validates full input', () => {
    const result = createTableSchema.safeParse({
      clientRequestId: 'req-123',
      roomId: 'room-1',
      tableNumber: 5,
      displayLabel: 'VIP Booth',
      capacityMin: 2,
      capacityMax: 8,
      tableType: 'booth',
      shape: 'rectangle',
      positionX: 10.5,
      positionY: 20.3,
      width: 120,
      height: 80,
      rotation: 45,
      isCombinable: false,
      floorPlanObjectId: 'fp-obj-1',
      sectionId: 'section-1',
      sortOrder: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = createTableSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects negative table number', () => {
    const result = createTableSchema.safeParse({
      roomId: 'room-1',
      tableNumber: -1,
      displayLabel: 'T',
      capacityMax: 4,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid table type', () => {
    const result = createTableSchema.safeParse({
      roomId: 'room-1',
      tableNumber: 1,
      displayLabel: 'T',
      capacityMax: 4,
      tableType: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid shape', () => {
    const result = createTableSchema.safeParse({
      roomId: 'room-1',
      tableNumber: 1,
      displayLabel: 'T',
      capacityMax: 4,
      shape: 'hexagon',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateTableSchema', () => {
  it('accepts partial update', () => {
    const result = updateTableSchema.safeParse({ displayLabel: 'New Label' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no changes)', () => {
    const result = updateTableSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts nullable sectionId', () => {
    const result = updateTableSchema.safeParse({ sectionId: null });
    expect(result.success).toBe(true);
  });
});

describe('updateTableStatusSchema', () => {
  it('validates valid status transition', () => {
    const result = updateTableStatusSchema.safeParse({
      status: 'seated',
      partySize: 4,
      serverUserId: 'user-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateTableStatusSchema.safeParse({
      status: 'flying',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid statuses', () => {
    const validStatuses = [
      'available', 'reserved', 'seated', 'ordered', 'entrees_fired',
      'dessert', 'check_presented', 'paid', 'dirty', 'blocked',
    ];
    for (const status of validStatuses) {
      const result = updateTableStatusSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('accepts expectedVersion for optimistic locking', () => {
    const result = updateTableStatusSchema.safeParse({
      status: 'seated',
      expectedVersion: 3,
    });
    expect(result.success).toBe(true);
  });
});

describe('seatTableSchema', () => {
  it('validates minimal seat input', () => {
    const result = seatTableSchema.safeParse({ partySize: 2 });
    expect(result.success).toBe(true);
  });

  it('validates full seat input', () => {
    const result = seatTableSchema.safeParse({
      clientRequestId: 'req-1',
      partySize: 6,
      serverUserId: 'server-1',
      guestNames: 'Smith Party',
      waitlistEntryId: 'wl-1',
      expectedVersion: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero party size', () => {
    const result = seatTableSchema.safeParse({ partySize: 0 });
    expect(result.success).toBe(false);
  });
});

describe('combineTablesSchema', () => {
  it('validates valid combine request', () => {
    const result = combineTablesSchema.safeParse({
      tableIds: ['t1', 't2', 't3'],
      primaryTableId: 't1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects fewer than 2 tables', () => {
    const result = combineTablesSchema.safeParse({
      tableIds: ['t1'],
      primaryTableId: 't1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 8 tables', () => {
    const result = combineTablesSchema.safeParse({
      tableIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'],
      primaryTableId: 't1',
    });
    expect(result.success).toBe(false);
  });
});

describe('uncombineTablesSchema', () => {
  it('validates valid uncombine request', () => {
    const result = uncombineTablesSchema.safeParse({
      combineGroupId: 'group-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty group ID', () => {
    const result = uncombineTablesSchema.safeParse({
      combineGroupId: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('syncTablesFromFloorPlanSchema', () => {
  it('validates minimal input', () => {
    const result = syncTablesFromFloorPlanSchema.safeParse({ roomId: 'room-1' });
    expect(result.success).toBe(true);
  });

  it('validates with clientRequestId', () => {
    const result = syncTablesFromFloorPlanSchema.safeParse({
      roomId: 'room-1',
      clientRequestId: 'req-1',
    });
    expect(result.success).toBe(true);
  });
});

describe('listTablesFilterSchema', () => {
  it('validates minimal filter', () => {
    const result = listTablesFilterSchema.safeParse({ tenantId: 'tenant-1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100); // default
      expect(result.data.isActive).toBe(true); // default
    }
  });

  it('validates full filter', () => {
    const result = listTablesFilterSchema.safeParse({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      roomId: 'room-1',
      sectionId: 'section-1',
      isActive: false,
      cursor: 'cursor-1',
      limit: 50,
    });
    expect(result.success).toBe(true);
  });

  it('caps limit at 200', () => {
    const result = listTablesFilterSchema.safeParse({
      tenantId: 'tenant-1',
      limit: 500,
    });
    expect(result.success).toBe(false);
  });
});

describe('listTableStatusHistorySchema', () => {
  it('validates minimal input', () => {
    const result = listTableStatusHistorySchema.safeParse({
      tenantId: 'tenant-1',
      tableId: 'table-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50); // default
    }
  });

  it('validates with date range', () => {
    const result = listTableStatusHistorySchema.safeParse({
      tenantId: 'tenant-1',
      tableId: 'table-1',
      startDate: '2026-01-01T00:00:00Z',
      endDate: '2026-01-31T23:59:59Z',
    });
    expect(result.success).toBe(true);
  });
});
