import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

const {
  mockSelect,
  mockUpdate,
  mockInsert,
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
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();

  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    }),
  });

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  return { mockSelect, mockInsert, mockUpdate };
});

vi.mock('@oppsera/db', () => ({
  tags: { id: 'id', tenantId: 'tenant_id', name: 'name', slug: 'slug', priority: 'priority', conflictsWith: 'conflicts_with', tagGroup: 'tag_group', customerCount: 'customer_count', updatedAt: 'updated_at' },
  customerTags: { id: 'id', tenantId: 'tenant_id', customerId: 'customer_id', tagId: 'tag_id', removedAt: 'removed_at', removedBy: 'removed_by', removedReason: 'removed_reason', expiresAt: 'expires_at' },
  tagAuditLog: {},
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'test-ulid-123'),
}));

// ── Import services ─────────────────────────────────────────────

import { resolveTagConflicts } from '../services/tag-conflict-resolver';
import {
  processExpiredTags,
  computeExpiryDate,
} from '../services/tag-expiration-service';
import {
  buildTagEvidenceSnapshot,
  buildManualTagEvidence,
  computeConfidence,
  renderEvidenceTemplate,
} from '../services/tag-evidence-builder';
import type { SmartTagEvidence } from '../types/smart-tag-conditions';

// ── Helpers ─────────────────────────────────────────────────────

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

function makeTx() {
  const tx = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  };
  return tx;
}

beforeEach(() => {
  // mockReset clears once-queues (clearAllMocks does NOT — gotcha #58)
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();

  // Re-establish default implementations
  mockSelect.mockImplementation(() => makeSelectChain());

  mockInsert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
});

// ═══════════════════════════════════════════════════════════════════
// Tag Conflict Resolver
// ═══════════════════════════════════════════════════════════════════

describe('Tag Conflict Resolver', () => {
  it('allows tag when no conflict rules exist and no active tags', async () => {
    const tx = makeTx();
    mockSelect
      // Incoming tag with no conflicts
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-1',
        name: 'VIP',
        slug: 'vip',
        priority: 100,
        conflictsWith: [],
        tagGroup: null,
      }]))
      // Customer has no active tags
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await resolveTagConflicts(tx, 'tenant-1', 'cust-1', 'tag-1');
    expect(result.allowed).toBe(true);
    expect(result.removedTagIds).toEqual([]);
    expect(result.blockingTagIds).toEqual([]);
  });

  it('allows tag when customer has no active tags', async () => {
    const tx = makeTx();
    // Return incoming tag with conflicts defined
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-vip',
        name: 'VIP',
        slug: 'vip',
        priority: 10,
        conflictsWith: ['churned'],
        tagGroup: null,
      }]))
      // Customer's active tags = empty
      .mockReturnValueOnce(makeSelectChain([]));

    const result = await resolveTagConflicts(tx, 'tenant-1', 'cust-1', 'tag-vip');
    expect(result.allowed).toBe(true);
  });

  it('removes lower-priority conflicting tag when incoming wins', async () => {
    const tx = makeTx();
    mockSelect
      // Incoming tag (priority 10 = high)
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-vip',
        name: 'VIP',
        slug: 'vip',
        priority: 10,
        conflictsWith: ['churned'],
        tagGroup: null,
      }]))
      // Customer's active tags
      .mockReturnValueOnce(makeSelectChain([
        { customerTagId: 'ct-1', tagId: 'tag-churned' },
      ]))
      // Active tag details (priority 50 = lower)
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-churned',
        name: 'Churned',
        slug: 'churned',
        priority: 50,
        conflictsWith: [],
        tagGroup: null,
      }]));

    const result = await resolveTagConflicts(tx, 'tenant-1', 'cust-1', 'tag-vip');
    expect(result.allowed).toBe(true);
    expect(result.removedTagIds).toEqual(['tag-churned']);
    expect(result.explanation).toContain('Churned');
  });

  it('blocks incoming tag when existing tag has higher priority', async () => {
    const tx = makeTx();
    mockSelect
      // Incoming tag (priority 50 = low)
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-churned',
        name: 'Churned',
        slug: 'churned',
        priority: 50,
        conflictsWith: ['vip'],
        tagGroup: null,
      }]))
      // Customer's active tags
      .mockReturnValueOnce(makeSelectChain([
        { customerTagId: 'ct-1', tagId: 'tag-vip' },
      ]))
      // Active tag details (priority 10 = higher)
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-vip',
        name: 'VIP',
        slug: 'vip',
        priority: 10,
        conflictsWith: [],
        tagGroup: null,
      }]));

    const result = await resolveTagConflicts(tx, 'tenant-1', 'cust-1', 'tag-churned');
    expect(result.allowed).toBe(false);
    expect(result.blockingTagIds).toEqual(['tag-vip']);
    expect(result.explanation).toContain('VIP');
  });

  it('existing tag wins on priority tie (incumbent advantage)', async () => {
    const tx = makeTx();
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-silver',
        name: 'Silver Tier',
        slug: 'silver-tier',
        priority: 100,
        conflictsWith: [],
        tagGroup: 'value_tier',
      }]))
      .mockReturnValueOnce(makeSelectChain([
        { customerTagId: 'ct-1', tagId: 'tag-bronze' },
      ]))
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-bronze',
        name: 'Bronze Tier',
        slug: 'bronze-tier',
        priority: 100,
        conflictsWith: [],
        tagGroup: 'value_tier',
      }]));

    const result = await resolveTagConflicts(tx, 'tenant-1', 'cust-1', 'tag-silver');
    expect(result.allowed).toBe(false);
    expect(result.blockingTagIds).toEqual(['tag-bronze']);
  });

  it('detects conflicts via tag group mutual exclusion', async () => {
    const tx = makeTx();
    mockSelect
      // Gold tier incoming (priority 10 = highest)
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-gold',
        name: 'Gold Tier',
        slug: 'gold-tier',
        priority: 10,
        conflictsWith: [],
        tagGroup: 'value_tier',
      }]))
      .mockReturnValueOnce(makeSelectChain([
        { customerTagId: 'ct-1', tagId: 'tag-silver' },
      ]))
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-silver',
        name: 'Silver Tier',
        slug: 'silver-tier',
        priority: 50,
        conflictsWith: [],
        tagGroup: 'value_tier',
      }]));

    const result = await resolveTagConflicts(tx, 'tenant-1', 'cust-1', 'tag-gold');
    expect(result.allowed).toBe(true);
    expect(result.removedTagIds).toEqual(['tag-silver']);
  });

  it('handles reverse conflict (existing tag references incoming)', async () => {
    const tx = makeTx();
    mockSelect
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-a',
        name: 'Tag A',
        slug: 'tag-a',
        priority: 10,
        conflictsWith: [],
        tagGroup: null,
      }]))
      .mockReturnValueOnce(makeSelectChain([
        { customerTagId: 'ct-1', tagId: 'tag-b' },
      ]))
      .mockReturnValueOnce(makeSelectChain([{
        id: 'tag-b',
        name: 'Tag B',
        slug: 'tag-b',
        priority: 50,
        conflictsWith: ['tag-a'], // Tag B conflicts with Tag A
        tagGroup: null,
      }]));

    const result = await resolveTagConflicts(tx, 'tenant-1', 'cust-1', 'tag-a');
    expect(result.allowed).toBe(true);
    expect(result.removedTagIds).toEqual(['tag-b']);
  });

  it('returns allowed=true when tag not found', async () => {
    const tx = makeTx();
    mockSelect.mockReturnValueOnce(makeSelectChain([]));

    const result = await resolveTagConflicts(tx, 'tenant-1', 'cust-1', 'nonexistent');
    expect(result.allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Tag Expiration Service
// ═══════════════════════════════════════════════════════════════════

describe('Tag Expiration Service', () => {
  describe('computeExpiryDate', () => {
    it('returns null for null/undefined/0 expiry days', () => {
      expect(computeExpiryDate(null)).toBeNull();
      expect(computeExpiryDate(undefined)).toBeNull();
      expect(computeExpiryDate(0)).toBeNull();
      expect(computeExpiryDate(-5)).toBeNull();
    });

    it('computes correct expiry date', () => {
      const from = new Date('2026-01-01T00:00:00Z');
      const result = computeExpiryDate(30, from);
      expect(result).toEqual(new Date('2026-01-31T00:00:00Z'));
    });

    it('defaults to now when no base date provided', () => {
      const before = Date.now();
      const result = computeExpiryDate(7);
      const _after = Date.now();

      expect(result).not.toBeNull();
      const expected = before + 7 * 86400000;
      // Within 1 second tolerance
      expect(Math.abs(result!.getTime() - expected)).toBeLessThan(1000);
    });

    it('handles large expiry days', () => {
      const from = new Date('2026-01-01T00:00:00Z');
      const result = computeExpiryDate(365, from);
      expect(result).toEqual(new Date('2027-01-01T00:00:00Z'));
    });
  });

  describe('processExpiredTags', () => {
    it('returns empty result when no expired tags', async () => {
      const tx = makeTx();
      mockSelect.mockReturnValueOnce(makeSelectChain([]));

      const result = await processExpiredTags(tx, 'tenant-1');
      expect(result.processed).toBe(0);
      expect(result.expired).toEqual([]);
    });

    it('processes expired tags and returns results', async () => {
      const tx = makeTx();
      const expiresAt = new Date('2026-01-01T00:00:00Z');

      mockSelect.mockReturnValueOnce(makeSelectChain([{
        customerTagId: 'ct-1',
        customerId: 'cust-1',
        tagId: 'tag-1',
        expiresAt,
        tagName: 'Promo 2025',
      }]));

      // Mock update chain
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      // Mock insert for audit log
      mockInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const result = await processExpiredTags(tx, 'tenant-1');
      expect(result.processed).toBe(1);
      expect(result.expired[0]!.customerId).toBe('cust-1');
      expect(result.expired[0]!.tagName).toBe('Promo 2025');

      // Verify update was called (soft-remove)
      expect(mockUpdate).toHaveBeenCalled();
      // Verify audit log was inserted
      expect(mockInsert).toHaveBeenCalled();
    });

    it('respects batch size', async () => {
      const tx = makeTx();
      // Just check that limit is passed through via the chain
      const chain = makeSelectChain([]);
      mockSelect.mockReturnValueOnce(chain);

      await processExpiredTags(tx, 'tenant-1', 50);
      expect(chain.limit).toHaveBeenCalledWith(50);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// Tag Evidence Builder
// ═══════════════════════════════════════════════════════════════════

describe('Tag Evidence Builder', () => {
  const baseEvidence: SmartTagEvidence = {
    ruleId: 'rule-1',
    ruleName: 'VIP Rule',
    evaluatedAt: '2026-02-27T00:00:00Z',
    conditions: [
      { metric: 'total_spend_cents', operator: 'gte', threshold: 100000, actualValue: 150000, passed: true },
      { metric: 'total_visits', operator: 'gte', threshold: 10, actualValue: 15, passed: true },
    ],
  };

  describe('computeConfidence', () => {
    it('returns 1.0 for empty conditions', () => {
      expect(computeConfidence([])).toBe(1.0);
    });

    it('returns 0 when no conditions passed', () => {
      const conditions = [
        { metric: 'total_visits', operator: 'gte', threshold: 100, actualValue: 5, passed: false },
      ];
      expect(computeConfidence(conditions)).toBe(0);
    });

    it('returns high confidence when conditions pass with large margins', () => {
      const conditions = [
        { metric: 'total_spend_cents', operator: 'gte', threshold: 10000, actualValue: 50000, passed: true },
      ];
      const score = computeConfidence(conditions);
      expect(score).toBeGreaterThan(0.7);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('handles mixed passed/failed conditions', () => {
      const conditions = [
        { metric: 'total_visits', operator: 'gte', threshold: 10, actualValue: 15, passed: true },
        { metric: 'total_spend_cents', operator: 'gte', threshold: 100000, actualValue: 50000, passed: false },
      ];
      const score = computeConfidence(conditions);
      // 50% base pass rate, with some margin bonus
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1.0);
    });

    it('handles eq operator as full confidence', () => {
      const conditions = [
        { metric: 'customer_status', operator: 'eq', threshold: 'active', actualValue: 'active', passed: true },
      ];
      const score = computeConfidence(conditions);
      expect(score).toBe(1.0);
    });

    it('handles non-numeric conditions gracefully', () => {
      const conditions = [
        { metric: 'has_email', operator: 'eq', threshold: true, actualValue: true, passed: true },
        { metric: 'customer_type', operator: 'in', threshold: ['person'], actualValue: 'person', passed: true },
      ];
      const score = computeConfidence(conditions);
      // Both pass with non-numeric values — should give base score
      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe('renderEvidenceTemplate', () => {
    it('returns null for null template', () => {
      expect(renderEvidenceTemplate(null, baseEvidence.conditions)).toBeNull();
    });

    it('replaces value placeholders', () => {
      const template = 'Customer spent {{value:total_spend_cents}}';
      const result = renderEvidenceTemplate(template, baseEvidence.conditions);
      expect(result).toBe('Customer spent 150,000');
    });

    it('replaces threshold placeholders', () => {
      const template = 'Threshold: {{threshold:total_spend_cents}}';
      const result = renderEvidenceTemplate(template, baseEvidence.conditions);
      expect(result).toBe('Threshold: 100,000');
    });

    it('replaces operator placeholders', () => {
      const template = 'Operator: {{operator:total_spend_cents}}';
      const result = renderEvidenceTemplate(template, baseEvidence.conditions);
      expect(result).toBe('Operator: gte');
    });

    it('replaces passed placeholders', () => {
      const template = 'Passed: {{passed:total_spend_cents}}';
      const result = renderEvidenceTemplate(template, baseEvidence.conditions);
      expect(result).toBe('Passed: yes');
    });

    it('handles unknown metric gracefully', () => {
      const template = 'Unknown: {{value:nonexistent}}';
      const result = renderEvidenceTemplate(template, baseEvidence.conditions);
      expect(result).toBe('Unknown: [unknown:nonexistent]');
    });

    it('handles multiple placeholders in one template', () => {
      const template = 'Spent {{value:total_spend_cents}} with {{value:total_visits}} visits';
      const result = renderEvidenceTemplate(template, baseEvidence.conditions);
      expect(result).toBe('Spent 150,000 with 15 visits');
    });
  });

  describe('buildTagEvidenceSnapshot', () => {
    it('builds snapshot with computed confidence', () => {
      const snapshot = buildTagEvidenceSnapshot(baseEvidence);
      expect(snapshot.ruleId).toBe('rule-1');
      expect(snapshot.ruleName).toBe('VIP Rule');
      expect(snapshot.confidence).toBeGreaterThan(0);
      expect(snapshot.confidence).toBeLessThanOrEqual(1.0);
      expect(snapshot.source).toBe('smart_rule');
      expect(snapshot.conditions).toHaveLength(2);
    });

    it('uses provided source', () => {
      const snapshot = buildTagEvidenceSnapshot(baseEvidence, { source: 'predictive' });
      expect(snapshot.source).toBe('predictive');
    });

    it('renders evidence template when provided', () => {
      const snapshot = buildTagEvidenceSnapshot(baseEvidence, {
        evidenceTemplate: 'Customer spent {{value:total_spend_cents}}',
      });
      expect(snapshot.summary).toBe('Customer spent 150,000');
    });

    it('sets summary to null when no template', () => {
      const snapshot = buildTagEvidenceSnapshot(baseEvidence);
      expect(snapshot.summary).toBeNull();
    });

    it('includes metadata when provided', () => {
      const snapshot = buildTagEvidenceSnapshot(baseEvidence, {
        metadata: { triggerEvent: 'order.placed.v1' },
      });
      expect(snapshot.metadata).toEqual({ triggerEvent: 'order.placed.v1' });
    });

    it('omits metadata when not provided', () => {
      const snapshot = buildTagEvidenceSnapshot(baseEvidence);
      expect(snapshot.metadata).toBeUndefined();
    });
  });

  describe('buildManualTagEvidence', () => {
    it('builds evidence for manual tag application', () => {
      const evidence = buildManualTagEvidence('user-123', 'Customer requested VIP');
      expect(evidence.confidence).toBe(1.0);
      expect(evidence.source).toBe('manual');
      expect(evidence.summary).toBe('Customer requested VIP');
      expect(evidence.conditions).toEqual([]);
      expect(evidence.metadata).toEqual({ appliedBy: 'user-123' });
    });

    it('uses default summary when no reason provided', () => {
      const evidence = buildManualTagEvidence('user-123');
      expect(evidence.summary).toBe('Manually applied');
    });

    it('sets evaluatedAt to current timestamp', () => {
      const before = new Date().toISOString();
      const evidence = buildManualTagEvidence('user-123');
      const after = new Date().toISOString();

      expect(evidence.evaluatedAt >= before).toBe(true);
      expect(evidence.evaluatedAt <= after).toBe(true);
    });
  });
});
