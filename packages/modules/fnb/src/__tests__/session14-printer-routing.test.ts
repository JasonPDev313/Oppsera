import { describe, it, expect } from 'vitest';
import {
  resolveRoutedPrinter,
  isReceiptType,
  isStationType,
} from '../helpers/printer-routing';
import type { RoutingRule } from '../helpers/printer-routing';

const makeRule = (
  overrides: Partial<RoutingRule> & { id: string; printerId: string; printJobType: string },
): RoutingRule => ({
  stationId: null,
  priority: 0,
  isActive: true,
  ...overrides,
});

describe('resolveRoutedPrinter', () => {
  it('returns station-specific printer', () => {
    const rules: RoutingRule[] = [
      makeRule({ id: '1', stationId: 'stn_grill', printerId: 'p_grill', printJobType: 'kitchen_chit' }),
      makeRule({ id: '2', stationId: null, printerId: 'p_default', printJobType: 'kitchen_chit' }),
    ];

    const result = resolveRoutedPrinter(rules, {
      printJobType: 'kitchen_chit',
      locationId: 'loc_01',
      stationId: 'stn_grill',
    });

    expect(result).toBe('p_grill');
  });

  it('falls back to location-level rule', () => {
    const rules: RoutingRule[] = [
      makeRule({ id: '1', stationId: null, printerId: 'p_default', printJobType: 'kitchen_chit' }),
    ];

    const result = resolveRoutedPrinter(rules, {
      printJobType: 'kitchen_chit',
      locationId: 'loc_01',
      stationId: 'stn_unknown',
    });

    expect(result).toBe('p_default');
  });

  it('falls back to terminal receipt printer', () => {
    const rules: RoutingRule[] = [];

    const result = resolveRoutedPrinter(rules, {
      printJobType: 'guest_check',
      locationId: 'loc_01',
      terminalReceiptPrinterId: 'p_terminal',
    });

    expect(result).toBe('p_terminal');
  });

  it('returns null when no rules or terminal printer', () => {
    const result = resolveRoutedPrinter([], {
      printJobType: 'kitchen_chit',
      locationId: 'loc_01',
    });

    expect(result).toBeNull();
  });

  it('skips inactive rules', () => {
    const rules: RoutingRule[] = [
      makeRule({ id: '1', stationId: null, printerId: 'p_inactive', printJobType: 'kitchen_chit', isActive: false }),
    ];

    const result = resolveRoutedPrinter(rules, {
      printJobType: 'kitchen_chit',
      locationId: 'loc_01',
    });

    expect(result).toBeNull();
  });

  it('picks highest priority rule for same type', () => {
    const rules: RoutingRule[] = [
      makeRule({ id: '1', stationId: null, printerId: 'p_low', printJobType: 'receipt', priority: 1 }),
      makeRule({ id: '2', stationId: null, printerId: 'p_high', printJobType: 'receipt', priority: 10 }),
    ];

    const result = resolveRoutedPrinter(rules, {
      printJobType: 'receipt',
      locationId: 'loc_01',
    });

    expect(result).toBe('p_high');
  });

  it('ignores rules for different job type', () => {
    const rules: RoutingRule[] = [
      makeRule({ id: '1', stationId: null, printerId: 'p_receipt', printJobType: 'receipt' }),
    ];

    const result = resolveRoutedPrinter(rules, {
      printJobType: 'kitchen_chit',
      locationId: 'loc_01',
    });

    expect(result).toBeNull();
  });

  it('does not fall back to terminal printer for station types', () => {
    const result = resolveRoutedPrinter([], {
      printJobType: 'kitchen_chit',
      locationId: 'loc_01',
      terminalReceiptPrinterId: 'p_terminal',
    });

    expect(result).toBeNull();
  });

  it('falls back to terminal for close_batch_report', () => {
    const result = resolveRoutedPrinter([], {
      printJobType: 'close_batch_report',
      locationId: 'loc_01',
      terminalReceiptPrinterId: 'p_terminal',
    });

    expect(result).toBe('p_terminal');
  });

  it('falls back to terminal for cash_drop_receipt', () => {
    const result = resolveRoutedPrinter([], {
      printJobType: 'cash_drop_receipt',
      locationId: 'loc_01',
      terminalReceiptPrinterId: 'p_terminal',
    });

    expect(result).toBe('p_terminal');
  });
});

describe('isReceiptType', () => {
  it('returns true for receipt types', () => {
    expect(isReceiptType('guest_check')).toBe(true);
    expect(isReceiptType('receipt')).toBe(true);
    expect(isReceiptType('cash_drop_receipt')).toBe(true);
    expect(isReceiptType('close_batch_report')).toBe(true);
  });

  it('returns false for station types', () => {
    expect(isReceiptType('kitchen_chit')).toBe(false);
    expect(isReceiptType('bar_chit')).toBe(false);
    expect(isReceiptType('delta_chit')).toBe(false);
  });
});

describe('isStationType', () => {
  it('returns true for station types', () => {
    expect(isStationType('kitchen_chit')).toBe(true);
    expect(isStationType('bar_chit')).toBe(true);
    expect(isStationType('delta_chit')).toBe(true);
    expect(isStationType('expo_chit')).toBe(true);
  });

  it('returns false for receipt types', () => {
    expect(isStationType('guest_check')).toBe(false);
    expect(isStationType('receipt')).toBe(false);
  });
});
