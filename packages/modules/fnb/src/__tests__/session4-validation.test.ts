import { describe, it, expect } from 'vitest';
import {
  createKitchenTicketSchema,
  updateTicketItemStatusSchema,
  updateTicketStatusSchema,
  createDeltaChitSchema,
  voidTicketSchema,
  createRoutingRuleSchema,
  updateRoutingRuleSchema,
  listKitchenTicketsFilterSchema,
  getKitchenTicketDetailSchema,
  listRoutingRulesFilterSchema,
  TICKET_STATUSES,
  TICKET_ITEM_STATUSES,
  DELTA_TYPES,
  ROUTING_RULE_TYPES,
} from '../validation';

describe('Session 4 Validation', () => {
  // ── Enums ──────────────────────────────────────────────────────

  describe('Enums', () => {
    it('defines TICKET_STATUSES', () => {
      expect(TICKET_STATUSES).toContain('pending');
      expect(TICKET_STATUSES).toContain('in_progress');
      expect(TICKET_STATUSES).toContain('ready');
      expect(TICKET_STATUSES).toContain('served');
      expect(TICKET_STATUSES).toContain('voided');
      expect(TICKET_STATUSES).toHaveLength(5);
    });

    it('defines TICKET_ITEM_STATUSES', () => {
      expect(TICKET_ITEM_STATUSES).toContain('pending');
      expect(TICKET_ITEM_STATUSES).toContain('cooking');
      expect(TICKET_ITEM_STATUSES).toContain('ready');
      expect(TICKET_ITEM_STATUSES).toContain('served');
      expect(TICKET_ITEM_STATUSES).toContain('voided');
      expect(TICKET_ITEM_STATUSES).toHaveLength(5);
    });

    it('defines DELTA_TYPES', () => {
      expect(DELTA_TYPES).toContain('add');
      expect(DELTA_TYPES).toContain('void');
      expect(DELTA_TYPES).toContain('modify');
      expect(DELTA_TYPES).toContain('rush');
      expect(DELTA_TYPES).toHaveLength(4);
    });

    it('defines ROUTING_RULE_TYPES', () => {
      expect(ROUTING_RULE_TYPES).toContain('item');
      expect(ROUTING_RULE_TYPES).toContain('modifier');
      expect(ROUTING_RULE_TYPES).toContain('department');
      expect(ROUTING_RULE_TYPES).toContain('sub_department');
      expect(ROUTING_RULE_TYPES).toContain('category');
      expect(ROUTING_RULE_TYPES).toHaveLength(5);
    });
  });

  // ── createKitchenTicketSchema ──────────────────────────────────

  describe('createKitchenTicketSchema', () => {
    const validItem = {
      orderLineId: 'line-1',
      itemName: 'Burger',
    };

    it('validates minimal input with defaults', () => {
      const result = createKitchenTicketSchema.safeParse({
        tabId: 'tab-1',
        orderId: 'order-1',
        items: [validItem],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items[0]!.quantity).toBe(1);
        expect(result.data.items[0]!.isRush).toBe(false);
        expect(result.data.items[0]!.isAllergy).toBe(false);
        expect(result.data.items[0]!.isVip).toBe(false);
      }
    });

    it('validates full input', () => {
      const result = createKitchenTicketSchema.safeParse({
        clientRequestId: 'req-1',
        tabId: 'tab-1',
        orderId: 'order-1',
        courseNumber: 2,
        items: [{
          orderLineId: 'line-1',
          itemName: 'Steak',
          modifierSummary: 'Medium Rare, No Salt',
          specialInstructions: 'Allergy: shellfish',
          seatNumber: 3,
          courseName: 'Entree',
          quantity: 2,
          isRush: true,
          isAllergy: true,
          isVip: false,
          stationId: 'station-grill',
        }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty items array', () => {
      const result = createKitchenTicketSchema.safeParse({
        tabId: 'tab-1',
        orderId: 'order-1',
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing tabId', () => {
      const result = createKitchenTicketSchema.safeParse({
        orderId: 'order-1',
        items: [validItem],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing orderId', () => {
      const result = createKitchenTicketSchema.safeParse({
        tabId: 'tab-1',
        items: [validItem],
      });
      expect(result.success).toBe(false);
    });

    it('rejects item missing orderLineId', () => {
      const result = createKitchenTicketSchema.safeParse({
        tabId: 'tab-1',
        orderId: 'order-1',
        items: [{ itemName: 'Burger' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects item missing itemName', () => {
      const result = createKitchenTicketSchema.safeParse({
        tabId: 'tab-1',
        orderId: 'order-1',
        items: [{ orderLineId: 'line-1' }],
      });
      expect(result.success).toBe(false);
    });

    it('accepts multiple items', () => {
      const result = createKitchenTicketSchema.safeParse({
        tabId: 'tab-1',
        orderId: 'order-1',
        items: [
          { orderLineId: 'line-1', itemName: 'Burger' },
          { orderLineId: 'line-2', itemName: 'Fries' },
          { orderLineId: 'line-3', itemName: 'Shake' },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(3);
      }
    });
  });

  // ── updateTicketItemStatusSchema ───────────────────────────────

  describe('updateTicketItemStatusSchema', () => {
    it('validates valid item status', () => {
      for (const status of TICKET_ITEM_STATUSES) {
        const result = updateTicketItemStatusSchema.safeParse({ itemStatus: status });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid item status', () => {
      const result = updateTicketItemStatusSchema.safeParse({ itemStatus: 'burnt' });
      expect(result.success).toBe(false);
    });

    it('rejects missing itemStatus', () => {
      const result = updateTicketItemStatusSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts optional clientRequestId', () => {
      const result = updateTicketItemStatusSchema.safeParse({
        clientRequestId: 'req-1',
        itemStatus: 'cooking',
      });
      expect(result.success).toBe(true);
    });
  });

  // ── updateTicketStatusSchema ───────────────────────────────────

  describe('updateTicketStatusSchema', () => {
    it('validates valid status', () => {
      for (const status of TICKET_STATUSES) {
        const result = updateTicketStatusSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid status', () => {
      const result = updateTicketStatusSchema.safeParse({ status: 'cancelled' });
      expect(result.success).toBe(false);
    });

    it('accepts optional expectedVersion', () => {
      const result = updateTicketStatusSchema.safeParse({
        status: 'in_progress',
        expectedVersion: 3,
      });
      expect(result.success).toBe(true);
    });
  });

  // ── createDeltaChitSchema ──────────────────────────────────────

  describe('createDeltaChitSchema', () => {
    it('validates minimal input', () => {
      const result = createDeltaChitSchema.safeParse({
        ticketId: 'ticket-1',
        deltaType: 'add',
        orderLineId: 'line-1',
        itemName: 'Extra Fries',
      });
      expect(result.success).toBe(true);
    });

    it('validates full input', () => {
      const result = createDeltaChitSchema.safeParse({
        clientRequestId: 'req-1',
        ticketId: 'ticket-1',
        deltaType: 'void',
        orderLineId: 'line-1',
        itemName: 'Burger',
        modifierSummary: 'No Onion',
        seatNumber: 2,
        quantity: 1,
        reason: 'Customer changed mind',
        stationId: 'station-grill',
      });
      expect(result.success).toBe(true);
    });

    it('validates all delta types', () => {
      for (const dt of DELTA_TYPES) {
        const result = createDeltaChitSchema.safeParse({
          ticketId: 'ticket-1',
          deltaType: dt,
          orderLineId: 'line-1',
          itemName: 'Item',
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid delta type', () => {
      const result = createDeltaChitSchema.safeParse({
        ticketId: 'ticket-1',
        deltaType: 'cancel',
        orderLineId: 'line-1',
        itemName: 'Item',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing ticketId', () => {
      const result = createDeltaChitSchema.safeParse({
        deltaType: 'add',
        orderLineId: 'line-1',
        itemName: 'Item',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing orderLineId', () => {
      const result = createDeltaChitSchema.safeParse({
        ticketId: 'ticket-1',
        deltaType: 'add',
        itemName: 'Item',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── voidTicketSchema ───────────────────────────────────────────

  describe('voidTicketSchema', () => {
    it('validates minimal input', () => {
      const result = voidTicketSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('validates with expectedVersion', () => {
      const result = voidTicketSchema.safeParse({ expectedVersion: 5 });
      expect(result.success).toBe(true);
    });

    it('validates with clientRequestId', () => {
      const result = voidTicketSchema.safeParse({
        clientRequestId: 'req-1',
        expectedVersion: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  // ── createRoutingRuleSchema ────────────────────────────────────

  describe('createRoutingRuleSchema', () => {
    it('validates minimal input with defaults', () => {
      const result = createRoutingRuleSchema.safeParse({
        stationId: 'station-1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ruleType).toBe('item');
        expect(result.data.priority).toBe(0);
      }
    });

    it('validates full input', () => {
      const result = createRoutingRuleSchema.safeParse({
        clientRequestId: 'req-1',
        ruleType: 'department',
        departmentId: 'dept-1',
        subDepartmentId: 'sub-1',
        stationId: 'station-1',
        priority: 10,
      });
      expect(result.success).toBe(true);
    });

    it('validates all rule types', () => {
      for (const rt of ROUTING_RULE_TYPES) {
        const result = createRoutingRuleSchema.safeParse({
          ruleType: rt,
          stationId: 'station-1',
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid rule type', () => {
      const result = createRoutingRuleSchema.safeParse({
        ruleType: 'unknown_type',
        stationId: 'station-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing stationId', () => {
      const result = createRoutingRuleSchema.safeParse({
        ruleType: 'item',
      });
      expect(result.success).toBe(false);
    });

    it('accepts item-specific routing', () => {
      const result = createRoutingRuleSchema.safeParse({
        ruleType: 'item',
        catalogItemId: 'item-123',
        stationId: 'station-grill',
        priority: 5,
      });
      expect(result.success).toBe(true);
    });

    it('accepts modifier-specific routing', () => {
      const result = createRoutingRuleSchema.safeParse({
        ruleType: 'modifier',
        modifierId: 'mod-1',
        stationId: 'station-bar',
      });
      expect(result.success).toBe(true);
    });
  });

  // ── updateRoutingRuleSchema ────────────────────────────────────

  describe('updateRoutingRuleSchema', () => {
    it('validates partial update — stationId only', () => {
      const result = updateRoutingRuleSchema.safeParse({
        stationId: 'station-2',
      });
      expect(result.success).toBe(true);
    });

    it('validates partial update — priority only', () => {
      const result = updateRoutingRuleSchema.safeParse({
        priority: 20,
      });
      expect(result.success).toBe(true);
    });

    it('validates partial update — isActive only', () => {
      const result = updateRoutingRuleSchema.safeParse({
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it('validates full update', () => {
      const result = updateRoutingRuleSchema.safeParse({
        clientRequestId: 'req-1',
        stationId: 'station-new',
        priority: 15,
        isActive: true,
      });
      expect(result.success).toBe(true);
    });
  });

  // ── listKitchenTicketsFilterSchema ─────────────────────────────

  describe('listKitchenTicketsFilterSchema', () => {
    it('validates required fields', () => {
      const result = listKitchenTicketsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it('validates with all optional filters', () => {
      const result = listKitchenTicketsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
        status: 'in_progress',
        tabId: 'tab-1',
        stationId: 'station-1',
        cursor: 'cursor-abc',
        limit: 50,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing tenantId', () => {
      const result = listKitchenTicketsFilterSchema.safeParse({
        locationId: 'loc-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing locationId', () => {
      const result = listKitchenTicketsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        businessDate: '2026-02-21',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing businessDate', () => {
      const result = listKitchenTicketsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid businessDate format', () => {
      const result = listKitchenTicketsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '02/21/2026',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = listKitchenTicketsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
        status: 'cancelled',
      });
      expect(result.success).toBe(false);
    });

    it('rejects limit over 200', () => {
      const result = listKitchenTicketsFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        businessDate: '2026-02-21',
        limit: 201,
      });
      expect(result.success).toBe(false);
    });
  });

  // ── getKitchenTicketDetailSchema ───────────────────────────────

  describe('getKitchenTicketDetailSchema', () => {
    it('validates required fields', () => {
      const result = getKitchenTicketDetailSchema.safeParse({
        tenantId: 'tenant-1',
        ticketId: 'ticket-1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing tenantId', () => {
      const result = getKitchenTicketDetailSchema.safeParse({
        ticketId: 'ticket-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing ticketId', () => {
      const result = getKitchenTicketDetailSchema.safeParse({
        tenantId: 'tenant-1',
      });
      expect(result.success).toBe(false);
    });
  });

  // ── listRoutingRulesFilterSchema ───────────────────────────────

  describe('listRoutingRulesFilterSchema', () => {
    it('validates required fields with default isActive', () => {
      const result = listRoutingRulesFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
      }
    });

    it('validates with all optional filters', () => {
      const result = listRoutingRulesFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        stationId: 'station-1',
        ruleType: 'department',
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing tenantId', () => {
      const result = listRoutingRulesFilterSchema.safeParse({
        locationId: 'loc-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing locationId', () => {
      const result = listRoutingRulesFilterSchema.safeParse({
        tenantId: 'tenant-1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid ruleType', () => {
      const result = listRoutingRulesFilterSchema.safeParse({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        ruleType: 'unknown_type',
      });
      expect(result.success).toBe(false);
    });
  });
});
