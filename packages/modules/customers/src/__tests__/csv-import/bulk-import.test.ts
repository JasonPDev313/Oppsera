import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockInsert, mockSelect, mockUpdate, mockPublishWithOutbox, mockAuditLog, mockBuildEvent } = vi.hoisted(() => {
  const mockInsert = vi.fn();
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();

  // Default insert chain
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-customer-id' }]),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    }),
  });

  // Default select chain
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }
  mockSelect.mockReturnValue(makeSelectChain());

  // Default update chain
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ id: 'updated-id' }]),
    }),
  });

  const mockPublishWithOutbox = vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = { insert: mockInsert, select: mockSelect, update: mockUpdate };
    const outcome = await fn(tx);
    // Real publishWithOutbox returns result.result (unwrapped)
    return (outcome as any).result;
  });

  const mockAuditLog = vi.fn().mockResolvedValue(undefined);
  const mockBuildEvent = vi.fn(() => ({ type: 'customers.bulk_imported.v1', data: {} }));

  return { mockInsert, mockSelect, mockUpdate, mockPublishWithOutbox, mockAuditLog, mockBuildEvent };
});

// Mock specific subpath imports that the command uses
vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: mockPublishWithOutbox,
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: mockBuildEvent,
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: mockAuditLog,
}));

vi.mock('@oppsera/db', () => ({
  customerImportLogs: { id: 'id' },
  customers: { id: 'id', tenantId: 'tenant_id', email: 'email', phone: 'phone' },
  customerAddresses: { id: 'id', tenantId: 'tenant_id', customerId: 'customer_id', isPrimary: 'is_primary' },
  customerIdentifiers: { id: 'id' },
  customerExternalIds: { id: 'id' },
  customerActivityLog: { id: 'id' },
}));

// drizzle-orm `eq` and `and` — the tx is fully mocked so these just need to exist
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

// Mock display name helper
vi.mock('../../helpers/display-name', () => ({
  computeDisplayName: vi.fn((input: Record<string, unknown>) =>
    (input.firstName ?? input.organizationName ?? input.email ?? 'Unknown') as string,
  ),
}));

import { bulkImportCustomers } from '../../commands/bulk-import-customers';
import type { MappedCustomerRow, ColumnMapping } from '../../services/csv-import/import-types';

function makeCtx() {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    user: { id: 'user-1', tenantId: 'tenant-1', roles: ['owner'] },
    requestId: 'req-1',
    locationId: null,
  } as any;
}

function makeRow(
  rowIndex: number,
  customer: Record<string, unknown>,
): MappedCustomerRow {
  return {
    rowIndex,
    customer: { type: 'person', ...customer },
  };
}

const defaultMappings: ColumnMapping[] = [
  { sourceHeader: 'Name', sourceIndex: 0, targetField: 'firstName', confidence: 95, method: 'alias' },
  { sourceHeader: 'Email', sourceIndex: 1, targetField: 'email', confidence: 95, method: 'alias' },
];

describe('bulk-import-customers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set defaults
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'new-customer-id' }]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  it('imports new customers', async () => {
    const rows = [
      makeRow(0, { firstName: 'John', email: 'john@test.com', displayName: 'John' }),
      makeRow(1, { firstName: 'Jane', email: 'jane@test.com', displayName: 'Jane' }),
    ];

    const result = await bulkImportCustomers(makeCtx(), {
      fileName: 'test.csv',
      fileSizeBytes: 1000,
      mappedRows: rows,
      columnMappings: defaultMappings,
      duplicateResolutions: {},
    });

    expect(result.successRows).toBe(2);
    expect(result.errorRows).toBe(0);
    expect(mockPublishWithOutbox).toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'customers.bulk_imported',
      'customer_import_log',
      expect.any(String),
    );
  });

  it('skips rows with skip resolution', async () => {
    const rows = [
      makeRow(0, { firstName: 'John', email: 'john@test.com', displayName: 'John' }),
    ];

    const result = await bulkImportCustomers(makeCtx(), {
      fileName: 'test.csv',
      mappedRows: rows,
      columnMappings: defaultMappings,
      duplicateResolutions: { 0: 'skip' },
    });

    expect(result.skippedRows).toBe(1);
    expect(result.successRows).toBe(0);
  });

  it('records errors for failed rows without blocking others', async () => {
    // First insert succeeds, second throws
    let callCount = 0;
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          callCount++;
          // The import log insert is first, then customer inserts
          if (callCount === 3) throw new Error('Unique violation');
          return [{ id: `id-${callCount}` }];
        }),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }),
    }));

    const rows = [
      makeRow(0, { firstName: 'John', email: 'john@test.com', displayName: 'John' }),
      makeRow(1, { firstName: 'Jane', email: 'jane@test.com', displayName: 'Jane' }),
    ];

    const result = await bulkImportCustomers(makeCtx(), {
      fileName: 'test.csv',
      mappedRows: rows,
      columnMappings: defaultMappings,
      duplicateResolutions: {},
    });

    // One succeeded, one errored
    expect(result.successRows + result.errorRows).toBe(2);
    expect(result.errorRows).toBeGreaterThanOrEqual(1);
  });

  it('creates import log with final counts', async () => {
    const rows = [makeRow(0, { firstName: 'John', email: 'john@test.com', displayName: 'John' })];

    const result = await bulkImportCustomers(makeCtx(), {
      fileName: 'test.csv',
      fileSizeBytes: 500,
      mappedRows: rows,
      columnMappings: defaultMappings,
      duplicateResolutions: {},
    });

    expect(result.importLogId).toBeTruthy();
    expect(result.totalRows).toBe(1);
  });

  it('emits event on completion', async () => {
    const rows = [makeRow(0, { firstName: 'John', displayName: 'John' })];

    await bulkImportCustomers(makeCtx(), {
      fileName: 'test.csv',
      mappedRows: rows,
      columnMappings: defaultMappings,
      duplicateResolutions: {},
    });

    // publishWithOutbox is called, which means event was emitted
    expect(mockPublishWithOutbox).toHaveBeenCalledTimes(1);
  });
});
