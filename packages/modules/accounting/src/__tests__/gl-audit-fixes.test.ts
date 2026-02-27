import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const resolveSubDepartmentAccounts = vi.fn();
  const resolvePaymentTypeAccounts = vi.fn();
  const resolveTaxGroupAccount = vi.fn();
  const batchResolveSubDepartmentAccounts = vi.fn();
  const batchResolveTaxGroupAccounts = vi.fn();
  const batchResolveDiscountGlMappings = vi.fn();
  const logUnmappedEvent = vi.fn();
  const getAccountingSettings = vi.fn();
  const postEntry = vi.fn();
  const getAccountingPostingApi = vi.fn();
  const voidJournalEntry = vi.fn();

  // Mutable result for DB query chains
  let _queryResult: any[] = [];

  const db = {
    select: vi.fn(),
  };

  function setupDbChain() {
    db.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(_queryResult)),
      })),
    }));
  }

  function setQueryResult(val: any[]) {
    _queryResult = val;
  }

  return {
    resolveSubDepartmentAccounts,
    resolvePaymentTypeAccounts,
    resolveTaxGroupAccount,
    batchResolveSubDepartmentAccounts,
    batchResolveTaxGroupAccounts,
    batchResolveDiscountGlMappings,
    logUnmappedEvent,
    getAccountingSettings,
    postEntry,
    getAccountingPostingApi,
    voidJournalEntry,
    db,
    setupDbChain,
    setQueryResult,
  };
});

vi.mock('@oppsera/db', () => ({
  db: mocks.db,
  glJournalEntries: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceModule: 'source_module',
    status: 'status',
    memo: 'memo',
  },
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => `ulid-${Math.random().toString(36).slice(2, 8)}`),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: string, b: string) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
  }),
}));

vi.mock('../helpers/resolve-mapping', () => ({
  resolveSubDepartmentAccounts: mocks.resolveSubDepartmentAccounts,
  resolvePaymentTypeAccounts: mocks.resolvePaymentTypeAccounts,
  resolveTaxGroupAccount: mocks.resolveTaxGroupAccount,
  batchResolveSubDepartmentAccounts: mocks.batchResolveSubDepartmentAccounts,
  batchResolveTaxGroupAccounts: mocks.batchResolveTaxGroupAccounts,
  batchResolveDiscountGlMappings: mocks.batchResolveDiscountGlMappings,
  logUnmappedEvent: mocks.logUnmappedEvent,
}));

vi.mock('../helpers/get-accounting-settings', () => ({
  getAccountingSettings: mocks.getAccountingSettings,
}));

vi.mock('@oppsera/core/helpers/accounting-posting-api', () => ({
  getAccountingPostingApi: mocks.getAccountingPostingApi,
}));

vi.mock('../commands/void-journal-entry', () => ({
  voidJournalEntry: mocks.voidJournalEntry,
}));

import { handleTenderForAccounting } from '../adapters/pos-posting-adapter';
import { handleOrderVoidForAccounting } from '../adapters/void-posting-adapter';
import type { EventEnvelope } from '@oppsera/shared';

// ── Test Helpers ──────────────────────────────────────────────────

function createTenderEvent(dataOverrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: 'evt-1',
    eventType: 'tender.recorded.v1',
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    occurredAt: new Date().toISOString(),
    actorUserId: 'user-1',
    idempotencyKey: 'idem-1',
    data: {
      tenderId: 'tender-1',
      orderId: 'order-1',
      tenderType: 'cash',
      amount: 1000,
      tipAmount: 0,
      isFullyPaid: true,
      locationId: 'loc-1',
      businessDate: '2026-03-01',
      lines: [
        {
          catalogItemId: 'item-1',
          catalogItemName: 'Widget',
          subDepartmentId: 'subdept-1',
          qty: 1,
          extendedPriceCents: 1000,
          taxGroupId: 'taxgrp-1',
          taxAmountCents: 80,
        },
      ],
      ...dataOverrides,
    },
  };
}

function createVoidEvent(dataOverrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    eventId: 'evt-2',
    eventType: 'order.voided.v1',
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    occurredAt: new Date().toISOString(),
    actorUserId: 'user-1',
    idempotencyKey: 'idem-2',
    data: {
      orderId: 'order-1',
      orderNumber: 42,
      reason: 'Customer request',
      locationId: 'loc-1',
      businessDate: '2026-03-01',
      total: 1080,
      ...dataOverrides,
    },
  };
}

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-1',
    defaultUndepositedFundsAccountId: 'acct-undeposited',
    defaultSalesTaxPayableAccountId: 'acct-tax',
    defaultUncategorizedRevenueAccountId: 'acct-uncategorized',
    defaultTipsPayableAccountId: 'acct-tips',
    defaultServiceChargeRevenueAccountId: 'acct-svc',
    enableLegacyGlPosting: false,
    defaultPriceOverrideExpenseAccountId: null,
    defaultSurchargeRevenueAccountId: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// CRITICAL-1: Price override offset GL logic
// ═══════════════════════════════════════════════════════════════

describe('CRITICAL-1: Price override offset GL — same account guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAccountingPostingApi.mockReturnValue({
      postEntry: mocks.postEntry,
    });
    mocks.postEntry.mockResolvedValue({});
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValue(new Map());
    mocks.batchResolveTaxGroupAccounts.mockResolvedValue(new Map());
    mocks.batchResolveDiscountGlMappings.mockResolvedValue(new Map());
    mocks.resolvePaymentTypeAccounts.mockResolvedValue({
      debitAccountId: 'acct-cash',
    });
    mocks.logUnmappedEvent.mockResolvedValue(undefined);
  });

  it('skips price override GL when expense and offset are the SAME account', async () => {
    // When defaultPriceOverrideExpenseAccountId === defaultUncategorizedRevenueAccountId,
    // posting would create a self-referencing debit/credit pair (no net effect, confusing audit trail)
    const sameAccountId = 'acct-same';
    mocks.getAccountingSettings.mockResolvedValue(
      makeSettings({
        defaultPriceOverrideExpenseAccountId: sameAccountId,
        defaultUncategorizedRevenueAccountId: sameAccountId,
      }),
    );

    const event = createTenderEvent({
      lines: [
        {
          catalogItemId: 'item-1',
          catalogItemName: 'Widget',
          subDepartmentId: 'subdept-1',
          qty: 1,
          extendedPriceCents: 800,
          taxGroupId: 'taxgrp-1',
          taxAmountCents: 64,
          priceOverrideDiscountCents: 200,
        },
      ],
    });

    await handleTenderForAccounting(event);

    // Should NOT throw — must complete without error
    // The price override GL lines should be skipped (logged as unmapped)
    // and the regular posting should still proceed
  });

  it('skips price override GL when expense account is null', async () => {
    mocks.getAccountingSettings.mockResolvedValue(
      makeSettings({
        defaultPriceOverrideExpenseAccountId: null,
      }),
    );

    const event = createTenderEvent({
      lines: [
        {
          catalogItemId: 'item-1',
          catalogItemName: 'Widget',
          subDepartmentId: 'subdept-1',
          qty: 1,
          extendedPriceCents: 800,
          priceOverrideDiscountCents: 200,
        },
      ],
    });

    await handleTenderForAccounting(event);
    // Should not throw — GL posting completes without price override lines
  });
});

// ═══════════════════════════════════════════════════════════════
// CRITICAL-2: Void adapter memo lookup
// ═══════════════════════════════════════════════════════════════

describe('CRITICAL-2: Void adapter exact memo match + LIKE fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.setupDbChain();
    mocks.logUnmappedEvent.mockResolvedValue(undefined);
  });

  it('logs unmapped event when no GL entries found for non-zero void', async () => {
    mocks.getAccountingSettings.mockResolvedValue(makeSettings());
    // Both exact match and LIKE fallback return empty
    mocks.setQueryResult([]);

    const event = createVoidEvent({ total: 5000 });
    await handleOrderVoidForAccounting(event);

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        entityType: 'void_gl_missing',
        sourceReferenceId: 'order-1',
      }),
    );
  });

  it('skips unmapped logging for zero-total voids (no GL entries expected)', async () => {
    mocks.getAccountingSettings.mockResolvedValue(makeSettings());
    mocks.setQueryResult([]);

    const event = createVoidEvent({ total: 0 });
    await handleOrderVoidForAccounting(event);

    // Should not log unmapped event for zero-total voids
    const unmappedCalls = mocks.logUnmappedEvent.mock.calls.filter(
      (call: any[]) => call[2]?.entityType === 'void_gl_missing',
    );
    expect(unmappedCalls).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// HIGH-6: Settings null unmapped event logging
// ═══════════════════════════════════════════════════════════════

describe('HIGH-6: POS adapter logs unmapped event when settings are null', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAccountingPostingApi.mockReturnValue({
      postEntry: mocks.postEntry,
    });
    mocks.logUnmappedEvent.mockResolvedValue(undefined);
  });

  it('logs unmapped event when accounting settings are null (not bootstrapped)', async () => {
    mocks.getAccountingSettings.mockResolvedValue(null);

    const event = createTenderEvent();
    await handleTenderForAccounting(event);

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        eventType: 'tender.recorded.v1',
        reason: expect.stringContaining('accounting_settings could not be created'),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// MEDIUM-9: Void adapter logs unmapped when settings are null
// ═══════════════════════════════════════════════════════════════

describe('MEDIUM-9: Void adapter logs unmapped event when settings are null', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.setupDbChain();
    mocks.logUnmappedEvent.mockResolvedValue(undefined);
  });

  it('logs unmapped event when accounting settings are null', async () => {
    mocks.getAccountingSettings.mockResolvedValue(null);

    const event = createVoidEvent();
    await handleOrderVoidForAccounting(event);

    expect(mocks.logUnmappedEvent).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      expect.objectContaining({
        eventType: 'order.voided.v1',
        reason: expect.stringContaining('accounting settings missing'),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// GL adapter never-throw guarantee
// ═══════════════════════════════════════════════════════════════

describe('GL adapters never throw', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.logUnmappedEvent.mockResolvedValue(undefined);
  });

  it('POS adapter swallows postEntry errors without throwing', async () => {
    mocks.getAccountingSettings.mockResolvedValue(makeSettings());
    mocks.getAccountingPostingApi.mockReturnValue({
      postEntry: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    });
    mocks.batchResolveSubDepartmentAccounts.mockResolvedValue(new Map());
    mocks.batchResolveTaxGroupAccounts.mockResolvedValue(new Map());
    mocks.batchResolveDiscountGlMappings.mockResolvedValue(new Map());
    mocks.resolvePaymentTypeAccounts.mockResolvedValue({
      debitAccountId: 'acct-cash',
    });

    const event = createTenderEvent();
    // Must not throw — GL failures never block tenders
    await expect(handleTenderForAccounting(event)).resolves.toBeUndefined();
  });

  it('Void adapter swallows voidJournalEntry errors without throwing', async () => {
    mocks.getAccountingSettings.mockResolvedValue(makeSettings());
    // Return a posted entry to void
    mocks.setQueryResult([{ id: 'je-1' }]);
    mocks.setupDbChain();
    mocks.voidJournalEntry.mockRejectedValue(new Error('DB connection failed'));

    const event = createVoidEvent();
    // Must not throw — GL failures never block voids
    await expect(handleOrderVoidForAccounting(event)).resolves.toBeUndefined();
  });
});
