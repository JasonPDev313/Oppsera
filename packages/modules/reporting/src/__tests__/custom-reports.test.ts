import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock transaction — captured in closure by both mocks
const mockTx = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue([]),
};

const mockDb = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  }),
};

vi.mock('@oppsera/db', () => ({
  db: mockDb,
  withTenant: vi.fn((_tenantId: string, fn: (tx: any) => any) => fn(mockTx)),
  reportDefinitions: { id: 'id', tenantId: 'tenant_id', isArchived: 'is_archived', dataset: 'dataset' },
  dashboardDefinitions: { id: 'id', tenantId: 'tenant_id', isArchived: 'is_archived' },
  reportingFieldCatalog: { dataset: 'dataset', fieldKey: 'field_key' },
}));

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn((_ctx: any, fn: (tx: any) => any) =>
    fn(mockTx).then((r: any) => r.result),
  ),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn(() => ({ eventId: 'evt_1', eventType: 'test' })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn(),
}));

describe('Custom Reports — Commands & Queries', () => {
  const TENANT_ID = 'tenant_001';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain methods to defaults
    mockTx.select.mockReturnThis();
    mockTx.from.mockReturnThis();
    mockTx.where.mockReturnThis();
    mockTx.orderBy.mockReturnThis();
    mockTx.limit.mockResolvedValue([]);
    mockTx.insert.mockReturnThis();
    mockTx.values.mockReturnThis();
    mockTx.returning.mockResolvedValue([]);
    mockTx.update.mockReturnThis();
    mockTx.set.mockReturnThis();
    mockTx.execute.mockResolvedValue([]);
  });

  // ── getFieldCatalog ───────────────────────────────────────────

  describe('getFieldCatalog', () => {
    it('returns fields filtered by dataset', async () => {
      const mockFields = [
        { id: '1', dataset: 'daily_sales', fieldKey: 'net_sales', label: 'Net Sales', dataType: 'number', aggregation: 'sum', isMetric: true, isFilturable: true, isSortable: true, columnExpression: 'net_sales', tableRef: 'rm_daily_sales', createdAt: new Date() },
      ];
      const mockWhere = vi.fn().mockResolvedValue(mockFields);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDb.select.mockReturnValue({ from: mockFrom });

      const { getFieldCatalog } = await import('../queries/get-field-catalog');
      const result = await getFieldCatalog('daily_sales');
      expect(result).toHaveLength(1);
      expect(result[0]!.fieldKey).toBe('net_sales');
    });
  });

  // ── saveReport ────────────────────────────────────────────────

  describe('saveReport', () => {
    it('creates a new report definition', async () => {
      const catalogRows = [
        { dataset: 'daily_sales', fieldKey: 'business_date' },
        { dataset: 'daily_sales', fieldKey: 'net_sales' },
      ];
      // saveReport does: select().from(reportingFieldCatalog).where() → catalog rows
      // Then: insert().values().returning() → created report
      mockTx.where.mockResolvedValueOnce(catalogRows);
      mockTx.returning.mockResolvedValueOnce([{
        id: 'rpt_1', name: 'Test Report', dataset: 'daily_sales', tenantId: TENANT_ID,
      }]);

      const { saveReport } = await import('../commands/save-report');
      const result = await saveReport(
        { tenantId: TENANT_ID, user: { id: 'user_1' } } as any,
        {
          name: 'Test Report',
          dataset: 'daily_sales',
          definition: {
            columns: ['business_date', 'net_sales'],
            filters: [
              { fieldKey: 'business_date', op: 'gte', value: '2026-01-01' },
              { fieldKey: 'business_date', op: 'lte', value: '2026-01-31' },
            ],
          },
        },
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('rpt_1');
    });

    it('rejects invalid fieldKeys in definition', async () => {
      mockTx.where.mockResolvedValueOnce([{ dataset: 'daily_sales', fieldKey: 'business_date' }]);

      const { saveReport } = await import('../commands/save-report');
      await expect(
        saveReport(
          { tenantId: TENANT_ID, user: { id: 'user_1' } } as any,
          {
            name: 'Bad Report',
            dataset: 'daily_sales',
            definition: {
              columns: ['business_date', 'fake_field'],
              filters: [],
            },
          },
        ),
      ).rejects.toThrow('Unknown field');
    });
  });

  // ── deleteReport ──────────────────────────────────────────────

  describe('deleteReport', () => {
    it('soft-deletes (sets isArchived = true)', async () => {
      mockTx.limit.mockResolvedValueOnce([{ id: 'rpt_1', isArchived: false, name: 'Test' }]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'rpt_1', isArchived: true, name: 'Test' }]);

      const { deleteReport } = await import('../commands/delete-report');
      const result = await deleteReport(
        { tenantId: TENANT_ID, user: { id: 'user_1' } } as any,
        'rpt_1',
      );

      expect(result).toBeDefined();
      expect(mockTx.set).toHaveBeenCalledWith(expect.objectContaining({ isArchived: true }));
    });

    it('rejects if already archived', async () => {
      mockTx.limit.mockResolvedValueOnce([{ id: 'rpt_1', isArchived: true }]);

      const { deleteReport } = await import('../commands/delete-report');
      await expect(
        deleteReport({ tenantId: TENANT_ID, user: { id: 'user_1' } } as any, 'rpt_1'),
      ).rejects.toThrow('already archived');
    });

    it('rejects if not found', async () => {
      mockTx.limit.mockResolvedValueOnce([]);

      const { deleteReport } = await import('../commands/delete-report');
      await expect(
        deleteReport({ tenantId: TENANT_ID, user: { id: 'user_1' } } as any, 'rpt_nonexistent'),
      ).rejects.toThrow('not found');
    });
  });

  // ── listReports ───────────────────────────────────────────────

  describe('listReports', () => {
    it('lists non-archived reports for tenant', async () => {
      const mockReports = [
        { id: 'rpt_2', tenantId: TENANT_ID, name: 'Report 2', description: null, dataset: 'daily_sales', definition: {}, createdBy: 'u1', isArchived: false, createdAt: new Date(), updatedAt: new Date() },
        { id: 'rpt_1', tenantId: TENANT_ID, name: 'Report 1', description: null, dataset: 'daily_sales', definition: {}, createdBy: 'u1', isArchived: false, createdAt: new Date(), updatedAt: new Date() },
      ];
      mockTx.limit.mockResolvedValueOnce(mockReports);

      const { listReports } = await import('../queries/get-report');
      const result = await listReports({ tenantId: TENANT_ID });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('supports cursor pagination', async () => {
      // listReports fetches limit+1=3 rows; 3 > 2 → hasMore=true, items=first 2
      const mockReports = Array.from({ length: 3 }, (_, i) => ({
        id: `rpt_${i}`, tenantId: TENANT_ID, name: `Report ${i}`, description: null, dataset: 'daily_sales',
        definition: {}, createdBy: 'u1', isArchived: false, createdAt: new Date(), updatedAt: new Date(),
      }));
      mockTx.limit.mockResolvedValueOnce(mockReports);

      const { listReports } = await import('../queries/get-report');
      const result = await listReports({ tenantId: TENANT_ID, limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('rpt_1');
    });
  });

  // ── saveDashboard ─────────────────────────────────────────────

  describe('saveDashboard', () => {
    it('creates dashboard with tiles', async () => {
      // Mock the report existence check (execute returns matching reports)
      mockTx.execute.mockResolvedValueOnce([{ id: 'rpt_1' }]);
      mockTx.returning.mockResolvedValueOnce([{
        id: 'dash_1', name: 'My Dashboard', tenantId: TENANT_ID,
      }]);

      const { saveDashboard } = await import('../commands/save-dashboard');
      const result = await saveDashboard(
        { tenantId: TENANT_ID, user: { id: 'user_1' } } as any,
        {
          name: 'My Dashboard',
          tiles: [{ reportId: 'rpt_1', title: 'Sales', chartType: 'line', position: { x: 0, y: 0 }, size: { w: 6, h: 4 } }],
        },
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('dash_1');
    });

    it('updates existing dashboard', async () => {
      mockTx.limit.mockResolvedValueOnce([{ id: 'dash_1', isArchived: false }]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'dash_1', name: 'Updated Dashboard' }]);

      const { saveDashboard } = await import('../commands/save-dashboard');
      const result = await saveDashboard(
        { tenantId: TENANT_ID, user: { id: 'user_1' } } as any,
        { id: 'dash_1', name: 'Updated Dashboard', tiles: [] },
      );

      expect(result.name).toBe('Updated Dashboard');
    });
  });

  // ── deleteDashboard ───────────────────────────────────────────

  describe('deleteDashboard', () => {
    it('soft-deletes dashboard', async () => {
      mockTx.limit.mockResolvedValueOnce([{ id: 'dash_1', isArchived: false, name: 'Test' }]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'dash_1', isArchived: true, name: 'Test' }]);

      const { deleteDashboard } = await import('../commands/delete-dashboard');
      const result = await deleteDashboard(
        { tenantId: TENANT_ID, user: { id: 'user_1' } } as any,
        'dash_1',
      );

      expect(result).toBeDefined();
    });

    it('rejects if not found', async () => {
      mockTx.limit.mockResolvedValueOnce([]);

      const { deleteDashboard } = await import('../commands/delete-dashboard');
      await expect(
        deleteDashboard({ tenantId: TENANT_ID, user: { id: 'user_1' } } as any, 'nonexistent'),
      ).rejects.toThrow('not found');
    });
  });
});
