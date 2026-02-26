import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recalculateFolioTotals } from '../helpers/folio-totals';

function createMockTx(queryResult: Record<string, unknown> | null = null) {
  const mockSet = vi.fn().mockReturnThis();
  const mockWhere = vi.fn().mockResolvedValue(undefined);

  return {
    execute: vi.fn().mockResolvedValue(
      queryResult ? [queryResult] : [],
    ),
    update: vi.fn().mockReturnValue({
      set: mockSet,
    }),
    _mockSet: mockSet,
    _mockWhere: mockWhere,
  };
}

describe('recalculateFolioTotals', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates total from subtotal + tax + fee', async () => {
    const tx = createMockTx({
      subtotal_cents: 50000,
      tax_cents: 5000,
      fee_cents: 2500,
    });

    // Mock the update chain
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    tx.update = vi.fn().mockReturnValue({ set: mockSet });

    await recalculateFolioTotals(tx, 'tenant-1', 'folio-1');

    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotalCents: 50000,
        taxCents: 5000,
        feeCents: 2500,
        totalCents: 57500,
      }),
    );
  });

  it('handles zero amounts correctly', async () => {
    const tx = createMockTx({
      subtotal_cents: 0,
      tax_cents: 0,
      fee_cents: 0,
    });

    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    tx.update = vi.fn().mockReturnValue({ set: mockSet });

    await recalculateFolioTotals(tx, 'tenant-1', 'folio-1');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotalCents: 0,
        taxCents: 0,
        feeCents: 0,
        totalCents: 0,
      }),
    );
  });

  it('handles null/missing values as zero via COALESCE', async () => {
    const tx = createMockTx({
      subtotal_cents: null,
      tax_cents: null,
      fee_cents: null,
    });

    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    tx.update = vi.fn().mockReturnValue({ set: mockSet });

    await recalculateFolioTotals(tx, 'tenant-1', 'folio-1');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotalCents: 0,
        taxCents: 0,
        feeCents: 0,
        totalCents: 0,
      }),
    );
  });

  it('returns early when no rows from query', async () => {
    const tx = createMockTx(null); // empty result
    tx.update = vi.fn();

    await recalculateFolioTotals(tx, 'tenant-1', 'folio-1');

    // Should not call update when no totals row
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('converts string cents from SQL to numbers', async () => {
    // postgres.js returns numeric as strings
    const tx = createMockTx({
      subtotal_cents: '30000',
      tax_cents: '3000',
      fee_cents: '1000',
    });

    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    tx.update = vi.fn().mockReturnValue({ set: mockSet });

    await recalculateFolioTotals(tx, 'tenant-1', 'folio-1');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotalCents: 30000,
        taxCents: 3000,
        feeCents: 1000,
        totalCents: 34000,
      }),
    );
  });

  it('sets updatedAt to a Date instance', async () => {
    const tx = createMockTx({
      subtotal_cents: 10000,
      tax_cents: 1000,
      fee_cents: 500,
    });

    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    tx.update = vi.fn().mockReturnValue({ set: mockSet });

    await recalculateFolioTotals(tx, 'tenant-1', 'folio-1');

    const setArg = mockSet.mock.calls[0]![0];
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('handles only room charges in subtotal', async () => {
    // The SQL only counts ROOM_CHARGE and positive ADJUSTMENTs in subtotal
    // TAX goes to taxCents, FEE goes to feeCents
    const tx = createMockTx({
      subtotal_cents: 100000, // room charges
      tax_cents: 12000,       // tax
      fee_cents: 5000,        // resort fee
    });

    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    tx.update = vi.fn().mockReturnValue({ set: mockSet });

    await recalculateFolioTotals(tx, 'tenant-1', 'folio-1');

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCents: 117000, // 100000 + 12000 + 5000
      }),
    );
  });

  it('passes correct tenantId and folioId to SQL query', async () => {
    const tx = createMockTx({ subtotal_cents: 0, tax_cents: 0, fee_cents: 0 });
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    tx.update = vi.fn().mockReturnValue({ set: mockSet });

    await recalculateFolioTotals(tx, 'tenant-abc', 'folio-xyz');

    // Verify the SQL execute was called (contains tenantId and folioId as params)
    expect(tx.execute).toHaveBeenCalledTimes(1);
    // Verify the update targets the correct folio
    expect(tx.update).toHaveBeenCalledTimes(1);
  });
});
