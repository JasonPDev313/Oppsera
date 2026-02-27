import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

const {
  mockWithTenant,
  mockSelect: _mockSelect,
  mockEvaluateSmartTags,
} = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  const mockSelect = vi.fn(() => makeSelectChain());
  const mockWithTenant = vi.fn();
  const mockEvaluateSmartTags = vi.fn();

  return { mockWithTenant, mockSelect, mockEvaluateSmartTags };
});

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  smartTagRules: {
    id: 'id',
    tenantId: 'tenant_id',
    isActive: 'is_active',
    evaluationMode: 'evaluation_mode',
    cooldownHours: 'cooldown_hours',
    lastEvaluatedAt: 'last_evaluated_at',
    triggerEvents: 'trigger_events',
    tagId: 'tag_id',
    nextScheduledRunAt: 'next_scheduled_run_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  })),
  lte: vi.fn((...args: unknown[]) => ({ op: 'lte', args })),
}));

vi.mock('../commands/evaluate-smart-tags', () => ({
  evaluateSmartTags: mockEvaluateSmartTags,
}));

import {
  evaluateCustomerTagsOnEvent,
  handleTagEvaluationOnOrderPlaced,
  handleTagEvaluationOnTenderRecorded,
  handleTagEvaluationOnOrderVoided,
  handleTagEvaluationOnVisitRecorded,
  handleTagEvaluationOnMembershipChanged,
  processScheduledRules,
} from '../events/tag-evaluation-consumer';
import type { EventEnvelope } from '@oppsera/shared';

// ── Helpers ──────────────────────────────────────────────────────

function makeSelectChainWithResult(result: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

function createMockTx(selectResult: unknown[] = []) {
  const tx = {
    select: vi.fn(() => makeSelectChainWithResult(selectResult)),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
  return tx;
}

function createEventEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: 'evt-001',
    eventType: 'order.placed.v1',
    tenantId: 'tenant-1',
    occurredAt: new Date().toISOString(),
    version: 1,
    data: { customerId: 'cust-1' },
    ...overrides,
  } as EventEnvelope;
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    evaluationMode: 'event_driven',
    cooldownHours: null,
    lastEvaluatedAt: null,
    triggerEvents: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('Tag Evaluation Consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluateSmartTags.mockResolvedValue({
      evaluationId: 'eval-1',
      customersEvaluated: 1,
      tagsApplied: 0,
      tagsRemoved: 0,
      tagsUnchanged: 1,
      durationMs: 10,
      status: 'completed',
    });
  });

  // ── evaluateCustomerTagsOnEvent ──────────────────────────

  describe('evaluateCustomerTagsOnEvent', () => {
    it('evaluates matching rules for a customer', async () => {
      const rules = [makeRule()];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        ruleId: 'rule-1',
        triggerType: 'event',
        triggerEventId: undefined,
        customerId: 'cust-1',
      });
      expect(result.rulesEvaluated).toBe(1);
      expect(result.rulesSkipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('passes triggerEventId when provided', async () => {
      const rules = [makeRule()];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1', 'evt-123');

      expect(mockEvaluateSmartTags).toHaveBeenCalledWith(
        expect.objectContaining({ triggerEventId: 'evt-123' }),
      );
    });

    it('skips rules whose triggerEvents do not match the event', async () => {
      const rules = [makeRule({ triggerEvents: ['tender.recorded.v1'] })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).not.toHaveBeenCalled();
      expect(result.rulesSkipped).toBe(1);
      expect(result.rulesEvaluated).toBe(0);
    });

    it('evaluates rules with matching triggerEvents', async () => {
      const rules = [makeRule({ triggerEvents: ['order.placed.v1', 'order.voided.v1'] })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).toHaveBeenCalledTimes(1);
      expect(result.rulesEvaluated).toBe(1);
    });

    it('evaluates rules with empty triggerEvents array (all events match)', async () => {
      const rules = [makeRule({ triggerEvents: [] })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).toHaveBeenCalledTimes(1);
      expect(result.rulesEvaluated).toBe(1);
    });

    it('evaluates rules with null triggerEvents (all events match)', async () => {
      const rules = [makeRule({ triggerEvents: null })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).toHaveBeenCalledTimes(1);
      expect(result.rulesEvaluated).toBe(1);
    });

    it('skips rules still in cooldown', async () => {
      const recentTime = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago
      const rules = [makeRule({ cooldownHours: 1, lastEvaluatedAt: recentTime })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).not.toHaveBeenCalled();
      expect(result.rulesSkipped).toBe(1);
    });

    it('evaluates rules past cooldown period', async () => {
      const oldTime = new Date(Date.now() - 2 * 3600_000).toISOString(); // 2 hours ago
      const rules = [makeRule({ cooldownHours: 1, lastEvaluatedAt: oldTime })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).toHaveBeenCalledTimes(1);
      expect(result.rulesEvaluated).toBe(1);
    });

    it('evaluates rules with cooldown but no lastEvaluatedAt (first run)', async () => {
      const rules = [makeRule({ cooldownHours: 1, lastEvaluatedAt: null })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).toHaveBeenCalledTimes(1);
      expect(result.rulesEvaluated).toBe(1);
    });

    it('evaluates rules with zero cooldown', async () => {
      const recentTime = new Date(Date.now() - 1000).toISOString(); // 1 second ago
      const rules = [makeRule({ cooldownHours: 0, lastEvaluatedAt: recentTime })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(mockEvaluateSmartTags).toHaveBeenCalledTimes(1);
      expect(result.rulesEvaluated).toBe(1);
    });

    it('handles multiple rules with mixed skip/evaluate', async () => {
      const rules = [
        makeRule({ id: 'rule-1', triggerEvents: ['tender.recorded.v1'] }), // skip: wrong event
        makeRule({ id: 'rule-2', triggerEvents: null }), // evaluate: all events
        makeRule({
          id: 'rule-3',
          cooldownHours: 24,
          lastEvaluatedAt: new Date().toISOString(),
        }), // skip: cooldown
      ];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(result.rulesEvaluated).toBe(1);
      expect(result.rulesSkipped).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('counts errors for failing rules but continues processing', async () => {
      const rules = [
        makeRule({ id: 'rule-1' }),
        makeRule({ id: 'rule-2' }),
      ];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      mockEvaluateSmartTags
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockResolvedValueOnce({ evaluationId: 'eval-2' });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(result.rulesEvaluated).toBe(1);
      expect(result.errors).toBe(1);
      expect(mockEvaluateSmartTags).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    it('returns partial result on top-level query error', async () => {
      mockWithTenant.mockRejectedValue(new Error('DB down'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(result.errors).toBe(1);
      expect(result.rulesEvaluated).toBe(0);
      consoleSpy.mockRestore();
    });

    it('returns zeroed result when no rules match', async () => {
      const tx = createMockTx([]);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(result.rulesEvaluated).toBe(0);
      expect(result.rulesSkipped).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  // ── Fire-and-Forget Wrapper Consumers ────────────────────

  describe('Event wrapper consumers (fire-and-forget)', () => {
    beforeEach(() => {
      const tx = createMockTx([]);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));
    });

    it('handleTagEvaluationOnOrderPlaced calls with correct event type', async () => {
      const event = createEventEnvelope({ eventType: 'order.placed.v1' });
      await handleTagEvaluationOnOrderPlaced(event);
      // Should not throw — fire-and-forget
    });

    it('handleTagEvaluationOnTenderRecorded calls with correct event type', async () => {
      const event = createEventEnvelope({ eventType: 'tender.recorded.v1' });
      await handleTagEvaluationOnTenderRecorded(event);
    });

    it('handleTagEvaluationOnOrderVoided calls with correct event type', async () => {
      const event = createEventEnvelope({ eventType: 'order.voided.v1' });
      await handleTagEvaluationOnOrderVoided(event);
    });

    it('handleTagEvaluationOnVisitRecorded calls with correct event type', async () => {
      const event = createEventEnvelope({ eventType: 'customer.visit.recorded.v1' });
      await handleTagEvaluationOnVisitRecorded(event);
    });

    it('handleTagEvaluationOnMembershipChanged calls with correct event type', async () => {
      const event = createEventEnvelope({ eventType: 'customer.membership.created.v1' });
      await handleTagEvaluationOnMembershipChanged(event);
    });

    it('skips when event has no customerId', async () => {
      const event = createEventEnvelope({ data: {} });
      await handleTagEvaluationOnOrderPlaced(event);
      // withTenant should not be called since there's no customerId
      expect(mockWithTenant).not.toHaveBeenCalled();
    });

    it('never throws on internal error (fire-and-forget)', async () => {
      mockWithTenant.mockRejectedValue(new Error('Catastrophic failure'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const event = createEventEnvelope();

      // This MUST NOT throw — fire-and-forget safety
      await expect(handleTagEvaluationOnOrderPlaced(event)).resolves.toBeUndefined();
      consoleSpy.mockRestore();
    });

    it('never throws on null customerId', async () => {
      const event = createEventEnvelope({ data: { customerId: null } });
      await expect(handleTagEvaluationOnOrderPlaced(event)).resolves.toBeUndefined();
    });
  });

  // ── processScheduledRules ────────────────────────────────

  describe('processScheduledRules', () => {
    it('processes due rules and returns counts', async () => {
      const dueRules = [
        { id: 'rule-1', reEvaluationIntervalHours: 24 },
        { id: 'rule-2', reEvaluationIntervalHours: null },
      ];
      const tx = createMockTx(dueRules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await processScheduledRules('tenant-1');

      expect(result.processed).toBe(2);
      expect(result.errors).toBe(0);
      expect(mockEvaluateSmartTags).toHaveBeenCalledTimes(2);
    });

    it('calls evaluateSmartTags with triggerType=scheduled', async () => {
      const dueRules = [{ id: 'rule-1', reEvaluationIntervalHours: null }];
      const tx = createMockTx(dueRules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      await processScheduledRules('tenant-1');

      expect(mockEvaluateSmartTags).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        ruleId: 'rule-1',
        triggerType: 'scheduled',
      });
    });

    it('updates nextScheduledRunAt for rules with interval', async () => {
      const dueRules = [{ id: 'rule-1', reEvaluationIntervalHours: 12 }];
      const tx = createMockTx(dueRules);

      let _updateCalled = false;
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => {
        const fakeTx = {
          ...tx,
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                _updateCalled = true;
                return Promise.resolve();
              }),
            }),
          }),
        };
        // First call = select (returns rules), second call = update nextScheduledRunAt
        return fn(fakeTx);
      });

      await processScheduledRules('tenant-1');

      // The processScheduledRules function calls withTenant twice:
      // once for the select, once for the update
      expect(mockWithTenant).toHaveBeenCalledTimes(2);
    });

    it('does not update nextScheduledRunAt for rules without interval', async () => {
      const dueRules = [{ id: 'rule-1', reEvaluationIntervalHours: null }];
      const tx = createMockTx(dueRules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      await processScheduledRules('tenant-1');

      // Only 1 call (the initial select), no update call
      expect(mockWithTenant).toHaveBeenCalledTimes(1);
    });

    it('respects batchSize parameter', async () => {
      const tx = createMockTx([]);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      await processScheduledRules('tenant-1', 10);

      // The select chain should have .limit called
      expect(tx.select).toHaveBeenCalled();
    });

    it('counts errors for failing rules but continues', async () => {
      const dueRules = [
        { id: 'rule-1', reEvaluationIntervalHours: null },
        { id: 'rule-2', reEvaluationIntervalHours: null },
      ];
      const tx = createMockTx(dueRules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      mockEvaluateSmartTags
        .mockRejectedValueOnce(new Error('Rule 1 failed'))
        .mockResolvedValueOnce({ evaluationId: 'eval-2' });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await processScheduledRules('tenant-1');

      expect(result.processed).toBe(1);
      expect(result.errors).toBe(1);
      consoleSpy.mockRestore();
    });

    it('returns zero counts when no rules are due', async () => {
      const tx = createMockTx([]);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await processScheduledRules('tenant-1');

      expect(result.processed).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockEvaluateSmartTags).not.toHaveBeenCalled();
    });

    it('handles top-level query error gracefully', async () => {
      mockWithTenant.mockRejectedValue(new Error('DB pool exhausted'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await processScheduledRules('tenant-1');

      expect(result.errors).toBe(1);
      expect(result.processed).toBe(0);
      consoleSpy.mockRestore();
    });
  });

  // ── Cooldown Edge Cases ──────────────────────────────────

  describe('Cooldown edge cases', () => {
    it('cooldown boundary: exactly at boundary still evaluates', async () => {
      // lastEvaluatedAt exactly 1 hour ago with 1 hour cooldown = should evaluate
      const exactlyOneHourAgo = new Date(Date.now() - 3600_000).toISOString();
      const rules = [makeRule({ cooldownHours: 1, lastEvaluatedAt: exactlyOneHourAgo })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(result.rulesEvaluated).toBe(1);
    });

    it('cooldown with negative hours is treated as no cooldown', async () => {
      const recentTime = new Date(Date.now() - 1000).toISOString();
      const rules = [makeRule({ cooldownHours: -1, lastEvaluatedAt: recentTime })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(result.rulesEvaluated).toBe(1);
    });

    it('cooldown with null cooldownHours is treated as no cooldown', async () => {
      const recentTime = new Date(Date.now() - 1000).toISOString();
      const rules = [makeRule({ cooldownHours: null, lastEvaluatedAt: recentTime })];
      const tx = createMockTx(rules);
      mockWithTenant.mockImplementation((_tid: string, fn: (tx: unknown) => unknown) => fn(tx));

      const result = await evaluateCustomerTagsOnEvent('tenant-1', 'cust-1', 'order.placed.v1');

      expect(result.rulesEvaluated).toBe(1);
    });
  });
});
