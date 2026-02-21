import { describe, it, expect } from 'vitest';
import {
  FNB_GL_MAPPING_ENTITY_TYPES, FNB_POSTING_STATUSES, FNB_POSTING_MODES,
  configureFnbGlMappingSchema,
  updateFnbPostingConfigSchema,
  postBatchToGlSchema,
  reverseBatchPostingSchema,
  retryBatchPostingSchema,
  listFnbGlMappingsSchema,
  listUnpostedBatchesSchema,
  getBatchPostingStatusSchema,
  getPostingReconciliationSchema,
} from '../validation';

// ── Enum Constants ──────────────────────────────────────────────

describe('Session 11 Enums', () => {
  it('FNB_GL_MAPPING_ENTITY_TYPES has expected values', () => {
    expect(FNB_GL_MAPPING_ENTITY_TYPES).toEqual([
      'department', 'sub_department', 'tax_group', 'payment_type',
      'service_charge', 'comp', 'discount', 'cash_over_short', 'tip', 'gift_card',
    ]);
  });

  it('FNB_POSTING_STATUSES has expected values', () => {
    expect(FNB_POSTING_STATUSES).toEqual(['pending', 'posted', 'failed', 'reversed']);
  });

  it('FNB_POSTING_MODES has expected values', () => {
    expect(FNB_POSTING_MODES).toEqual(['realtime', 'batch']);
  });
});

// ── configureFnbGlMappingSchema ────────────────────────────────

describe('configureFnbGlMappingSchema', () => {
  const valid = {
    locationId: 'loc-1',
    entityType: 'department' as const,
    entityId: 'dept-food',
  };

  it('accepts minimal valid input', () => {
    const result = configureFnbGlMappingSchema.parse(valid);
    expect(result.entityType).toBe('department');
  });

  it('accepts all account IDs', () => {
    const result = configureFnbGlMappingSchema.parse({
      ...valid,
      revenueAccountId: 'acct-4100',
      expenseAccountId: 'acct-6100',
      liabilityAccountId: 'acct-2100',
      assetAccountId: 'acct-1100',
      contraRevenueAccountId: 'acct-4900',
      memo: 'Food department revenue mapping',
    });
    expect(result.revenueAccountId).toBe('acct-4100');
    expect(result.memo).toBe('Food department revenue mapping');
  });

  it('accepts all entity types', () => {
    for (const type of FNB_GL_MAPPING_ENTITY_TYPES) {
      const result = configureFnbGlMappingSchema.parse({ ...valid, entityType: type });
      expect(result.entityType).toBe(type);
    }
  });

  it('rejects invalid entity type', () => {
    expect(() => configureFnbGlMappingSchema.parse({ ...valid, entityType: 'unknown' })).toThrow();
  });

  it('rejects missing locationId', () => {
    expect(() => configureFnbGlMappingSchema.parse({ entityType: 'department', entityId: 'x' })).toThrow();
  });
});

// ── updateFnbPostingConfigSchema ────────────────────────────────

describe('updateFnbPostingConfigSchema', () => {
  const valid = {
    locationId: 'loc-1',
    postingMode: 'batch' as const,
  };

  it('accepts valid input with defaults', () => {
    const result = updateFnbPostingConfigSchema.parse(valid);
    expect(result.enableAutoPosting).toBe(false);
    expect(result.discountTreatment).toBe('contra_revenue');
    expect(result.compTreatment).toBe('expense');
    expect(result.serviceChargeTreatment).toBe('revenue');
  });

  it('accepts realtime posting mode', () => {
    const result = updateFnbPostingConfigSchema.parse({ ...valid, postingMode: 'realtime' });
    expect(result.postingMode).toBe('realtime');
  });

  it('accepts custom treatment options', () => {
    const result = updateFnbPostingConfigSchema.parse({
      ...valid,
      enableAutoPosting: true,
      discountTreatment: 'expense',
      compTreatment: 'contra_revenue',
      serviceChargeTreatment: 'liability',
    });
    expect(result.enableAutoPosting).toBe(true);
    expect(result.discountTreatment).toBe('expense');
  });

  it('rejects invalid posting mode', () => {
    expect(() => updateFnbPostingConfigSchema.parse({ ...valid, postingMode: 'manual' })).toThrow();
  });
});

// ── postBatchToGlSchema ─────────────────────────────────────────

describe('postBatchToGlSchema', () => {
  it('accepts valid input', () => {
    const result = postBatchToGlSchema.parse({ closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('rejects empty closeBatchId', () => {
    expect(() => postBatchToGlSchema.parse({ closeBatchId: '' })).toThrow();
  });
});

// ── reverseBatchPostingSchema ───────────────────────────────────

describe('reverseBatchPostingSchema', () => {
  it('accepts valid input', () => {
    const result = reverseBatchPostingSchema.parse({
      closeBatchId: 'batch-1',
      reason: 'Incorrect classification',
    });
    expect(result.reason).toBe('Incorrect classification');
  });

  it('rejects empty reason', () => {
    expect(() => reverseBatchPostingSchema.parse({ closeBatchId: 'batch-1', reason: '' })).toThrow();
  });
});

// ── retryBatchPostingSchema ─────────────────────────────────────

describe('retryBatchPostingSchema', () => {
  it('accepts valid input', () => {
    const result = retryBatchPostingSchema.parse({ closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });
});

// ── Query Filter Schemas ────────────────────────────────────────

describe('listFnbGlMappingsSchema', () => {
  it('accepts valid input', () => {
    const result = listFnbGlMappingsSchema.parse({ tenantId: 't-1', locationId: 'loc-1' });
    expect(result.locationId).toBe('loc-1');
  });

  it('accepts entity type filter', () => {
    const result = listFnbGlMappingsSchema.parse({
      tenantId: 't-1', locationId: 'loc-1', entityType: 'tax_group',
    });
    expect(result.entityType).toBe('tax_group');
  });

  it('rejects invalid entity type filter', () => {
    expect(() => listFnbGlMappingsSchema.parse({
      tenantId: 't-1', locationId: 'loc-1', entityType: 'invalid',
    })).toThrow();
  });
});

describe('listUnpostedBatchesSchema', () => {
  it('accepts valid input', () => {
    const result = listUnpostedBatchesSchema.parse({ tenantId: 't-1' });
    expect(result.tenantId).toBe('t-1');
  });

  it('accepts optional locationId', () => {
    const result = listUnpostedBatchesSchema.parse({ tenantId: 't-1', locationId: 'loc-1' });
    expect(result.locationId).toBe('loc-1');
  });
});

describe('getBatchPostingStatusSchema', () => {
  it('accepts valid input', () => {
    const result = getBatchPostingStatusSchema.parse({ tenantId: 't-1', closeBatchId: 'batch-1' });
    expect(result.closeBatchId).toBe('batch-1');
  });

  it('rejects missing closeBatchId', () => {
    expect(() => getBatchPostingStatusSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});

describe('getPostingReconciliationSchema', () => {
  it('accepts valid input', () => {
    const result = getPostingReconciliationSchema.parse({
      tenantId: 't-1', businessDate: '2026-02-21',
    });
    expect(result.businessDate).toBe('2026-02-21');
  });

  it('accepts optional locationId', () => {
    const result = getPostingReconciliationSchema.parse({
      tenantId: 't-1', businessDate: '2026-02-21', locationId: 'loc-1',
    });
    expect(result.locationId).toBe('loc-1');
  });

  it('rejects missing businessDate', () => {
    expect(() => getPostingReconciliationSchema.parse({ tenantId: 't-1' })).toThrow();
  });
});
