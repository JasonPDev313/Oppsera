import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted Mocks ──────────────────────────────────────────────────────
const { mockSelect } = vi.hoisted(() => {
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
  return { mockSelect, makeSelectChain };
});

vi.mock('@oppsera/db', () => ({
  tags: {
    id: 'tags.id',
    tenantId: 'tags.tenant_id',
    name: 'tags.name',
    slug: 'tags.slug',
    priority: 'tags.priority',
    conflictsWith: 'tags.conflicts_with',
    tagGroup: 'tags.tag_group',
  },
  customerTags: {
    id: 'customer_tags.id',
    tenantId: 'customer_tags.tenant_id',
    customerId: 'customer_tags.customer_id',
    tagId: 'customer_tags.tag_id',
    removedAt: 'customer_tags.removed_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  inArray: vi.fn((col: unknown, vals: unknown[]) => ({ type: 'inArray', col, vals })),
}));

import { resolveTagConflicts } from '../services/tag-conflict-resolver';

// Helper to build a mock tx
function makeTx() {
  return { select: mockSelect };
}

describe('Tag Conflict Resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TENANT = 'tenant-1';
  const CUSTOMER = 'cust-1';

  describe('resolveTagConflicts', () => {
    it('allows tag when incoming tag not found', async () => {
      // First select returns empty (tag not found)
      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([])),
      };
      mockSelect.mockReturnValueOnce(chain as any);

      const result = await resolveTagConflicts(makeTx(), TENANT, CUSTOMER, 'tag-unknown');
      expect(result.allowed).toBe(true);
      expect(result.explanation).toContain('not found');
    });

    it('allows tag when customer has no active tags', async () => {
      // First select: incoming tag found
      const incomingTag = {
        id: 'tag-vip',
        name: 'VIP',
        slug: 'vip',
        priority: 1,
        conflictsWith: ['regular'],
        tagGroup: null,
      };
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([incomingTag])),
      };
      // Second select: no active customer tags
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([])),
      };

      mockSelect.mockReturnValueOnce(chain1 as any).mockReturnValueOnce(chain2 as any);

      const result = await resolveTagConflicts(makeTx(), TENANT, CUSTOMER, 'tag-vip');
      expect(result.allowed).toBe(true);
      expect(result.explanation).toContain('no active tags');
    });

    it('allows tag when no conflicts exist', async () => {
      const incomingTag = {
        id: 'tag-vip',
        name: 'VIP',
        slug: 'vip',
        priority: 1,
        conflictsWith: [],
        tagGroup: null,
      };
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([incomingTag])),
      };
      // Active customer tags
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{ customerTagId: 'ct-1', tagId: 'tag-loyalty' }]),
        ),
      };
      // Active tag details — no conflicts
      const chain3 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{
            id: 'tag-loyalty',
            name: 'Loyalty',
            slug: 'loyalty',
            priority: 5,
            conflictsWith: [],
            tagGroup: null,
          }]),
        ),
      };

      mockSelect
        .mockReturnValueOnce(chain1 as any)
        .mockReturnValueOnce(chain2 as any)
        .mockReturnValueOnce(chain3 as any);

      const result = await resolveTagConflicts(makeTx(), TENANT, CUSTOMER, 'tag-vip');
      expect(result.allowed).toBe(true);
      expect(result.removedTagIds).toHaveLength(0);
      expect(result.blockingTagIds).toHaveLength(0);
    });

    it('removes lower-priority conflicting tags when incoming wins', async () => {
      const incomingTag = {
        id: 'tag-vip',
        name: 'VIP',
        slug: 'vip',
        priority: 1, // Higher priority (lower number)
        conflictsWith: ['regular'],
        tagGroup: null,
      };
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([incomingTag])),
      };
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{ customerTagId: 'ct-1', tagId: 'tag-regular' }]),
        ),
      };
      const chain3 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{
            id: 'tag-regular',
            name: 'Regular',
            slug: 'regular',
            priority: 10, // Lower priority
            conflictsWith: [],
            tagGroup: null,
          }]),
        ),
      };

      mockSelect
        .mockReturnValueOnce(chain1 as any)
        .mockReturnValueOnce(chain2 as any)
        .mockReturnValueOnce(chain3 as any);

      const result = await resolveTagConflicts(makeTx(), TENANT, CUSTOMER, 'tag-vip');
      expect(result.allowed).toBe(true);
      expect(result.removedTagIds).toEqual(['tag-regular']);
      expect(result.explanation).toContain('Regular');
    });

    it('blocks incoming when existing tag has higher priority', async () => {
      const incomingTag = {
        id: 'tag-regular',
        name: 'Regular',
        slug: 'regular',
        priority: 10, // Lower priority (higher number)
        conflictsWith: ['vip'],
        tagGroup: null,
      };
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([incomingTag])),
      };
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{ customerTagId: 'ct-1', tagId: 'tag-vip' }]),
        ),
      };
      const chain3 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{
            id: 'tag-vip',
            name: 'VIP',
            slug: 'vip',
            priority: 1, // Higher priority
            conflictsWith: [],
            tagGroup: null,
          }]),
        ),
      };

      mockSelect
        .mockReturnValueOnce(chain1 as any)
        .mockReturnValueOnce(chain2 as any)
        .mockReturnValueOnce(chain3 as any);

      const result = await resolveTagConflicts(makeTx(), TENANT, CUSTOMER, 'tag-regular');
      expect(result.allowed).toBe(false);
      expect(result.blockingTagIds).toEqual(['tag-vip']);
      expect(result.explanation).toContain('VIP');
    });

    it('existing tag wins tie (incumbent advantage)', async () => {
      const incomingTag = {
        id: 'tag-a',
        name: 'Tag A',
        slug: 'tag-a',
        priority: 5,
        conflictsWith: ['tag-b'],
        tagGroup: null,
      };
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([incomingTag])),
      };
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{ customerTagId: 'ct-1', tagId: 'tag-b-id' }]),
        ),
      };
      const chain3 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{
            id: 'tag-b-id',
            name: 'Tag B',
            slug: 'tag-b',
            priority: 5, // Same priority
            conflictsWith: [],
            tagGroup: null,
          }]),
        ),
      };

      mockSelect
        .mockReturnValueOnce(chain1 as any)
        .mockReturnValueOnce(chain2 as any)
        .mockReturnValueOnce(chain3 as any);

      const result = await resolveTagConflicts(makeTx(), TENANT, CUSTOMER, 'tag-a');
      expect(result.allowed).toBe(false);
      expect(result.blockingTagIds).toEqual(['tag-b-id']);
    });

    it('detects reverse conflicts (active tag lists incoming as conflict)', async () => {
      const incomingTag = {
        id: 'tag-new',
        name: 'New',
        slug: 'new',
        priority: 10,
        conflictsWith: [], // Incoming has no conflicts listed
        tagGroup: null,
      };
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([incomingTag])),
      };
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{ customerTagId: 'ct-1', tagId: 'tag-existing' }]),
        ),
      };
      const chain3 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{
            id: 'tag-existing',
            name: 'Existing',
            slug: 'existing',
            priority: 1,
            conflictsWith: ['new'], // Reverse: existing conflicts with incoming
            tagGroup: null,
          }]),
        ),
      };

      mockSelect
        .mockReturnValueOnce(chain1 as any)
        .mockReturnValueOnce(chain2 as any)
        .mockReturnValueOnce(chain3 as any);

      const result = await resolveTagConflicts(makeTx(), TENANT, CUSTOMER, 'tag-new');
      expect(result.allowed).toBe(false);
      expect(result.blockingTagIds).toEqual(['tag-existing']);
    });

    it('detects tag group mutual exclusion', async () => {
      const incomingTag = {
        id: 'tag-gold',
        name: 'Gold Tier',
        slug: 'gold-tier',
        priority: 2,
        conflictsWith: [],
        tagGroup: 'membership-tier', // Same group
      };
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve([incomingTag])),
      };
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{ customerTagId: 'ct-1', tagId: 'tag-silver' }]),
        ),
      };
      const chain3 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) =>
          resolve([{
            id: 'tag-silver',
            name: 'Silver Tier',
            slug: 'silver-tier',
            priority: 5,
            conflictsWith: [],
            tagGroup: 'membership-tier', // Same group
          }]),
        ),
      };

      mockSelect
        .mockReturnValueOnce(chain1 as any)
        .mockReturnValueOnce(chain2 as any)
        .mockReturnValueOnce(chain3 as any);

      const result = await resolveTagConflicts(makeTx(), TENANT, CUSTOMER, 'tag-gold');
      // Gold has priority 2, Silver has 5 — Gold wins
      expect(result.allowed).toBe(true);
      expect(result.removedTagIds).toEqual(['tag-silver']);
    });
  });
});
