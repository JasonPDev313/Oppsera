import { describe, it, expect } from 'vitest';
import { compileReport } from '../compiler';
import type { FieldCatalogEntry } from '../compiler';

// ── Test field catalogs (mirrors migration 0054) ──────────────

const golfUtilizationCatalog: FieldCatalogEntry[] = [
  { id: 'gu1', dataset: 'golf_utilization', fieldKey: 'business_date', label: 'Business Date', dataType: 'date', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'business_date', tableRef: 'rm_golf_tee_time_demand' },
  { id: 'gu2', dataset: 'golf_utilization', fieldKey: 'course_id', label: 'Course', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'course_id', tableRef: 'rm_golf_tee_time_demand' },
  { id: 'gu3', dataset: 'golf_utilization', fieldKey: 'slots_booked', label: 'Slots Booked', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'slots_booked', tableRef: 'rm_golf_tee_time_demand' },
  { id: 'gu4', dataset: 'golf_utilization', fieldKey: 'slots_available', label: 'Slots Available', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'slots_available', tableRef: 'rm_golf_tee_time_demand' },
  { id: 'gu5', dataset: 'golf_utilization', fieldKey: 'cancellations', label: 'Cancellations', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'cancellations', tableRef: 'rm_golf_tee_time_demand' },
  { id: 'gu6', dataset: 'golf_utilization', fieldKey: 'no_shows', label: 'No Shows', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'no_shows', tableRef: 'rm_golf_tee_time_demand' },
  { id: 'gu7', dataset: 'golf_utilization', fieldKey: 'utilization_pct_bp', label: 'Utilization %', dataType: 'number', aggregation: null, isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'CASE WHEN slots_available > 0 THEN slots_booked * 10000 / slots_available ELSE 0 END', tableRef: 'rm_golf_tee_time_demand' },
  { id: 'gu8', dataset: 'golf_utilization', fieldKey: 'cancel_rate_bp', label: 'Cancel Rate', dataType: 'number', aggregation: null, isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'CASE WHEN slots_booked > 0 THEN cancellations * 10000 / slots_booked ELSE 0 END', tableRef: 'rm_golf_tee_time_demand' },
];

const golfRevenueCatalog: FieldCatalogEntry[] = [
  { id: 'gr1', dataset: 'golf_revenue', fieldKey: 'business_date', label: 'Business Date', dataType: 'date', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'business_date', tableRef: 'rm_golf_revenue_daily' },
  { id: 'gr2', dataset: 'golf_revenue', fieldKey: 'course_id', label: 'Course', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'course_id', tableRef: 'rm_golf_revenue_daily' },
  { id: 'gr3', dataset: 'golf_revenue', fieldKey: 'total_revenue', label: 'Total Revenue', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'total_revenue', tableRef: 'rm_golf_revenue_daily' },
  { id: 'gr4', dataset: 'golf_revenue', fieldKey: 'rounds_played', label: 'Rounds Played', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'rounds_played', tableRef: 'rm_golf_revenue_daily' },
  { id: 'gr5', dataset: 'golf_revenue', fieldKey: 'green_fee_revenue', label: 'Green Fee Revenue', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'green_fee_revenue', tableRef: 'rm_golf_revenue_daily' },
  { id: 'gr6', dataset: 'golf_revenue', fieldKey: 'rev_per_round', label: 'Rev Per Round', dataType: 'number', aggregation: null, isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'CASE WHEN rounds_played > 0 THEN total_revenue / rounds_played ELSE 0 END', tableRef: 'rm_golf_revenue_daily' },
];

const golfPaceCatalog: FieldCatalogEntry[] = [
  { id: 'gp1', dataset: 'golf_pace', fieldKey: 'business_date', label: 'Business Date', dataType: 'date', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'business_date', tableRef: 'rm_golf_pace_daily' },
  { id: 'gp2', dataset: 'golf_pace', fieldKey: 'course_id', label: 'Course', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'course_id', tableRef: 'rm_golf_pace_daily' },
  { id: 'gp3', dataset: 'golf_pace', fieldKey: 'rounds_completed', label: 'Rounds Completed', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'rounds_completed', tableRef: 'rm_golf_pace_daily' },
  { id: 'gp4', dataset: 'golf_pace', fieldKey: 'total_duration_min', label: 'Total Duration (min)', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'total_duration_min', tableRef: 'rm_golf_pace_daily' },
  { id: 'gp5', dataset: 'golf_pace', fieldKey: 'slow_rounds_count', label: 'Slow Rounds', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'slow_rounds_count', tableRef: 'rm_golf_pace_daily' },
];

const golfCustomerPlayCatalog: FieldCatalogEntry[] = [
  { id: 'gc1', dataset: 'golf_customer_play', fieldKey: 'customer_id', label: 'Customer ID', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'customer_id', tableRef: 'rm_golf_customer_play' },
  { id: 'gc2', dataset: 'golf_customer_play', fieldKey: 'customer_name', label: 'Customer Name', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'customer_name', tableRef: 'rm_golf_customer_play' },
  { id: 'gc3', dataset: 'golf_customer_play', fieldKey: 'total_rounds', label: 'Total Rounds', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'total_rounds', tableRef: 'rm_golf_customer_play' },
  { id: 'gc4', dataset: 'golf_customer_play', fieldKey: 'total_revenue', label: 'Total Revenue', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'total_revenue', tableRef: 'rm_golf_customer_play' },
  { id: 'gc5', dataset: 'golf_customer_play', fieldKey: 'last_played_at', label: 'Last Played', dataType: 'date', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'last_played_at', tableRef: 'rm_golf_customer_play' },
  { id: 'gc6', dataset: 'golf_customer_play', fieldKey: 'avg_party_size', label: 'Avg Party Size', dataType: 'number', aggregation: 'avg', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'avg_party_size', tableRef: 'rm_golf_customer_play' },
];

const TENANT_ID = 'tenant_golf_001';

const golfDateFilters = [
  { fieldKey: 'business_date', op: 'gte' as const, value: '2026-03-01' },
  { fieldKey: 'business_date', op: 'lte' as const, value: '2026-03-31' },
];

// ═══════════════════════════════════════════════════════════════

describe('compileReport — golf datasets', () => {
  // ── golf_utilization ────────────────────────────────────────

  describe('golf_utilization', () => {
    it('compiles SELECT from rm_golf_tee_time_demand', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_utilization',
        definition: {
          columns: ['business_date', 'slots_booked', 'slots_available'],
          filters: golfDateFilters,
        },
        fieldCatalog: golfUtilizationCatalog,
      });

      expect(result.sql).toContain('FROM rm_golf_tee_time_demand');
      expect(result.sql).toContain('tenant_id = $1');
      expect(result.params[0]).toBe(TENANT_ID);
    });

    it('includes computed CASE WHEN for utilization_pct_bp', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_utilization',
        definition: {
          columns: ['business_date', 'utilization_pct_bp'],
          filters: golfDateFilters,
        },
        fieldCatalog: golfUtilizationCatalog,
      });

      expect(result.sql).toContain('CASE WHEN slots_available > 0 THEN slots_booked * 10000 / slots_available ELSE 0 END');
    });

    it('requires business_date filter (time-series)', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'golf_utilization',
          definition: {
            columns: ['slots_booked'],
            filters: [],
          },
          fieldCatalog: golfUtilizationCatalog,
        }),
      ).toThrow('require business_date filters');
    });
  });

  // ── golf_revenue ────────────────────────────────────────────

  describe('golf_revenue', () => {
    it('compiles with GROUP BY for multi-course aggregation', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_revenue',
        definition: {
          columns: ['course_id', 'total_revenue', 'rounds_played'],
          filters: golfDateFilters,
          groupBy: ['course_id'],
        },
        fieldCatalog: golfRevenueCatalog,
      });

      expect(result.sql).toContain('GROUP BY course_id');
      expect(result.sql).toContain('sum(total_revenue)');
      expect(result.sql).toContain('sum(rounds_played)');
    });

    it('includes computed rev_per_round expression', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_revenue',
        definition: {
          columns: ['business_date', 'rev_per_round'],
          filters: golfDateFilters,
        },
        fieldCatalog: golfRevenueCatalog,
      });

      expect(result.sql).toContain('CASE WHEN rounds_played > 0 THEN total_revenue / rounds_played ELSE 0 END');
    });
  });

  // ── golf_pace ───────────────────────────────────────────────

  describe('golf_pace', () => {
    it('compiles with ORDER BY and LIMIT', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_pace',
        definition: {
          columns: ['business_date', 'rounds_completed', 'total_duration_min'],
          filters: golfDateFilters,
          sortBy: [{ fieldKey: 'business_date', direction: 'asc' }],
          limit: 90,
        },
        fieldCatalog: golfPaceCatalog,
      });

      expect(result.sql).toContain('FROM rm_golf_pace_daily');
      expect(result.sql).toContain('ORDER BY business_date ASC');
      expect(result.params).toContain(90);
    });

    it('applies courseId filter via WHERE', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_pace',
        definition: {
          columns: ['business_date', 'rounds_completed'],
          filters: [
            ...golfDateFilters,
            { fieldKey: 'course_id', op: 'eq' as const, value: 'course_001' },
          ],
        },
        fieldCatalog: golfPaceCatalog,
      });

      expect(result.sql).toContain('course_id = ');
      expect(result.params).toContain('course_001');
    });
  });

  // ── golf_customer_play (non-time-series) ────────────────────

  describe('golf_customer_play', () => {
    it('compiles WITHOUT date filter requirement (snapshot table)', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_customer_play',
        definition: {
          columns: ['customer_name', 'total_rounds', 'total_revenue'],
          filters: [],
        },
        fieldCatalog: golfCustomerPlayCatalog,
      });

      expect(result.sql).toContain('FROM rm_golf_customer_play');
      expect(result.sql).toContain('tenant_id = $1');
    });

    it('supports sorting by total_rounds', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_customer_play',
        definition: {
          columns: ['customer_name', 'total_rounds'],
          filters: [],
          sortBy: [{ fieldKey: 'total_rounds', direction: 'desc' }],
        },
        fieldCatalog: golfCustomerPlayCatalog,
      });

      expect(result.sql).toContain('ORDER BY total_rounds DESC');
    });

    it('supports LIKE filter on customer_name', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'golf_customer_play',
        definition: {
          columns: ['customer_name', 'total_rounds'],
          filters: [{ fieldKey: 'customer_name', op: 'like' as const, value: '%Smith%' }],
        },
        fieldCatalog: golfCustomerPlayCatalog,
      });

      expect(result.sql).toContain('ILIKE');
      expect(result.params).toContain('%Smith%');
    });
  });

  // ── Validation (golf-specific) ──────────────────────────────

  describe('validation', () => {
    it('rejects unknown golf field', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'golf_utilization',
          definition: {
            columns: ['business_date', 'fake_metric'],
            filters: golfDateFilters,
          },
          fieldCatalog: golfUtilizationCatalog,
        }),
      ).toThrow('Unknown field "fake_metric"');
    });

    it('rejects date range > 365 days for golf time-series', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'golf_revenue',
          definition: {
            columns: ['business_date', 'total_revenue'],
            filters: [
              { fieldKey: 'business_date', op: 'gte' as const, value: '2024-01-01' },
              { fieldKey: 'business_date', op: 'lte' as const, value: '2026-01-01' },
            ],
          },
          fieldCatalog: golfRevenueCatalog,
        }),
      ).toThrow('Date range cannot exceed 365 days');
    });
  });
});
