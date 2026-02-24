import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const { mockWithTenant, mockDbSelect, mockInsertValues, mockOnConflictDoUpdate } = vi.hoisted(() => ({
  mockWithTenant: vi.fn(),
  mockDbSelect: vi.fn(),
  mockInsertValues: vi.fn(),
  mockOnConflictDoUpdate: vi.fn(),
}));

vi.mock('@oppsera/db', () => {
  const mockFrom = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  });

  return {
    db: {
      select: mockDbSelect.mockReturnValue({ from: mockFrom }),
    },
    withTenant: mockWithTenant,
    erpWorkflowConfigs: { tenantId: 'tenantId', moduleKey: 'moduleKey', workflowKey: 'workflowKey' },
    erpWorkflowConfigChangeLog: {},
    tenants: { id: 'id', businessTier: 'businessTier' },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
  and: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@oppsera/shared', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    generateUlid: vi.fn(() => 'mock-ulid-001'),
  };
});

// Import after mocks
import {
  getWorkflowConfig,
  getModuleWorkflowConfigs,
  getAllWorkflowConfigs,
  setWorkflowConfig,
  invalidateWorkflowCache,
} from '../workflow-engine';
import { TIER_WORKFLOW_DEFAULTS } from '@oppsera/shared';

describe('workflow-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Always invalidate the cache before each test
    invalidateWorkflowCache('tnt_test');

    // Default: loadTenantTier returns 'SMB'
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ businessTier: 'SMB' }]),
        }),
      }),
    });

    // Default: loadAllConfigs returns empty (no explicit overrides)
    mockWithTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: mockInsertValues.mockReturnValue({
            onConflictDoUpdate: mockOnConflictDoUpdate.mockResolvedValue(undefined),
          }),
        }),
      };
      return fn(mockTx);
    });
  });

  describe('getWorkflowConfig', () => {
    it('falls back to tier defaults when no explicit row exists', async () => {
      const config = await getWorkflowConfig('tnt_test', 'accounting', 'journal_posting');
      const expected = TIER_WORKFLOW_DEFAULTS.SMB['accounting.journal_posting']!;
      expect(config.autoMode).toBe(expected.autoMode);
      expect(config.approvalRequired).toBe(expected.approvalRequired);
      expect(config.userVisible).toBe(expected.userVisible);
      expect(config.customSettings).toEqual({});
    });

    it('SMB defaults are all auto/invisible', async () => {
      const config = await getWorkflowConfig('tnt_test', 'accounting', 'journal_posting');
      expect(config.autoMode).toBe(true);
      expect(config.approvalRequired).toBe(false);
      expect(config.userVisible).toBe(false);
    });

    it('returns stored config when explicit row exists', async () => {
      const storedConfig = {
        moduleKey: 'accounting',
        workflowKey: 'journal_posting',
        autoMode: false,
        approvalRequired: true,
        userVisible: true,
        customSettings: { threshold: 5000 },
      };

      mockWithTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([storedConfig]),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        };
        return fn(mockTx);
      });

      const config = await getWorkflowConfig('tnt_test', 'accounting', 'journal_posting');
      expect(config.autoMode).toBe(false);
      expect(config.approvalRequired).toBe(true);
      expect(config.userVisible).toBe(true);
      expect(config.customSettings).toEqual({ threshold: 5000 });
    });

    it('ENTERPRISE defaults are manual/visible', async () => {
      invalidateWorkflowCache('tnt_ent');

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ businessTier: 'ENTERPRISE' }]),
          }),
        }),
      });

      const config = await getWorkflowConfig('tnt_ent', 'accounting', 'journal_posting');
      const expected = TIER_WORKFLOW_DEFAULTS.ENTERPRISE['accounting.journal_posting']!;
      expect(config.autoMode).toBe(expected.autoMode);
      expect(config.approvalRequired).toBe(expected.approvalRequired);
      expect(config.userVisible).toBe(expected.userVisible);
    });

    it('returns ultimate fallback for unknown workflow', async () => {
      const config = await getWorkflowConfig('tnt_test', 'unknown', 'module');
      expect(config.autoMode).toBe(true);
      expect(config.approvalRequired).toBe(false);
      expect(config.userVisible).toBe(false);
      expect(config.customSettings).toEqual({});
    });
  });

  describe('getModuleWorkflowConfigs', () => {
    it('returns all defaults for a module', async () => {
      const configs = await getModuleWorkflowConfigs('tnt_test', 'accounting');
      // SMB defaults for accounting module — should have 5 workflows
      const accountingKeys = Object.keys(configs).filter((k) => k.startsWith('accounting.'));
      expect(accountingKeys).toHaveLength(5);
      expect(configs['accounting.journal_posting']).toBeDefined();
      expect(configs['accounting.period_close']).toBeDefined();
      expect(configs['accounting.bank_reconciliation']).toBeDefined();
      expect(configs['accounting.depreciation']).toBeDefined();
      expect(configs['accounting.revenue_recognition']).toBeDefined();
    });

    it('overrides defaults with explicit configs', async () => {
      const storedConfig = {
        moduleKey: 'accounting',
        workflowKey: 'journal_posting',
        autoMode: false,
        approvalRequired: true,
        userVisible: true,
        customSettings: {},
      };

      mockWithTenant.mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([storedConfig]),
            }),
          }),
        };
        return fn(mockTx);
      });

      invalidateWorkflowCache('tnt_test');
      const configs = await getModuleWorkflowConfigs('tnt_test', 'accounting');
      // The explicit override should take precedence
      expect(configs['accounting.journal_posting']!.autoMode).toBe(false);
      expect(configs['accounting.journal_posting']!.approvalRequired).toBe(true);
      // Other configs should still be tier defaults
      expect(configs['accounting.depreciation']!.autoMode).toBe(true);
    });
  });

  describe('getAllWorkflowConfigs', () => {
    it('returns all 13 workflows for SMB tier', async () => {
      const configs = await getAllWorkflowConfigs('tnt_test');
      const keys = Object.keys(configs);
      expect(keys).toHaveLength(13);
    });

    it('returns configs keyed by module.workflow', async () => {
      const configs = await getAllWorkflowConfigs('tnt_test');
      expect(configs['accounting.journal_posting']).toBeDefined();
      expect(configs['payments.settlement_matching']).toBeDefined();
      expect(configs['inventory.costing']).toBeDefined();
      expect(configs['ap.bill_approval']).toBeDefined();
      expect(configs['ar.invoice_posting']).toBeDefined();
    });
  });

  describe('cache behavior', () => {
    it('uses cached result on second call', async () => {
      await getWorkflowConfig('tnt_test', 'accounting', 'journal_posting');
      const callCount = mockWithTenant.mock.calls.length;

      // Second call should use cache
      await getWorkflowConfig('tnt_test', 'accounting', 'period_close');
      expect(mockWithTenant.mock.calls.length).toBe(callCount);
    });

    it('refreshes after cache invalidation', async () => {
      await getWorkflowConfig('tnt_test', 'accounting', 'journal_posting');
      const callCount = mockWithTenant.mock.calls.length;

      invalidateWorkflowCache('tnt_test');

      await getWorkflowConfig('tnt_test', 'accounting', 'journal_posting');
      expect(mockWithTenant.mock.calls.length).toBeGreaterThan(callCount);
    });
  });

  describe('setWorkflowConfig', () => {
    it('calls insert with upsert for config row', async () => {
      await setWorkflowConfig(
        'tnt_test',
        'accounting',
        'journal_posting',
        { autoMode: false, userVisible: true },
        'user_01',
        'Testing',
      );

      // Verify withTenant was called for the upsert
      expect(mockWithTenant).toHaveBeenCalled();
    });

    it('invalidates cache after set', async () => {
      // Prime the cache
      await getWorkflowConfig('tnt_test', 'accounting', 'journal_posting');

      // Set a new config — will invalidate cache
      await setWorkflowConfig(
        'tnt_test',
        'accounting',
        'journal_posting',
        { autoMode: false },
        'user_01',
      );

      // Next get should re-fetch from DB
      const priorCalls = mockWithTenant.mock.calls.length;
      await getWorkflowConfig('tnt_test', 'accounting', 'journal_posting');
      expect(mockWithTenant.mock.calls.length).toBeGreaterThan(priorCalls);
    });
  });
});
