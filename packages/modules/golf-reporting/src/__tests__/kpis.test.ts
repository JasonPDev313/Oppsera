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

import { getTeeSheetKpis } from '../kpis/get-tee-sheet-kpis';
import { getPaceKpis } from '../kpis/get-pace-kpis';
import { getChannelKpis } from '../kpis/get-channel-kpis';

// ── Constants ─────────────────────────────────────────────────

const TENANT = 'tenant_001';
const BASE_INPUT = { tenantId: TENANT, dateFrom: '2026-03-01', dateTo: '2026-03-31' };

// ═══════════════════════════════════════════════════════════════
// getTeeSheetKpis
// ═══════════════════════════════════════════════════════════════

describe('getTeeSheetKpis', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns aggregated KPIs with computed rates', async () => {
    mockExecute.mockResolvedValueOnce([{
      slots_booked: '200',
      slots_available: '400',
      cancellations: '20',
      no_shows: '10',
    }]);

    const result = await getTeeSheetKpis(BASE_INPUT);

    expect(result.slotsBooked).toBe(200);
    expect(result.slotsAvailable).toBe(400);
    expect(result.utilizationBps).toBe(5000); // 200/400 = 50%
    expect(result.cancellations).toBe(20);
    expect(result.noShows).toBe(10);
    expect(result.netPlayers).toBe(170); // 200 - 20 - 10
    expect(result.cancelRateBps).toBe(1000); // 20/200 = 10%
    expect(result.noShowRateBps).toBe(500); // 10/200 = 5%
  });

  it('returns zeros when no data', async () => {
    mockExecute.mockResolvedValueOnce([{
      slots_booked: '0',
      slots_available: '0',
      cancellations: '0',
      no_shows: '0',
    }]);

    const result = await getTeeSheetKpis(BASE_INPUT);

    expect(result.slotsBooked).toBe(0);
    expect(result.utilizationBps).toBe(0);
    expect(result.cancelRateBps).toBe(0);
    expect(result.noShowRateBps).toBe(0);
    expect(result.netPlayers).toBe(0);
  });

  it('applies courseId filter and calls withTenant', async () => {
    mockExecute.mockResolvedValueOnce([{
      slots_booked: '50',
      slots_available: '100',
      cancellations: '5',
      no_shows: '2',
    }]);

    const result = await getTeeSheetKpis({ ...BASE_INPUT, courseId: 'course_001' });

    expect(mockWithTenant).toHaveBeenCalledWith(TENANT, expect.any(Function));
    expect(result.slotsBooked).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// getPaceKpis
// ═══════════════════════════════════════════════════════════════

describe('getPaceKpis', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns pace + ops KPIs from 2 queries', async () => {
    // Query 1: pace_daily
    mockExecute.mockResolvedValueOnce([{
      rounds_completed: '50',
      total_duration_min: '12500',
      slow_rounds_count: '5',
    }]);
    // Query 2: ops_daily
    mockExecute.mockResolvedValueOnce([{
      starts_count: '60',
      late_starts_count: '6',
      total_start_delay_min: '30',
    }]);

    const result = await getPaceKpis(BASE_INPUT);

    expect(result.roundsCompleted).toBe(50);
    expect(result.avgRoundDurationMin).toBe(250); // 12500/50
    expect(result.slowRoundsCount).toBe(5);
    expect(result.slowRoundPctBps).toBe(1000); // 5/50 = 10%
    expect(result.avgMinutesPerHole).toBe(13.89); // 12500/(50*18) = 13.888...
    expect(result.startsCount).toBe(60);
    expect(result.lateStartsCount).toBe(6);
    expect(result.avgStartDelayMin).toBe(0.5); // 30/60
    expect(result.intervalComplianceBps).toBe(9000); // (60-6)/60 = 90%
  });

  it('recomputes weighted avgRoundDuration (not average of averages)', async () => {
    // Two days aggregated: day1=10 rounds@200min, day2=20 rounds@260min
    // Correct weighted avg = (2000+5200)/30 = 240
    // Wrong (avg of avg) = (200+260)/2 = 230
    mockExecute.mockResolvedValueOnce([{
      rounds_completed: '30',
      total_duration_min: '7200',
      slow_rounds_count: '3',
    }]);
    mockExecute.mockResolvedValueOnce([{
      starts_count: '30',
      late_starts_count: '0',
      total_start_delay_min: '0',
    }]);

    const result = await getPaceKpis(BASE_INPUT);

    expect(result.avgRoundDurationMin).toBe(240); // 7200/30 = 240, not 230
  });

  it('recomputes intervalComplianceBps from totals', async () => {
    mockExecute.mockResolvedValueOnce([{
      rounds_completed: '0',
      total_duration_min: '0',
      slow_rounds_count: '0',
    }]);
    mockExecute.mockResolvedValueOnce([{
      starts_count: '100',
      late_starts_count: '15',
      total_start_delay_min: '75',
    }]);

    const result = await getPaceKpis(BASE_INPUT);

    expect(result.intervalComplianceBps).toBe(8500); // (100-15)/100 = 85%
  });

  it('returns zeros when no data', async () => {
    mockExecute.mockResolvedValueOnce([{
      rounds_completed: '0',
      total_duration_min: '0',
      slow_rounds_count: '0',
    }]);
    mockExecute.mockResolvedValueOnce([{
      starts_count: '0',
      late_starts_count: '0',
      total_start_delay_min: '0',
    }]);

    const result = await getPaceKpis(BASE_INPUT);

    expect(result.roundsCompleted).toBe(0);
    expect(result.avgRoundDurationMin).toBe(0);
    expect(result.avgStartDelayMin).toBe(0);
    expect(result.intervalComplianceBps).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// getChannelKpis
// ═══════════════════════════════════════════════════════════════

describe('getChannelKpis', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns channel mix with computed percentages', async () => {
    mockExecute.mockResolvedValueOnce([{
      online_slots: '60',
      proshop_slots: '30',
      phone_slots: '10',
      member_rounds: '40',
      public_rounds: '50',
      league_rounds: '5',
      outing_rounds: '5',
      booking_count: '80',
      total_lead_time_hours: '2400',
      last_minute_count: '10',
      advanced_count: '20',
    }]);

    const result = await getChannelKpis(BASE_INPUT);

    expect(result.onlineSlots).toBe(60);
    expect(result.proshopSlots).toBe(30);
    expect(result.phoneSlots).toBe(10);
    expect(result.totalSlots).toBe(100);
    expect(result.onlinePctBps).toBe(6000); // 60/100 = 60%
    expect(result.proshopPctBps).toBe(3000); // 30/100
    expect(result.phonePctBps).toBe(1000); // 10/100
  });

  it('returns booking type breakdowns', async () => {
    mockExecute.mockResolvedValueOnce([{
      online_slots: '50',
      proshop_slots: '50',
      phone_slots: '0',
      member_rounds: '30',
      public_rounds: '40',
      league_rounds: '20',
      outing_rounds: '10',
      booking_count: '80',
      total_lead_time_hours: '1600',
      last_minute_count: '5',
      advanced_count: '15',
    }]);

    const result = await getChannelKpis(BASE_INPUT);

    expect(result.memberRounds).toBe(30);
    expect(result.publicRounds).toBe(40);
    expect(result.leagueRounds).toBe(20);
    expect(result.outingRounds).toBe(10);
  });

  it('computes weighted avgLeadTimeHours', async () => {
    mockExecute.mockResolvedValueOnce([{
      online_slots: '50',
      proshop_slots: '50',
      phone_slots: '0',
      member_rounds: '0',
      public_rounds: '100',
      league_rounds: '0',
      outing_rounds: '0',
      booking_count: '100',
      total_lead_time_hours: '7200',
      last_minute_count: '10',
      advanced_count: '25',
    }]);

    const result = await getChannelKpis(BASE_INPUT);

    expect(result.avgLeadTimeHours).toBe(72); // 7200/100
    expect(result.lastMinutePctBps).toBe(1000); // 10/100 = 10%
    expect(result.advancedPctBps).toBe(2500); // 25/100 = 25%
  });

  it('returns zeros when no data', async () => {
    mockExecute.mockResolvedValueOnce([{
      online_slots: '0',
      proshop_slots: '0',
      phone_slots: '0',
      member_rounds: '0',
      public_rounds: '0',
      league_rounds: '0',
      outing_rounds: '0',
      booking_count: '0',
      total_lead_time_hours: '0',
      last_minute_count: '0',
      advanced_count: '0',
    }]);

    const result = await getChannelKpis(BASE_INPUT);

    expect(result.totalSlots).toBe(0);
    expect(result.onlinePctBps).toBe(0);
    expect(result.avgLeadTimeHours).toBe(0);
    expect(result.lastMinutePctBps).toBe(0);
  });
});
