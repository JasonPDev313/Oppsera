import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockExecute } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue([]);
  return { mockExecute };
});

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ execute: mockExecute }),
  ),
  customers: {},
  customerIdentifiers: {},
  customerExternalIds: {},
}));

import { detectDuplicates } from '../../services/csv-import/duplicate-detector';
import type { MappedCustomerRow } from '../../services/csv-import/import-types';

function makeRow(
  rowIndex: number,
  customer: Record<string, unknown>,
  externalId?: string,
): MappedCustomerRow {
  return {
    rowIndex,
    customer: {
      type: 'person',
      ...customer,
    },
    externalId: externalId,
  };
}

describe('duplicate-detector', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValue([]);
  });

  it('returns empty for empty input', async () => {
    const result = await detectDuplicates('tenant-1', []);
    expect(result).toEqual([]);
  });

  it('detects email duplicate', async () => {
    // First call = email lookup
    mockExecute.mockResolvedValueOnce([
      { id: 'cust-1', displayName: 'John Smith', email: 'john@test.com', phone: null },
    ]);

    const rows = [makeRow(0, { firstName: 'John', email: 'john@test.com' })];
    const result = await detectDuplicates('tenant-1', rows);

    expect(result).toHaveLength(1);
    expect(result[0]?.matchType).toBe('email');
    expect(result[0]?.existingCustomerId).toBe('cust-1');
    expect(result[0]?.matchConfidence).toBe(100);
  });

  it('detects phone duplicate', async () => {
    // Row has phone only — so email query won't be run; first call = phone lookup
    mockExecute.mockResolvedValueOnce([
      { id: 'cust-2', displayName: 'Jane Doe', email: null, phone: '5551234567' },
    ]);

    const rows = [makeRow(0, { firstName: 'Jane', phone: '5551234567' })];
    const result = await detectDuplicates('tenant-1', rows);

    expect(result).toHaveLength(1);
    expect(result[0]?.matchType).toBe('phone');
  });

  it('detects member number duplicate', async () => {
    // Row has memberNumber only — only member query runs
    mockExecute.mockResolvedValueOnce([
      { customerId: 'cust-3', value: 'MBR-001', displayName: 'Bob Jones', email: 'bob@test.com' },
    ]);

    const rows = [makeRow(0, { firstName: 'Bob', memberNumber: 'MBR-001' })];
    const result = await detectDuplicates('tenant-1', rows);

    expect(result).toHaveLength(1);
    expect(result[0]?.matchType).toBe('member_number');
  });

  it('does not double-match a row', async () => {
    // Email matches the row — phone should NOT re-match the same row
    mockExecute.mockResolvedValueOnce([
      { id: 'cust-1', displayName: 'John', email: 'john@test.com', phone: '5551234567' },
    ]);
    mockExecute.mockResolvedValueOnce([
      { id: 'cust-1', displayName: 'John', email: 'john@test.com', phone: '5551234567' },
    ]);

    const rows = [makeRow(0, { firstName: 'John', email: 'john@test.com', phone: '5551234567' })];
    const result = await detectDuplicates('tenant-1', rows);

    expect(result).toHaveLength(1); // only email match, not both
    expect(result[0]?.matchType).toBe('email');
  });

  it('handles multiple rows with different match types', async () => {
    // Row 0 matches by email, Row 1 matches by phone
    mockExecute.mockResolvedValueOnce([
      { id: 'cust-1', displayName: 'John', email: 'john@test.com', phone: null },
    ]);
    mockExecute.mockResolvedValueOnce([
      { id: 'cust-2', displayName: 'Jane', email: null, phone: '5559876543' },
    ]);

    const rows = [
      makeRow(0, { firstName: 'John', email: 'john@test.com' }),
      makeRow(1, { firstName: 'Jane', phone: '5559876543' }),
    ];
    const result = await detectDuplicates('tenant-1', rows);

    expect(result).toHaveLength(2);
    expect(result[0]?.csvRowIndex).toBe(0);
    expect(result[0]?.matchType).toBe('email');
    expect(result[1]?.csvRowIndex).toBe(1);
    expect(result[1]?.matchType).toBe('phone');
  });

  it('returns results sorted by csvRowIndex', async () => {
    mockExecute.mockResolvedValueOnce([
      { id: 'cust-1', displayName: 'Jane', email: 'jane@test.com', phone: null },
      { id: 'cust-2', displayName: 'John', email: 'john@test.com', phone: null },
    ]);

    const rows = [
      makeRow(2, { firstName: 'Jane', email: 'jane@test.com' }),
      makeRow(0, { firstName: 'John', email: 'john@test.com' }),
    ];
    const result = await detectDuplicates('tenant-1', rows);

    expect(result[0]?.csvRowIndex).toBe(0);
    expect(result[1]?.csvRowIndex).toBe(2);
  });
});
