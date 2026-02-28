import { describe, it, expect } from 'vitest';
import {
  openTabSchema,
  updateTabSchema,
  closeTabSchema,
  voidTabSchema,
  transferTabSchema,
  reopenTabSchema,
  fireCourseSchema,
  sendCourseSchema,
  splitTabSchema,
  listTabsFilterSchema,
  getTabDetailSchema,
  TAB_TYPES,
  TAB_STATUSES,
  SERVICE_TYPES,
  COURSE_STATUSES,
  SPLIT_STRATEGIES,
} from '../validation';

describe('Session 3 Validation', () => {
  describe('openTabSchema', () => {
    it('validates minimal input with defaults', () => {
      const result = openTabSchema.safeParse({
        serverUserId: 'user-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tabType).toBe('dine_in');
        expect(result.data.serviceType).toBe('dine_in');
      }
    });

    it('validates full input', () => {
      const result = openTabSchema.safeParse({
        clientRequestId: 'req-1',
        tabType: 'bar',
        tableId: 'table-1',
        serverUserId: 'user-1',
        partySize: 4,
        guestName: 'John',
        serviceType: 'dine_in',
        businessDate: '2026-02-21',
        customerId: 'cust-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid tab type', () => {
      const result = openTabSchema.safeParse({
        tabType: 'drive_thru',
        serverUserId: 'user-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing serverUserId', () => {
      const result = openTabSchema.safeParse({
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid business date format', () => {
      const result = openTabSchema.safeParse({
        serverUserId: 'user-1',
        businessDate: '02-21-2026',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid tab types', () => {
      for (const tabType of TAB_TYPES) {
        const result = openTabSchema.safeParse({
          tabType,
          serverUserId: 'user-1',
          businessDate: '2026-02-21',
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts all valid service types', () => {
      for (const serviceType of SERVICE_TYPES) {
        const result = openTabSchema.safeParse({
          serviceType,
          serverUserId: 'user-1',
          businessDate: '2026-02-21',
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('updateTabSchema', () => {
    it('validates partial update', () => {
      const result = updateTabSchema.safeParse({
        partySize: 6,
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });

    it('accepts nullable guestName', () => {
      const result = updateTabSchema.safeParse({
        guestName: null,
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });

    it('accepts nullable customerId', () => {
      const result = updateTabSchema.safeParse({
        customerId: null,
        expectedVersion: 2,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing expectedVersion', () => {
      const result = updateTabSchema.safeParse({
        partySize: 4,
      });
      expect(result.success).toBe(false);
    });

    it('accepts service type change', () => {
      const result = updateTabSchema.safeParse({
        serviceType: 'takeout',
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });

    it('accepts course number change', () => {
      const result = updateTabSchema.safeParse({
        currentCourseNumber: 3,
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('closeTabSchema', () => {
    it('validates valid input', () => {
      const result = closeTabSchema.safeParse({
        expectedVersion: 5,
      });
      expect(result.success).toBe(true);
    });

    it('accepts with clientRequestId', () => {
      const result = closeTabSchema.safeParse({
        clientRequestId: 'close-1',
        expectedVersion: 3,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing expectedVersion', () => {
      const result = closeTabSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('voidTabSchema', () => {
    it('validates valid input', () => {
      const result = voidTabSchema.safeParse({
        reason: 'Guest left',
        expectedVersion: 2,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty reason', () => {
      const result = voidTabSchema.safeParse({
        reason: '',
        expectedVersion: 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects reason over 500 chars', () => {
      const result = voidTabSchema.safeParse({
        reason: 'x'.repeat(501),
        expectedVersion: 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing reason', () => {
      const result = voidTabSchema.safeParse({
        expectedVersion: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('transferTabSchema', () => {
    it('validates server transfer', () => {
      const result = transferTabSchema.safeParse({
        toServerUserId: 'user-2',
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });

    it('validates table transfer', () => {
      const result = transferTabSchema.safeParse({
        toTableId: 'table-5',
        expectedVersion: 2,
      });
      expect(result.success).toBe(true);
    });

    it('validates combined transfer with reason', () => {
      const result = transferTabSchema.safeParse({
        toServerUserId: 'user-3',
        toTableId: 'table-7',
        reason: 'Server cut',
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing expectedVersion', () => {
      const result = transferTabSchema.safeParse({
        toServerUserId: 'user-2',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('reopenTabSchema', () => {
    it('validates valid input', () => {
      const result = reopenTabSchema.safeParse({
        expectedVersion: 3,
      });
      expect(result.success).toBe(true);
    });

    it('accepts with clientRequestId', () => {
      const result = reopenTabSchema.safeParse({
        clientRequestId: 'reopen-1',
        expectedVersion: 4,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('fireCourseSchema', () => {
    it('validates valid input', () => {
      const result = fireCourseSchema.safeParse({
        tabId: 'tab-1',
        courseNumber: 2,
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero course number', () => {
      const result = fireCourseSchema.safeParse({
        tabId: 'tab-1',
        courseNumber: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty tabId', () => {
      const result = fireCourseSchema.safeParse({
        tabId: '',
        courseNumber: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('sendCourseSchema', () => {
    it('validates valid input', () => {
      const result = sendCourseSchema.safeParse({
        tabId: 'tab-1',
        courseNumber: 1,
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative course number', () => {
      const result = sendCourseSchema.safeParse({
        tabId: 'tab-1',
        courseNumber: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('splitTabSchema', () => {
    it('validates valid split by seat', () => {
      const result = splitTabSchema.safeParse({
        strategy: 'by_seat',
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });

    it('validates split with details', () => {
      const result = splitTabSchema.safeParse({
        strategy: 'custom_amount',
        details: { amounts: [5000, 3000] },
        expectedVersion: 2,
      });
      expect(result.success).toBe(true);
    });

    it('accepts all valid split strategies', () => {
      for (const strategy of SPLIT_STRATEGIES) {
        const result = splitTabSchema.safeParse({
          strategy,
          expectedVersion: 1,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid strategy', () => {
      const result = splitTabSchema.safeParse({
        strategy: 'random_split',
        expectedVersion: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('listTabsFilterSchema', () => {
    it('validates minimal filter', () => {
      const result = listTabsFilterSchema.safeParse({
        tenantId: 'tenant-1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('validates full filter', () => {
      const result = listTabsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
        serverUserId: 'user-1',
        tableId: 'table-1',
        status: 'open',
        cursor: 'cursor-abc',
        limit: 25,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = listTabsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        status: 'invalid_status',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid tab statuses', () => {
      for (const status of TAB_STATUSES) {
        const result = listTabsFilterSchema.safeParse({
          tenantId: 'tenant-1',
          status,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects limit over 100', () => {
      const result = listTabsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        limit: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getTabDetailSchema', () => {
    it('validates valid input', () => {
      const result = getTabDetailSchema.safeParse({
        tenantId: 'tenant-1',
        tabId: 'tab-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing tabId', () => {
      const result = getTabDetailSchema.safeParse({
        tenantId: 'tenant-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing tenantId', () => {
      const result = getTabDetailSchema.safeParse({
        tabId: 'tab-1',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Enum constants', () => {
    it('has correct TAB_TYPES', () => {
      expect(TAB_TYPES).toEqual(['dine_in', 'bar', 'takeout', 'quick_service']);
    });

    it('has correct TAB_STATUSES', () => {
      expect(TAB_STATUSES).toContain('open');
      expect(TAB_STATUSES).toContain('closed');
      expect(TAB_STATUSES).toContain('voided');
      expect(TAB_STATUSES).toContain('transferred');
      expect(TAB_STATUSES.length).toBeGreaterThanOrEqual(10);
    });

    it('has correct SERVICE_TYPES', () => {
      expect(SERVICE_TYPES).toEqual(['dine_in', 'takeout', 'to_go']);
    });

    it('has correct COURSE_STATUSES', () => {
      expect(COURSE_STATUSES).toEqual(['unsent', 'sent', 'fired', 'served']);
    });

    it('has correct SPLIT_STRATEGIES', () => {
      expect(SPLIT_STRATEGIES).toEqual(['by_seat', 'by_item', 'equal_split', 'custom_amount']);
    });
  });
});
