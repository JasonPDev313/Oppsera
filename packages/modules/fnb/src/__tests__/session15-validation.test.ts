import { describe, it, expect } from 'vitest';
import {
  FNB_DAYPARTS,
  getServerPerformanceSchema,
  getTableTurnsSchema,
  getKitchenPerformanceSchema,
  getDaypartSalesSchema,
  getMenuMixSchema,
  getDiscountCompAnalysisSchema,
  getHourlySalesSchema,
  getFnbDashboardSchema,
} from '../validation';

describe('Session 15 Enums', () => {
  it('FNB_DAYPARTS has 4 entries', () => {
    expect(FNB_DAYPARTS).toHaveLength(4);
    expect(FNB_DAYPARTS).toContain('breakfast');
    expect(FNB_DAYPARTS).toContain('lunch');
    expect(FNB_DAYPARTS).toContain('dinner');
    expect(FNB_DAYPARTS).toContain('late_night');
  });
});

describe('getServerPerformanceSchema', () => {
  it('validates with required fields', () => {
    const result = getServerPerformanceSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('accepts serverUserId filter', () => {
    const result = getServerPerformanceSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
      serverUserId: 'user_01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects limit above 200', () => {
    const result = getServerPerformanceSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
      limit: 300,
    });
    expect(result.success).toBe(false);
  });
});

describe('getTableTurnsSchema', () => {
  it('validates with defaults', () => {
    const result = getTableTurnsSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('accepts tableId filter', () => {
    const result = getTableTurnsSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
      tableId: 'tbl_01',
    });
    expect(result.success).toBe(true);
  });
});

describe('getKitchenPerformanceSchema', () => {
  it('validates with required fields', () => {
    const result = getKitchenPerformanceSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
    });
    expect(result.success).toBe(true);
  });

  it('accepts stationId filter', () => {
    const result = getKitchenPerformanceSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
      stationId: 'stn_01',
    });
    expect(result.success).toBe(true);
  });
});

describe('getDaypartSalesSchema', () => {
  it('validates with required fields', () => {
    const result = getDaypartSalesSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
    });
    expect(result.success).toBe(true);
  });

  it('accepts daypart filter', () => {
    const result = getDaypartSalesSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
      daypart: 'dinner',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid daypart', () => {
    const result = getDaypartSalesSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
      daypart: 'brunch',
    });
    expect(result.success).toBe(false);
  });
});

describe('getMenuMixSchema', () => {
  it('validates with defaults', () => {
    const result = getMenuMixSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topN).toBe(20);
      expect(result.data.sortBy).toBe('revenue');
    }
  });

  it('accepts topN and sortBy', () => {
    const result = getMenuMixSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
      topN: 10,
      sortBy: 'quantity_sold',
    });
    expect(result.success).toBe(true);
  });

  it('rejects topN above 100', () => {
    const result = getMenuMixSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
      topN: 200,
    });
    expect(result.success).toBe(false);
  });
});

describe('getDiscountCompAnalysisSchema', () => {
  it('validates', () => {
    const result = getDiscountCompAnalysisSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
    });
    expect(result.success).toBe(true);
  });
});

describe('getHourlySalesSchema', () => {
  it('validates', () => {
    const result = getHourlySalesSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      startDate: '2026-02-01',
      endDate: '2026-02-21',
    });
    expect(result.success).toBe(true);
  });
});

describe('getFnbDashboardSchema', () => {
  it('validates', () => {
    const result = getFnbDashboardSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
      businessDate: '2026-02-21',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing businessDate', () => {
    const result = getFnbDashboardSchema.safeParse({
      tenantId: 'tenant_01',
      locationId: 'loc_01',
    });
    expect(result.success).toBe(false);
  });
});
