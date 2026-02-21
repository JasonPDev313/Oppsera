import { describe, it, expect } from 'vitest';
import type {
  FnbTabClosedConsumerData,
  FnbPaymentCompletedConsumerData,
  FnbTicketBumpedConsumerData,
  FnbItemBumpedConsumerData,
  FnbItemVoidedConsumerData,
} from '../helpers/fnb-reporting-utils';

describe('Consumer Data Types', () => {
  it('FnbTabClosedConsumerData shape is valid', () => {
    const data: FnbTabClosedConsumerData = {
      tabId: 'tab_01',
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      serverUserId: 'user_01',
      tableId: 'tbl_01',
      partySize: 4,
      totalCents: 15000,
      tipCents: 2500,
      discountCents: 500,
      compCents: 0,
      openedAt: '2026-02-21T12:00:00Z',
      closedAt: '2026-02-21T13:30:00Z',
      hour: 13,
      items: [
        {
          catalogItemId: 'item_01',
          catalogItemName: 'Steak',
          categoryName: 'Entrees',
          departmentName: 'Food',
          quantity: 1,
          revenueCents: 4500,
        },
      ],
    };
    expect(data.tabId).toBe('tab_01');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]!.catalogItemName).toBe('Steak');
  });

  it('FnbTabClosedConsumerData accepts null tableId', () => {
    const data: FnbTabClosedConsumerData = {
      tabId: 'tab_02',
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      serverUserId: 'user_01',
      tableId: null,
      partySize: 1,
      totalCents: 2500,
      tipCents: 500,
      discountCents: 0,
      compCents: 0,
      openedAt: '2026-02-21T18:00:00Z',
      closedAt: '2026-02-21T18:30:00Z',
      hour: 18,
      items: [],
    };
    expect(data.tableId).toBeNull();
  });

  it('FnbPaymentCompletedConsumerData shape is valid', () => {
    const data: FnbPaymentCompletedConsumerData = {
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      serverUserId: 'user_01',
      totalCents: 15000,
      discountCents: 1000,
      discountType: 'percentage',
      compCents: 0,
      compReason: null,
      voidCount: 0,
      voidReason: null,
    };
    expect(data.totalCents).toBe(15000);
    expect(data.discountType).toBe('percentage');
    expect(data.compReason).toBeNull();
  });

  it('FnbTicketBumpedConsumerData shape is valid', () => {
    const data: FnbTicketBumpedConsumerData = {
      ticketId: 'tk_01',
      locationId: 'loc_01',
      stationId: 'stn_grill',
      businessDate: '2026-02-21',
      ticketTimeSeconds: 420,
      itemCount: 3,
      thresholdSeconds: 600,
      hour: 18,
    };
    expect(data.ticketTimeSeconds).toBe(420);
    expect(data.thresholdSeconds).toBe(600);
    expect(data.itemCount).toBe(3);
  });

  it('FnbItemBumpedConsumerData shape is valid', () => {
    const data: FnbItemBumpedConsumerData = {
      locationId: 'loc_01',
      stationId: 'stn_grill',
      businessDate: '2026-02-21',
    };
    expect(data.stationId).toBe('stn_grill');
  });

  it('FnbItemVoidedConsumerData shape is valid', () => {
    const data: FnbItemVoidedConsumerData = {
      locationId: 'loc_01',
      stationId: 'stn_grill',
      businessDate: '2026-02-21',
    };
    expect(data.stationId).toBe('stn_grill');
  });

  it('FnbTabClosedConsumerData items can have null category/department', () => {
    const data: FnbTabClosedConsumerData = {
      tabId: 'tab_03',
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      serverUserId: 'user_01',
      tableId: 'tbl_05',
      partySize: 2,
      totalCents: 8000,
      tipCents: 1200,
      discountCents: 0,
      compCents: 0,
      openedAt: '2026-02-21T19:00:00Z',
      closedAt: '2026-02-21T20:15:00Z',
      hour: 20,
      items: [
        {
          catalogItemId: 'item_02',
          catalogItemName: 'Special',
          categoryName: null,
          departmentName: null,
          quantity: 2,
          revenueCents: 4000,
        },
      ],
    };
    expect(data.items[0]!.categoryName).toBeNull();
    expect(data.items[0]!.departmentName).toBeNull();
  });

  it('FnbTicketBumpedConsumerData detects past threshold', () => {
    const fast: FnbTicketBumpedConsumerData = {
      ticketId: 'tk_fast',
      locationId: 'loc_01',
      stationId: 'stn_01',
      businessDate: '2026-02-21',
      ticketTimeSeconds: 300,
      itemCount: 2,
      thresholdSeconds: 600,
      hour: 12,
    };
    expect(fast.ticketTimeSeconds > fast.thresholdSeconds).toBe(false);

    const slow: FnbTicketBumpedConsumerData = {
      ticketId: 'tk_slow',
      locationId: 'loc_01',
      stationId: 'stn_01',
      businessDate: '2026-02-21',
      ticketTimeSeconds: 900,
      itemCount: 5,
      thresholdSeconds: 600,
      hour: 19,
    };
    expect(slow.ticketTimeSeconds > slow.thresholdSeconds).toBe(true);
  });

  it('FnbPaymentCompletedConsumerData accepts all discount/comp/void data', () => {
    const data: FnbPaymentCompletedConsumerData = {
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      serverUserId: 'user_01',
      totalCents: 20000,
      discountCents: 2000,
      discountType: 'happy_hour',
      compCents: 1500,
      compReason: 'manager_comp',
      voidCount: 1,
      voidReason: 'wrong_item',
    };
    expect(data.discountType).toBe('happy_hour');
    expect(data.compReason).toBe('manager_comp');
    expect(data.voidReason).toBe('wrong_item');
  });
});
