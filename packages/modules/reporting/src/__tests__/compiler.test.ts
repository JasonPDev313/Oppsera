import { describe, it, expect } from 'vitest';
import { compileReport } from '../compiler';
import type { FieldCatalogEntry, ReportDefinitionBody } from '../compiler';

// ── Test field catalog ──────────────────────────────────────────
const dailySalesCatalog: FieldCatalogEntry[] = [
  { id: '1', dataset: 'daily_sales', fieldKey: 'business_date', label: 'Business Date', dataType: 'date', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'business_date', tableRef: 'rm_daily_sales' },
  { id: '2', dataset: 'daily_sales', fieldKey: 'location_id', label: 'Location', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'location_id', tableRef: 'rm_daily_sales' },
  { id: '3', dataset: 'daily_sales', fieldKey: 'order_count', label: 'Order Count', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'order_count', tableRef: 'rm_daily_sales' },
  { id: '4', dataset: 'daily_sales', fieldKey: 'net_sales', label: 'Net Sales', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'net_sales', tableRef: 'rm_daily_sales' },
  { id: '5', dataset: 'daily_sales', fieldKey: 'gross_sales', label: 'Gross Sales', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'gross_sales', tableRef: 'rm_daily_sales' },
  { id: '6', dataset: 'daily_sales', fieldKey: 'discount_total', label: 'Discounts', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'discount_total', tableRef: 'rm_daily_sales' },
  { id: '7', dataset: 'daily_sales', fieldKey: 'tax_total', label: 'Tax Total', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'tax_total', tableRef: 'rm_daily_sales' },
  { id: '8', dataset: 'daily_sales', fieldKey: 'tender_cash', label: 'Cash', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'tender_cash', tableRef: 'rm_daily_sales' },
  { id: '9', dataset: 'daily_sales', fieldKey: 'tender_card', label: 'Card', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'tender_card', tableRef: 'rm_daily_sales' },
  { id: '10', dataset: 'daily_sales', fieldKey: 'void_count', label: 'Void Count', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'void_count', tableRef: 'rm_daily_sales' },
  { id: '11', dataset: 'daily_sales', fieldKey: 'void_total', label: 'Void Total', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'void_total', tableRef: 'rm_daily_sales' },
  { id: '12', dataset: 'daily_sales', fieldKey: 'avg_order_value', label: 'Avg Order Value', dataType: 'number', aggregation: 'avg', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'avg_order_value', tableRef: 'rm_daily_sales' },
];

const itemSalesCatalog: FieldCatalogEntry[] = [
  { id: '30', dataset: 'item_sales', fieldKey: 'business_date', label: 'Business Date', dataType: 'date', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'business_date', tableRef: 'rm_item_sales' },
  { id: '31', dataset: 'item_sales', fieldKey: 'location_id', label: 'Location', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'location_id', tableRef: 'rm_item_sales' },
  { id: '32', dataset: 'item_sales', fieldKey: 'catalog_item_id', label: 'Item ID', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'catalog_item_id', tableRef: 'rm_item_sales' },
  { id: '33', dataset: 'item_sales', fieldKey: 'catalog_item_name', label: 'Item Name', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'catalog_item_name', tableRef: 'rm_item_sales' },
  { id: '34', dataset: 'item_sales', fieldKey: 'quantity_sold', label: 'Quantity Sold', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'quantity_sold', tableRef: 'rm_item_sales' },
  { id: '35', dataset: 'item_sales', fieldKey: 'gross_revenue', label: 'Gross Revenue', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'gross_revenue', tableRef: 'rm_item_sales' },
];

const inventoryCatalog: FieldCatalogEntry[] = [
  { id: '20', dataset: 'inventory', fieldKey: 'location_id', label: 'Location', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'location_id', tableRef: 'rm_inventory_on_hand' },
  { id: '21', dataset: 'inventory', fieldKey: 'inventory_item_id', label: 'Inventory Item ID', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'inventory_item_id', tableRef: 'rm_inventory_on_hand' },
  { id: '22', dataset: 'inventory', fieldKey: 'item_name', label: 'Item Name', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'item_name', tableRef: 'rm_inventory_on_hand' },
  { id: '23', dataset: 'inventory', fieldKey: 'on_hand', label: 'On Hand', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'on_hand', tableRef: 'rm_inventory_on_hand' },
  { id: '24', dataset: 'inventory', fieldKey: 'is_below_threshold', label: 'Below Threshold', dataType: 'boolean', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'is_below_threshold', tableRef: 'rm_inventory_on_hand' },
];

const customersCatalog: FieldCatalogEntry[] = [
  { id: '40', dataset: 'customers', fieldKey: 'customer_id', label: 'Customer ID', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'customer_id', tableRef: 'rm_customer_activity' },
  { id: '41', dataset: 'customers', fieldKey: 'customer_name', label: 'Customer Name', dataType: 'string', aggregation: null, isMetric: false, isFilturable: true, isSortable: true, columnExpression: 'customer_name', tableRef: 'rm_customer_activity' },
  { id: '42', dataset: 'customers', fieldKey: 'total_visits', label: 'Total Visits', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'total_visits', tableRef: 'rm_customer_activity' },
];

const allCatalog = [...dailySalesCatalog, ...itemSalesCatalog, ...inventoryCatalog, ...customersCatalog];

const TENANT_ID = 'tenant_001';

// Helper: standard date range for daily_sales tests
const dateFilters = [
  { fieldKey: 'business_date', op: 'gte' as const, value: '2026-01-01' },
  { fieldKey: 'business_date', op: 'lte' as const, value: '2026-01-31' },
];

describe('compileReport', () => {
  // ── Single-Dataset Compilation Tests ───────────────────────────

  describe('single-dataset compilation', () => {
    it('compiles simple SELECT with tenant_id filter', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['business_date', 'net_sales'],
          filters: dateFilters,
        },
        fieldCatalog: dailySalesCatalog,
      });

      expect(result.sql).toContain('SELECT');
      expect(result.sql).toContain('FROM rm_daily_sales');
      expect(result.sql).toContain('tenant_id = $1');
      expect(result.params[0]).toBe(TENANT_ID);
    });

    it('compiles with multiple columns', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['business_date', 'net_sales', 'order_count', 'gross_sales'],
          filters: dateFilters,
        },
        fieldCatalog: dailySalesCatalog,
      });

      expect(result.sql).toContain('business_date AS "daily_sales:business_date"');
      expect(result.sql).toContain('net_sales AS "daily_sales:net_sales"');
      expect(result.sql).toContain('order_count AS "daily_sales:order_count"');
      expect(result.sql).toContain('gross_sales AS "daily_sales:gross_sales"');
    });

    it('compiles with WHERE filters (eq, gte, lte)', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['business_date', 'net_sales'],
          filters: [
            ...dateFilters,
            { fieldKey: 'order_count', op: 'gte', value: 10 },
          ],
        },
        fieldCatalog: dailySalesCatalog,
      });

      expect(result.sql).toContain('order_count >= $4');
      expect(result.params[3]).toBe(10);
    });

    it('compiles with IN filter', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['business_date', 'net_sales'],
          filters: [
            ...dateFilters,
            { fieldKey: 'location_id', op: 'in', value: ['loc1', 'loc2'] },
          ],
        },
        fieldCatalog: dailySalesCatalog,
      });

      expect(result.sql).toContain('location_id IN');
      expect(result.params).toContain('loc1');
      expect(result.params).toContain('loc2');
    });

    it('compiles with LIKE filter', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'inventory',
        definition: {
          columns: ['item_name', 'on_hand'],
          filters: [{ fieldKey: 'item_name', op: 'like', value: '%golf%' }],
        },
        fieldCatalog: inventoryCatalog,
      });

      expect(result.sql).toContain('ILIKE');
      expect(result.params).toContain('%golf%');
    });

    it('compiles with GROUP BY + aggregated metrics', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['location_id', 'net_sales', 'order_count'],
          filters: dateFilters,
          groupBy: ['location_id'],
        },
        fieldCatalog: dailySalesCatalog,
      });

      expect(result.sql).toContain('GROUP BY location_id');
      expect(result.sql).toContain('sum(net_sales) AS "daily_sales:net_sales"');
      expect(result.sql).toContain('sum(order_count) AS "daily_sales:order_count"');
    });

    it('compiles with ORDER BY + direction', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['business_date', 'net_sales'],
          filters: dateFilters,
          sortBy: [{ fieldKey: 'net_sales', direction: 'desc' }],
        },
        fieldCatalog: dailySalesCatalog,
      });

      expect(result.sql).toContain('ORDER BY net_sales DESC');
    });

    it('compiles with LIMIT (default 1000)', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['business_date', 'net_sales'],
          filters: dateFilters,
        },
        fieldCatalog: dailySalesCatalog,
      });

      expect(result.sql).toContain('LIMIT');
      expect(result.params).toContain(1000);
    });

    it('injects tenant_id as first WHERE condition always', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['business_date'],
          filters: dateFilters,
        },
        fieldCatalog: dailySalesCatalog,
      });

      const whereIdx = result.sql.indexOf('WHERE');
      const tenantIdx = result.sql.indexOf('tenant_id = $1');
      expect(tenantIdx).toBeGreaterThan(whereIdx);
      expect(tenantIdx).toBeLessThan(result.sql.indexOf('AND', whereIdx));
    });

    it('parameterizes all filter values', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          columns: ['business_date', 'net_sales'],
          filters: [
            ...dateFilters,
            { fieldKey: 'net_sales', op: 'gte', value: 5000 },
          ],
        },
        fieldCatalog: dailySalesCatalog,
      });

      expect(result.sql).not.toContain('5000');
      expect(result.sql).not.toContain('2026-01-01');
      expect(result.params).toContain(5000);
      expect(result.params).toContain('2026-01-01');
    });

    it('resolves bare fieldKey for legacy single-dataset reports (no alias)', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'inventory',
        definition: {
          columns: ['item_name', 'on_hand'],
          filters: [],
        },
        fieldCatalog: inventoryCatalog,
      });

      // Single dataset: no table alias, no LEFT JOIN
      expect(result.sql).toContain('FROM rm_inventory_on_hand');
      expect(result.sql).not.toContain('LEFT JOIN');
      expect(result.sql).not.toContain('inv.');
    });
  });

  // ── Multi-Dataset Compilation Tests ────────────────────────────

  describe('multi-dataset compilation', () => {
    it('compiles item_sales + inventory JOIN correctly', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'item_sales',
        definition: {
          datasets: ['item_sales', 'inventory'],
          columns: [
            'item_sales:catalog_item_name',
            'item_sales:quantity_sold',
            'inventory:on_hand',
          ],
          filters: [
            { fieldKey: 'item_sales:business_date', op: 'gte', value: '2026-01-01' },
            { fieldKey: 'item_sales:business_date', op: 'lte', value: '2026-01-31' },
          ],
        },
        fieldCatalog: allCatalog,
      });

      expect(result.sql).toContain('FROM rm_item_sales is_');
      expect(result.sql).toContain('LEFT JOIN rm_inventory_on_hand inv');
      expect(result.sql).toContain('is_.tenant_id = inv.tenant_id');
      expect(result.sql).toContain('is_.location_id = inv.location_id');
      expect(result.sql).toContain('is_.catalog_item_id = inv.inventory_item_id');
      expect(result.sql).toContain('is_.catalog_item_name AS "item_sales:catalog_item_name"');
      expect(result.sql).toContain('is_.quantity_sold AS "item_sales:quantity_sold"');
      expect(result.sql).toContain('inv.on_hand AS "inventory:on_hand"');
      expect(result.sql).toContain('is_.tenant_id = $1');
      expect(result.params[0]).toBe(TENANT_ID);
    });

    it('compiles daily_sales + item_sales JOIN correctly', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          datasets: ['daily_sales', 'item_sales'],
          columns: [
            'daily_sales:business_date',
            'daily_sales:net_sales',
            'item_sales:catalog_item_name',
            'item_sales:quantity_sold',
          ],
          filters: [
            { fieldKey: 'daily_sales:business_date', op: 'gte', value: '2026-01-01' },
            { fieldKey: 'daily_sales:business_date', op: 'lte', value: '2026-01-31' },
          ],
        },
        fieldCatalog: allCatalog,
      });

      expect(result.sql).toContain('FROM rm_daily_sales ds');
      expect(result.sql).toContain('LEFT JOIN rm_item_sales is_');
      expect(result.sql).toContain('ds.tenant_id = is_.tenant_id');
      expect(result.sql).toContain('ds.location_id = is_.location_id');
      expect(result.sql).toContain('ds.business_date = is_.business_date');
      expect(result.sql).toContain('ds.net_sales AS "daily_sales:net_sales"');
      expect(result.sql).toContain('is_.quantity_sold AS "item_sales:quantity_sold"');
    });

    it('applies tenant_id anchor on primary (left) table alias', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'item_sales',
        definition: {
          datasets: ['item_sales', 'inventory'],
          columns: ['item_sales:quantity_sold', 'inventory:on_hand'],
          filters: [
            { fieldKey: 'item_sales:business_date', op: 'gte', value: '2026-01-01' },
            { fieldKey: 'item_sales:business_date', op: 'lte', value: '2026-01-31' },
          ],
        },
        fieldCatalog: allCatalog,
      });

      // tenant_id should be anchored on the left (primary) table
      expect(result.sql).toContain('is_.tenant_id = $1');
    });

    it('applies filters with correct table aliases in multi-dataset', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'item_sales',
        definition: {
          datasets: ['item_sales', 'inventory'],
          columns: ['item_sales:quantity_sold', 'inventory:on_hand'],
          filters: [
            { fieldKey: 'item_sales:business_date', op: 'gte', value: '2026-01-01' },
            { fieldKey: 'item_sales:business_date', op: 'lte', value: '2026-01-31' },
            { fieldKey: 'inventory:on_hand', op: 'gte', value: 10 },
          ],
        },
        fieldCatalog: allCatalog,
      });

      expect(result.sql).toContain('is_.business_date >=');
      expect(result.sql).toContain('inv.on_hand >=');
    });

    it('handles GROUP BY with multi-dataset aliases', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'item_sales',
        definition: {
          datasets: ['item_sales', 'inventory'],
          columns: [
            'item_sales:catalog_item_name',
            'item_sales:quantity_sold',
            'inventory:on_hand',
          ],
          filters: [
            { fieldKey: 'item_sales:business_date', op: 'gte', value: '2026-01-01' },
            { fieldKey: 'item_sales:business_date', op: 'lte', value: '2026-01-31' },
          ],
          groupBy: ['item_sales:catalog_item_name'],
        },
        fieldCatalog: allCatalog,
      });

      expect(result.sql).toContain('GROUP BY is_.catalog_item_name');
      expect(result.sql).toContain('sum(is_.quantity_sold)');
      expect(result.sql).toContain('sum(inv.on_hand)');
    });

    it('handles ORDER BY with multi-dataset aliases', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'item_sales',
        definition: {
          datasets: ['item_sales', 'inventory'],
          columns: ['item_sales:quantity_sold', 'inventory:on_hand'],
          filters: [
            { fieldKey: 'item_sales:business_date', op: 'gte', value: '2026-01-01' },
            { fieldKey: 'item_sales:business_date', op: 'lte', value: '2026-01-31' },
          ],
          sortBy: [{ fieldKey: 'inventory:on_hand', direction: 'asc' }],
        },
        fieldCatalog: allCatalog,
      });

      expect(result.sql).toContain('ORDER BY inv.on_hand ASC');
    });

    it('compiles 3-way join (daily_sales + item_sales + inventory)', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          datasets: ['daily_sales', 'item_sales', 'inventory'],
          columns: [
            'daily_sales:business_date',
            'daily_sales:net_sales',
            'item_sales:catalog_item_name',
            'item_sales:quantity_sold',
            'inventory:on_hand',
          ],
          filters: [
            { fieldKey: 'daily_sales:business_date', op: 'gte', value: '2026-01-01' },
            { fieldKey: 'daily_sales:business_date', op: 'lte', value: '2026-01-31' },
          ],
        },
        fieldCatalog: allCatalog,
      });

      // Primary table is first dataset
      expect(result.sql).toContain('FROM rm_daily_sales ds');
      // Two LEFT JOINs
      expect(result.sql).toContain('LEFT JOIN rm_item_sales is_');
      expect(result.sql).toContain('LEFT JOIN rm_inventory_on_hand inv');
      // All columns present
      expect(result.sql).toContain('ds.business_date AS "daily_sales:business_date"');
      expect(result.sql).toContain('ds.net_sales AS "daily_sales:net_sales"');
      expect(result.sql).toContain('is_.catalog_item_name AS "item_sales:catalog_item_name"');
      expect(result.sql).toContain('inv.on_hand AS "inventory:on_hand"');
      // Tenant isolation on primary
      expect(result.sql).toContain('ds.tenant_id = $1');
      expect(result.params[0]).toBe(TENANT_ID);
    });
  });

  // ── Validation / Guardrail Tests ──────────────────────────────

  describe('validation', () => {
    it('rejects unknown fieldKey not in catalog', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'daily_sales',
          definition: {
            columns: ['business_date', 'fake_field'],
            filters: dateFilters,
          },
          fieldCatalog: dailySalesCatalog,
        }),
      ).toThrow('Unknown field "fake_field"');
    });

    it('rejects column from wrong dataset', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'daily_sales',
          definition: {
            columns: ['business_date', 'on_hand'],
            filters: dateFilters,
          },
          fieldCatalog: [...dailySalesCatalog, ...inventoryCatalog],
        }),
      ).toThrow('Unknown field "on_hand"');
    });

    it('rejects more than 20 columns', () => {
      const cols = Array.from({ length: 21 }, (_, i) => `col_${i}`);
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'daily_sales',
          definition: { columns: cols, filters: dateFilters },
          fieldCatalog: dailySalesCatalog,
        }),
      ).toThrow('Maximum 20 columns');
    });

    it('rejects more than 15 filters', () => {
      const filters = [
        ...dateFilters,
        ...Array.from({ length: 14 }, () => ({ fieldKey: 'order_count', op: 'gte' as const, value: 1 })),
      ];
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'daily_sales',
          definition: { columns: ['business_date'], filters },
          fieldCatalog: dailySalesCatalog,
        }),
      ).toThrow('Maximum 15 filters');
    });

    it('rejects limit > 10000', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'daily_sales',
          definition: {
            columns: ['business_date'],
            filters: dateFilters,
            limit: 50000,
          },
          fieldCatalog: dailySalesCatalog,
        }),
      ).toThrow('Limit cannot exceed 10000');
    });

    it('rejects daily_sales without date range filter', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'daily_sales',
          definition: {
            columns: ['business_date', 'net_sales'],
            filters: [],
          },
          fieldCatalog: dailySalesCatalog,
        }),
      ).toThrow('require business_date filters');
    });

    it('rejects item_sales without date range filter', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'item_sales',
          definition: {
            columns: ['business_date', 'catalog_item_name'],
            filters: [],
          },
          fieldCatalog: itemSalesCatalog,
        }),
      ).toThrow('require business_date filters');
    });

    it('rejects date range > 365 days', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'daily_sales',
          definition: {
            columns: ['business_date'],
            filters: [
              { fieldKey: 'business_date', op: 'gte', value: '2024-01-01' },
              { fieldKey: 'business_date', op: 'lte', value: '2026-01-01' },
            ],
          },
          fieldCatalog: dailySalesCatalog,
        }),
      ).toThrow('Date range cannot exceed 365 days');
    });

    it('accepts inventory dataset without date filter', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'inventory',
        definition: {
          columns: ['item_name', 'on_hand'],
          filters: [],
        },
        fieldCatalog: inventoryCatalog,
      });

      expect(result.sql).toContain('FROM rm_inventory_on_hand');
    });

    it('rejects unknown filter operator', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'inventory',
          definition: {
            columns: ['item_name'],
            filters: [{ fieldKey: 'item_name', op: 'regex' as any, value: '.*' }],
          },
          fieldCatalog: inventoryCatalog,
        }),
      ).toThrow('Unknown filter operator');
    });

    it('rejects customers combined with any other dataset', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'customers',
          definition: {
            datasets: ['customers', 'inventory'],
            columns: ['customers:customer_name', 'inventory:on_hand'],
            filters: [],
          },
          fieldCatalog: allCatalog,
        }),
      ).toThrow('cannot be joined');
    });

    it('allows daily_sales + inventory (joined on tenant + location)', () => {
      const result = compileReport({
        tenantId: TENANT_ID,
        dataset: 'daily_sales',
        definition: {
          datasets: ['daily_sales', 'inventory'],
          columns: ['daily_sales:net_sales', 'inventory:on_hand'],
          filters: [
            { fieldKey: 'daily_sales:business_date', op: 'gte', value: '2026-01-01' },
            { fieldKey: 'daily_sales:business_date', op: 'lte', value: '2026-01-31' },
          ],
        },
        fieldCatalog: allCatalog,
      });
      expect(result.sql).toContain('LEFT JOIN rm_inventory_on_hand');
      expect(result.sql).toContain('ds.tenant_id = inv.tenant_id');
      expect(result.sql).toContain('ds.location_id = inv.location_id');
    });

    it('requires business_date filter when any time-series dataset is in multi-dataset', () => {
      expect(() =>
        compileReport({
          tenantId: TENANT_ID,
          dataset: 'item_sales',
          definition: {
            datasets: ['item_sales', 'inventory'],
            columns: ['item_sales:quantity_sold', 'inventory:on_hand'],
            filters: [],
          },
          fieldCatalog: allCatalog,
        }),
      ).toThrow('require business_date filters');
    });
  });
});
