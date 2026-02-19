import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

/**
 * Seed 3 default golf dashboards for a tenant.
 *
 * Dashboard 1: "GM Daily" — 8 metric tiles (single-value KPIs)
 * Dashboard 2: "Yield & Demand" — 6 chart tiles (line/bar)
 * Dashboard 3: "Ops" — 4 chart tiles (line/bar)
 *
 * Creates associated report_definitions for chart tiles, then
 * dashboard_definitions referencing them.
 *
 * Idempotent: uses ON CONFLICT (tenant_id, name) DO NOTHING.
 */
export async function seedGolfDashboards(
  tenantId: string,
  createdBy: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    // ── Report definitions for chart-based tiles ───────────────

    // Yield & Demand reports
    const revTrendId = generateUlid();
    const utilTrendId = generateUlid();
    const daypartId = generateUlid();
    const channelMixId = generateUlid();
    const revBreakdownId = generateUlid();
    const bookingTypeId = generateUlid();

    // Ops reports
    const paceTrendId = generateUlid();
    const complianceTrendId = generateUlid();
    const slowRoundsTrendId = generateUlid();
    const startDelayTrendId = generateUlid();

    const reportDefs = [
      // Yield & Demand
      {
        id: revTrendId,
        name: 'Golf Revenue Trend',
        dataset: 'golf_revenue',
        definition: {
          columns: ['business_date', 'total_revenue', 'rounds_played'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
      {
        id: utilTrendId,
        name: 'Golf Utilization Trend',
        dataset: 'golf_utilization',
        definition: {
          columns: ['business_date', 'slots_booked', 'slots_available'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
      {
        id: daypartId,
        name: 'Golf Daypart Distribution',
        dataset: 'golf_tee_time_fact',
        definition: {
          columns: ['business_date', 'party_size_booked'],
          filters: [],
          groupBy: ['business_date'],
        },
      },
      {
        id: channelMixId,
        name: 'Golf Channel Mix',
        dataset: 'golf_channel',
        definition: {
          columns: ['business_date', 'online_slots_booked', 'proshop_slots_booked', 'phone_slots_booked'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
      {
        id: revBreakdownId,
        name: 'Golf Revenue Breakdown',
        dataset: 'golf_revenue',
        definition: {
          columns: ['business_date', 'green_fee_revenue', 'cart_fee_revenue', 'food_bev_revenue', 'pro_shop_revenue'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
      {
        id: bookingTypeId,
        name: 'Golf Booking Types',
        dataset: 'golf_channel',
        definition: {
          columns: ['business_date', 'member_rounds', 'public_rounds'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
      // Ops
      {
        id: paceTrendId,
        name: 'Golf Pace Trend',
        dataset: 'golf_pace',
        definition: {
          columns: ['business_date', 'total_duration_min', 'rounds_completed'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
      {
        id: complianceTrendId,
        name: 'Golf Interval Compliance',
        dataset: 'golf_ops',
        definition: {
          columns: ['business_date', 'starts_count', 'late_starts_count'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
      {
        id: slowRoundsTrendId,
        name: 'Golf Slow Rounds',
        dataset: 'golf_pace',
        definition: {
          columns: ['business_date', 'slow_rounds_count', 'rounds_completed'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
      {
        id: startDelayTrendId,
        name: 'Golf Start Delay',
        dataset: 'golf_ops',
        definition: {
          columns: ['business_date', 'total_start_delay_min', 'starts_count'],
          filters: [],
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
        },
      },
    ];

    for (const rd of reportDefs) {
      await (tx as any).execute(sql`
        INSERT INTO report_definitions (id, tenant_id, name, dataset, definition, created_by)
        VALUES (
          ${rd.id},
          ${tenantId},
          ${rd.name},
          ${rd.dataset},
          ${JSON.stringify(rd.definition)}::jsonb,
          ${createdBy}
        )
        ON CONFLICT DO NOTHING
      `);
    }

    // ── Dashboard 1: GM Daily (8 metric tiles, 4×2 grid) ─────

    // For metric tiles we create minimal single-measure report_definitions
    const metricReportIds = {
      todayRounds: generateUlid(),
      todayRevenue: generateUlid(),
      utilization: generateUlid(),
      avgDuration: generateUlid(),
      cancelRate: generateUlid(),
      noShowRate: generateUlid(),
      onlinePct: generateUlid(),
      netPlayers: generateUlid(),
    };

    const metricReportDefs = [
      { id: metricReportIds.todayRounds, name: 'GM: Today Rounds', dataset: 'golf_revenue', definition: { columns: ['rounds_played'], filters: [] } },
      { id: metricReportIds.todayRevenue, name: 'GM: Today Revenue', dataset: 'golf_revenue', definition: { columns: ['total_revenue'], filters: [] } },
      { id: metricReportIds.utilization, name: 'GM: Utilization', dataset: 'golf_utilization', definition: { columns: ['utilization_pct_bp'], filters: [] } },
      { id: metricReportIds.avgDuration, name: 'GM: Avg Round Duration', dataset: 'golf_pace', definition: { columns: ['total_duration_min', 'rounds_completed'], filters: [] } },
      { id: metricReportIds.cancelRate, name: 'GM: Cancel Rate', dataset: 'golf_utilization', definition: { columns: ['cancel_rate_bp'], filters: [] } },
      { id: metricReportIds.noShowRate, name: 'GM: No Show Rate', dataset: 'golf_utilization', definition: { columns: ['slots_booked'], filters: [] } },
      { id: metricReportIds.onlinePct, name: 'GM: Online %', dataset: 'golf_channel', definition: { columns: ['online_pct_bp'], filters: [] } },
      { id: metricReportIds.netPlayers, name: 'GM: Net Players', dataset: 'golf_utilization', definition: { columns: ['slots_booked'], filters: [] } },
    ];

    for (const rd of metricReportDefs) {
      await (tx as any).execute(sql`
        INSERT INTO report_definitions (id, tenant_id, name, dataset, definition, created_by)
        VALUES (
          ${rd.id},
          ${tenantId},
          ${rd.name},
          ${rd.dataset},
          ${JSON.stringify(rd.definition)}::jsonb,
          ${createdBy}
        )
        ON CONFLICT DO NOTHING
      `);
    }

    const gmDailyTiles = JSON.stringify([
      { reportId: metricReportIds.todayRounds, title: 'Rounds Played', chartType: 'metric', position: { x: 0, y: 0 }, size: { w: 3, h: 2 } },
      { reportId: metricReportIds.todayRevenue, title: 'Today Revenue', chartType: 'metric', position: { x: 3, y: 0 }, size: { w: 3, h: 2 } },
      { reportId: metricReportIds.utilization, title: 'Utilization', chartType: 'metric', position: { x: 6, y: 0 }, size: { w: 3, h: 2 } },
      { reportId: metricReportIds.avgDuration, title: 'Avg Round Duration', chartType: 'metric', position: { x: 9, y: 0 }, size: { w: 3, h: 2 } },
      { reportId: metricReportIds.cancelRate, title: 'Cancel Rate', chartType: 'metric', position: { x: 0, y: 2 }, size: { w: 3, h: 2 } },
      { reportId: metricReportIds.noShowRate, title: 'No-Show Rate', chartType: 'metric', position: { x: 3, y: 2 }, size: { w: 3, h: 2 } },
      { reportId: metricReportIds.onlinePct, title: 'Online %', chartType: 'metric', position: { x: 6, y: 2 }, size: { w: 3, h: 2 } },
      { reportId: metricReportIds.netPlayers, title: 'Net Players', chartType: 'metric', position: { x: 9, y: 2 }, size: { w: 3, h: 2 } },
    ]);

    await (tx as any).execute(sql`
      INSERT INTO dashboard_definitions (id, tenant_id, name, description, tiles, is_default, created_by)
      VALUES (
        ${generateUlid()},
        ${tenantId},
        ${'GM Daily'},
        ${'Daily overview for the General Manager — 8 KPI metrics with 60s refresh'},
        ${gmDailyTiles}::jsonb,
        true,
        ${createdBy}
      )
      ON CONFLICT DO NOTHING
    `);

    // ── Dashboard 2: Yield & Demand (6 chart tiles) ──────────

    const yieldTiles = JSON.stringify([
      { reportId: revTrendId, title: 'Revenue Trend', chartType: 'line', position: { x: 0, y: 0 }, size: { w: 6, h: 4 } },
      { reportId: utilTrendId, title: 'Utilization Trend', chartType: 'line', position: { x: 6, y: 0 }, size: { w: 6, h: 4 } },
      { reportId: daypartId, title: 'Daypart Distribution', chartType: 'bar', position: { x: 0, y: 4 }, size: { w: 6, h: 4 } },
      { reportId: channelMixId, title: 'Channel Mix', chartType: 'bar', position: { x: 6, y: 4 }, size: { w: 6, h: 4 } },
      { reportId: revBreakdownId, title: 'Revenue Breakdown', chartType: 'bar', position: { x: 0, y: 8 }, size: { w: 6, h: 4 } },
      { reportId: bookingTypeId, title: 'Booking Types', chartType: 'bar', position: { x: 6, y: 8 }, size: { w: 6, h: 4 } },
    ]);

    await (tx as any).execute(sql`
      INSERT INTO dashboard_definitions (id, tenant_id, name, description, tiles, is_default, created_by)
      VALUES (
        ${generateUlid()},
        ${tenantId},
        ${'Yield & Demand'},
        ${'Revenue, utilization, channel & daypart charts with 120s refresh'},
        ${yieldTiles}::jsonb,
        true,
        ${createdBy}
      )
      ON CONFLICT DO NOTHING
    `);

    // ── Dashboard 3: Ops (4 chart tiles) ─────────────────────

    const opsTiles = JSON.stringify([
      { reportId: paceTrendId, title: 'Pace of Play', chartType: 'line', position: { x: 0, y: 0 }, size: { w: 6, h: 4 } },
      { reportId: complianceTrendId, title: 'Interval Compliance', chartType: 'line', position: { x: 6, y: 0 }, size: { w: 6, h: 4 } },
      { reportId: slowRoundsTrendId, title: 'Slow Rounds', chartType: 'bar', position: { x: 0, y: 4 }, size: { w: 6, h: 4 } },
      { reportId: startDelayTrendId, title: 'Start Delay', chartType: 'bar', position: { x: 6, y: 4 }, size: { w: 6, h: 4 } },
    ]);

    await (tx as any).execute(sql`
      INSERT INTO dashboard_definitions (id, tenant_id, name, description, tiles, is_default, created_by)
      VALUES (
        ${generateUlid()},
        ${tenantId},
        ${'Ops'},
        ${'Pace-of-play and operations metrics with 60s refresh'},
        ${opsTiles}::jsonb,
        true,
        ${createdBy}
      )
      ON CONFLICT DO NOTHING
    `);
  });
}
