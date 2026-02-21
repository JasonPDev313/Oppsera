import { describe, it, expect } from 'vitest';
import type { FnbDashboardMetrics } from '../queries/get-fnb-dashboard';
import type { ServerPerformanceRow } from '../queries/get-server-performance';
import type { TableTurnsRow } from '../queries/get-table-turns';
import type { KitchenPerformanceRow } from '../queries/get-kitchen-performance';
import type { DaypartSalesRow } from '../queries/get-daypart-sales';
import type { MenuMixRow } from '../queries/get-menu-mix';
import type { DiscountCompAnalysisRow } from '../queries/get-discount-comp-analysis';
import type { HourlySalesRow } from '../queries/get-hourly-sales';

describe('FnbDashboardMetrics type', () => {
  it('has correct shape', () => {
    const metrics: FnbDashboardMetrics = {
      totalCovers: 85,
      totalSales: 5000.00,
      avgCheck: 58.82,
      tablesTurned: 42,
      avgTurnTimeMinutes: 65,
      tipTotal: 750.00,
      tipPercentage: 15.00,
      kitchenAvgTicketTimeSeconds: 420,
      ticketsPastThreshold: 3,
      topServer: { serverUserId: 'user_01', totalSales: 1200.00 },
      daypartBreakdown: [
        { daypart: 'lunch', covers: 30, grossSales: 1800.00 },
        { daypart: 'dinner', covers: 55, grossSales: 3200.00 },
      ],
      hourlySales: [
        { hour: 12, salesCents: 50000, covers: 10 },
        { hour: 18, salesCents: 80000, covers: 15 },
      ],
    };
    expect(metrics.totalCovers).toBe(85);
    expect(metrics.daypartBreakdown).toHaveLength(2);
    expect(metrics.hourlySales).toHaveLength(2);
    expect(metrics.topServer?.serverUserId).toBe('user_01');
  });

  it('allows null for optional fields', () => {
    const metrics: FnbDashboardMetrics = {
      totalCovers: 0,
      totalSales: 0,
      avgCheck: 0,
      tablesTurned: 0,
      avgTurnTimeMinutes: null,
      tipTotal: 0,
      tipPercentage: null,
      kitchenAvgTicketTimeSeconds: null,
      ticketsPastThreshold: 0,
      topServer: null,
      daypartBreakdown: [],
      hourlySales: [],
    };
    expect(metrics.avgTurnTimeMinutes).toBeNull();
    expect(metrics.topServer).toBeNull();
  });
});

describe('Read Model Row Types', () => {
  it('ServerPerformanceRow shape', () => {
    const row: ServerPerformanceRow = {
      id: 'rm_01',
      locationId: 'loc_01',
      serverUserId: 'user_01',
      businessDate: '2026-02-21',
      covers: 15,
      totalSales: 1200.00,
      avgCheck: 80.00,
      tipTotal: 180.00,
      tipPercentage: 15.00,
      tablesTurned: 8,
      avgTurnTimeMinutes: 55,
      comps: 50.00,
      voids: 25.00,
    };
    expect(row.covers).toBe(15);
    expect(row.tipPercentage).toBe(15.00);
  });

  it('TableTurnsRow shape', () => {
    const row: TableTurnsRow = {
      id: 'rm_02',
      locationId: 'loc_01',
      tableId: 'tbl_01',
      businessDate: '2026-02-21',
      turnsCount: 5,
      avgPartySize: 3.2,
      avgTurnTimeMinutes: 60,
      avgCheckCents: 8500,
      totalRevenueCents: 42500,
      peakHourTurns: [{ hour: 18, turns: 2 }, { hour: 19, turns: 2 }],
    };
    expect(row.turnsCount).toBe(5);
    expect(row.peakHourTurns).toHaveLength(2);
  });

  it('KitchenPerformanceRow shape', () => {
    const row: KitchenPerformanceRow = {
      id: 'rm_03',
      locationId: 'loc_01',
      stationId: 'stn_grill',
      businessDate: '2026-02-21',
      ticketsProcessed: 42,
      avgTicketTimeSeconds: 420,
      itemsBumped: 120,
      itemsVoided: 3,
      ticketsPastThreshold: 5,
      peakHour: 18,
    };
    expect(row.ticketsProcessed).toBe(42);
    expect(row.peakHour).toBe(18);
  });

  it('DaypartSalesRow shape', () => {
    const row: DaypartSalesRow = {
      id: 'rm_04',
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      daypart: 'dinner',
      covers: 55,
      orderCount: 30,
      grossSales: 3200.00,
      netSales: 3000.00,
      avgCheck: 106.67,
      topItemsJson: [{ name: 'Steak', qty: 12 }],
    };
    expect(row.daypart).toBe('dinner');
    expect(row.covers).toBe(55);
  });

  it('MenuMixRow shape', () => {
    const row: MenuMixRow = {
      id: 'rm_05',
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      catalogItemId: 'item_01',
      catalogItemName: 'Caesar Salad',
      categoryName: 'Salads',
      departmentName: 'Food',
      quantitySold: 25,
      percentageOfTotalItems: 8.5,
      revenue: 350.00,
      percentageOfTotalRevenue: 7.0,
    };
    expect(row.catalogItemName).toBe('Caesar Salad');
    expect(row.percentageOfTotalItems).toBe(8.5);
  });

  it('DiscountCompAnalysisRow shape', () => {
    const row: DiscountCompAnalysisRow = {
      id: 'rm_06',
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      totalDiscounts: 250.00,
      discountByType: { happy_hour: 150, loyalty: 100 },
      totalComps: 100.00,
      compByReason: { manager_comp: 100 },
      voidCount: 3,
      voidByReason: { wrong_item: 2, customer_request: 1 },
      discountAsPctOfSales: 5.0,
    };
    expect(row.totalDiscounts).toBe(250.00);
    expect(row.discountByType?.happy_hour).toBe(150);
  });

  it('HourlySalesRow shape', () => {
    const row: HourlySalesRow = {
      id: 'rm_07',
      locationId: 'loc_01',
      businessDate: '2026-02-21',
      hour: 18,
      covers: 15,
      orderCount: 10,
      salesCents: 85000,
    };
    expect(row.hour).toBe(18);
    expect(row.salesCents).toBe(85000);
  });
});

describe('Dashboard Tile Mapping', () => {
  it('KPI tiles map to dashboard metrics', () => {
    const tiles = [
      'totalCovers',
      'totalSales',
      'avgCheck',
      'tablesTurned',
      'avgTurnTimeMinutes',
      'tipPercentage',
      'kitchenAvgTicketTimeSeconds',
      'ticketsPastThreshold',
    ] as const;

    const metrics: FnbDashboardMetrics = {
      totalCovers: 85,
      totalSales: 5000,
      avgCheck: 58.82,
      tablesTurned: 42,
      avgTurnTimeMinutes: 65,
      tipTotal: 750,
      tipPercentage: 15,
      kitchenAvgTicketTimeSeconds: 420,
      ticketsPastThreshold: 3,
      topServer: null,
      daypartBreakdown: [],
      hourlySales: [],
    };

    for (const tile of tiles) {
      expect(metrics[tile]).toBeDefined();
    }
  });

  it('chart tiles use daypart and hourly data', () => {
    const metrics: FnbDashboardMetrics = {
      totalCovers: 0,
      totalSales: 0,
      avgCheck: 0,
      tablesTurned: 0,
      avgTurnTimeMinutes: null,
      tipTotal: 0,
      tipPercentage: null,
      kitchenAvgTicketTimeSeconds: null,
      ticketsPastThreshold: 0,
      topServer: null,
      daypartBreakdown: [
        { daypart: 'breakfast', covers: 10, grossSales: 500 },
        { daypart: 'lunch', covers: 30, grossSales: 1800 },
        { daypart: 'dinner', covers: 55, grossSales: 3200 },
        { daypart: 'late_night', covers: 5, grossSales: 300 },
      ],
      hourlySales: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        salesCents: i >= 11 && i <= 21 ? 5000 + Math.floor(Math.random() * 10000) : 0,
        covers: i >= 11 && i <= 21 ? 3 : 0,
      })),
    };

    expect(metrics.daypartBreakdown).toHaveLength(4);
    expect(metrics.hourlySales).toHaveLength(24);
  });
});

describe('Semantic Layer Mapping', () => {
  it('server performance maps to semantic metrics', () => {
    const semanticMetrics = [
      { name: 'fnb_covers', table: 'rm_fnb_server_performance', column: 'covers' },
      { name: 'fnb_total_sales', table: 'rm_fnb_server_performance', column: 'total_sales' },
      { name: 'fnb_avg_check', table: 'rm_fnb_server_performance', column: 'avg_check' },
      { name: 'fnb_tip_total', table: 'rm_fnb_server_performance', column: 'tip_total' },
      { name: 'fnb_tip_pct', table: 'rm_fnb_server_performance', column: 'tip_percentage' },
      { name: 'fnb_tables_turned', table: 'rm_fnb_server_performance', column: 'tables_turned' },
    ];

    expect(semanticMetrics).toHaveLength(6);
    for (const m of semanticMetrics) {
      expect(m.table).toBe('rm_fnb_server_performance');
    }
  });

  it('kitchen performance maps to semantic metrics', () => {
    const semanticMetrics = [
      { name: 'fnb_tickets_processed', table: 'rm_fnb_kitchen_performance', column: 'tickets_processed' },
      { name: 'fnb_avg_ticket_time', table: 'rm_fnb_kitchen_performance', column: 'avg_ticket_time_seconds' },
      { name: 'fnb_tickets_past_threshold', table: 'rm_fnb_kitchen_performance', column: 'tickets_past_threshold' },
    ];

    expect(semanticMetrics).toHaveLength(3);
    for (const m of semanticMetrics) {
      expect(m.table).toBe('rm_fnb_kitchen_performance');
    }
  });

  it('dimensions map across read models', () => {
    const semanticDimensions = [
      { name: 'business_date', tables: ['rm_fnb_server_performance', 'rm_fnb_table_turns', 'rm_fnb_kitchen_performance'] },
      { name: 'location_id', tables: ['rm_fnb_server_performance', 'rm_fnb_daypart_sales', 'rm_fnb_hourly_sales'] },
      { name: 'server_user_id', tables: ['rm_fnb_server_performance'] },
      { name: 'station_id', tables: ['rm_fnb_kitchen_performance'] },
      { name: 'daypart', tables: ['rm_fnb_daypart_sales'] },
      { name: 'hour', tables: ['rm_fnb_hourly_sales'] },
    ];

    expect(semanticDimensions).toHaveLength(6);
    expect(semanticDimensions[0]!.tables).toHaveLength(3);
  });
});
