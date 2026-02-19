import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockExecute, mockWithTenant } = vi.hoisted(() => {
  const mockExecute = vi.fn();

  const mockWithTenant = vi.fn(
    async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { execute: mockExecute };
      return fn(tx);
    },
  );

  return { mockExecute, mockWithTenant };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
    join: vi.fn(),
  }),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Imports (after mocks) ─────────────────────────────────────

import { getGolfRevenue } from '../queries/get-golf-revenue';
import { getGolfUtilization } from '../queries/get-golf-utilization';
import { getGolfDayparts } from '../queries/get-golf-dayparts';
import { getGolfCustomers, getGolfCustomerKpis } from '../queries/get-golf-customers';
import { getGolfDashboardMetrics } from '../queries/get-golf-dashboard-metrics';

// ── Constants ─────────────────────────────────────────────────

const TENANT = 'tenant_001';
const DATE_INPUT = { tenantId: TENANT, dateFrom: '2026-03-01', dateTo: '2026-03-31' };

// ═══════════════════════════════════════════════════════════════
// getGolfRevenue
// ═══════════════════════════════════════════════════════════════

describe('getGolfRevenue', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns daily revenue rows with numeric conversion', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        business_date: '2026-03-15',
        green_fee_revenue: '5000.0000',
        cart_fee_revenue: '2000.0000',
        range_fee_revenue: '500.0000',
        food_bev_revenue: '1500.0000',
        pro_shop_revenue: '800.0000',
        tax_total: '588.0000',
        total_revenue: '10388.0000',
        rounds_played: '40',
      },
    ]);

    const result = await getGolfRevenue(DATE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]!.businessDate).toBe('2026-03-15');
    expect(result[0]!.greenFeeRevenue).toBe(5000);
    expect(result[0]!.totalRevenue).toBe(10388);
    expect(result[0]!.roundsPlayed).toBe(40);
    expect(result[0]!.revPerRound).toBe(259.7); // 10388/40 = 259.7
    expect(typeof result[0]!.greenFeeRevenue).toBe('number');
  });

  it('returns empty array when no data', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getGolfRevenue(DATE_INPUT);

    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getGolfUtilization
// ═══════════════════════════════════════════════════════════════

describe('getGolfUtilization', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns daily utilization rows with recomputed utilizationBps', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        business_date: '2026-03-15',
        slots_booked: '80',
        slots_available: '100',
        cancellations: '5',
        no_shows: '3',
      },
    ]);

    const result = await getGolfUtilization(DATE_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]!.businessDate).toBe('2026-03-15');
    expect(result[0]!.slotsBooked).toBe(80);
    expect(result[0]!.slotsAvailable).toBe(100);
    expect(result[0]!.utilizationBps).toBe(8000); // 80/100 = 80%
    expect(result[0]!.cancellations).toBe(5);
    expect(result[0]!.noShows).toBe(3);
  });

  it('returns empty array when no data', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getGolfUtilization(DATE_INPUT);

    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// getGolfDayparts
// ═══════════════════════════════════════════════════════════════

describe('getGolfDayparts', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('buckets hours into dayparts with percentages', async () => {
    mockExecute.mockResolvedValueOnce([
      { hour_of_day: 7, slots_booked: '20' },
      { hour_of_day: 8, slots_booked: '30' },
      { hour_of_day: 10, slots_booked: '25' },
      { hour_of_day: 11, slots_booked: '25' },
      { hour_of_day: 13, slots_booked: '15' },
      { hour_of_day: 16, slots_booked: '10' },
    ]);

    const result = await getGolfDayparts(DATE_INPUT);

    expect(result).toHaveLength(5);

    const early = result.find((d) => d.daypart === 'early')!;
    expect(early.slotsBooked).toBe(50); // hours 7+8
    expect(early.label).toBe('Early (6-9)');

    const morning = result.find((d) => d.daypart === 'morning')!;
    expect(morning.slotsBooked).toBe(50); // hours 10+11

    const afternoon = result.find((d) => d.daypart === 'afternoon')!;
    expect(afternoon.slotsBooked).toBe(15); // hour 13

    const twilight = result.find((d) => d.daypart === 'twilight')!;
    expect(twilight.slotsBooked).toBe(10); // hour 16

    const evening = result.find((d) => d.daypart === 'evening')!;
    expect(evening.slotsBooked).toBe(0);

    // Grand total = 125
    expect(early.pctOfTotalBps).toBe(4000); // 50/125 = 40%
    expect(morning.pctOfTotalBps).toBe(4000); // 50/125 = 40%
  });

  it('returns zeros for empty dayparts', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getGolfDayparts(DATE_INPUT);

    expect(result).toHaveLength(5);
    for (const dp of result) {
      expect(dp.slotsBooked).toBe(0);
      expect(dp.pctOfTotalBps).toBe(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// getGolfCustomers
// ═══════════════════════════════════════════════════════════════

describe('getGolfCustomers', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns paginated customer list with hasMore', async () => {
    // Return limit+1 rows to trigger hasMore
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `id_${i}`,
      customer_id: `cust_${i}`,
      customer_name: `Player ${i}`,
      total_rounds: String(10 - i),
      total_revenue: `${(10 - i) * 100}.0000`,
      last_played_at: '2026-03-15T10:00:00Z',
      avg_party_size: '3.5',
    }));

    mockExecute.mockResolvedValueOnce(rows);

    const result = await getGolfCustomers({ tenantId: TENANT, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe('id_1');
    expect(result.items[0]!.customerId).toBe('cust_0');
    expect(result.items[0]!.totalRounds).toBe(10);
    expect(result.items[0]!.totalRevenue).toBe(1000);
    expect(typeof result.items[0]!.totalRevenue).toBe('number');
  });

  it('returns empty items when no customers', async () => {
    mockExecute.mockResolvedValueOnce([]);

    const result = await getGolfCustomers({ tenantId: TENANT });

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// getGolfCustomerKpis
// ═══════════════════════════════════════════════════════════════

describe('getGolfCustomerKpis', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns aggregate customer stats', async () => {
    mockExecute.mockResolvedValueOnce([{
      total_customers: '50',
      total_rounds: '500',
      total_revenue: '75000.0000',
    }]);

    const result = await getGolfCustomerKpis({ tenantId: TENANT });

    expect(result.totalCustomers).toBe(50);
    expect(result.totalRounds).toBe(500);
    expect(result.totalRevenue).toBe(75000);
    expect(result.avgRoundsPerCustomer).toBe(10); // 500/50
    expect(result.avgRevenuePerCustomer).toBe(1500); // 75000/50
  });
});

// ═══════════════════════════════════════════════════════════════
// getGolfDashboardMetrics
// ═══════════════════════════════════════════════════════════════

describe('getGolfDashboardMetrics', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns combined metrics from 4 tables', async () => {
    // 1. demand
    mockExecute.mockResolvedValueOnce([{
      slots_booked: '80', slots_available: '100', cancellations: '10', no_shows: '5',
    }]);
    // 2. revenue
    mockExecute.mockResolvedValueOnce([{
      rounds_played: '40', total_revenue: '8000.0000',
    }]);
    // 3. pace
    mockExecute.mockResolvedValueOnce([{
      rounds_completed: '35', total_duration_min: '8750',
    }]);
    // 4. channel
    mockExecute.mockResolvedValueOnce([{
      online_slots: '50', proshop_slots: '30', phone_slots: '20',
    }]);

    const result = await getGolfDashboardMetrics({ tenantId: TENANT, date: '2026-03-15' });

    expect(result.todayRoundsPlayed).toBe(40);
    expect(result.todayRevenue).toBe(8000);
    expect(result.utilizationBps).toBe(8000); // 80/100
    expect(result.avgRoundDurationMin).toBe(250); // 8750/35
    expect(result.cancelRateBps).toBe(1250); // 10/80
    expect(result.noShowRateBps).toBe(625); // 5/80
    expect(result.onlinePctBps).toBe(5000); // 50/100
  });

  it('returns zeros when no data', async () => {
    mockExecute.mockResolvedValueOnce([{
      slots_booked: '0', slots_available: '0', cancellations: '0', no_shows: '0',
    }]);
    mockExecute.mockResolvedValueOnce([{
      rounds_played: '0', total_revenue: '0',
    }]);
    mockExecute.mockResolvedValueOnce([{
      rounds_completed: '0', total_duration_min: '0',
    }]);
    mockExecute.mockResolvedValueOnce([{
      online_slots: '0', proshop_slots: '0', phone_slots: '0',
    }]);

    const result = await getGolfDashboardMetrics({ tenantId: TENANT, date: '2026-03-15' });

    expect(result.todayRoundsPlayed).toBe(0);
    expect(result.todayRevenue).toBe(0);
    expect(result.utilizationBps).toBe(0);
    expect(result.avgRoundDurationMin).toBe(0);
    expect(result.cancelRateBps).toBe(0);
    expect(result.onlinePctBps).toBe(0);
  });
});
