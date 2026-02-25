import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── Hoisted mocks ─────────────────────────────────────────────────

const {
  mockGetAllWorkflowConfigs,
  mockGetModuleWorkflowConfigs,
  mockGetWorkflowConfig,
  mockSetWorkflowConfig,
  mockValidateWorkflowOverride,
  mockClassifyTenant,
  mockApplyTierChange,
  mockValidateTierTransition,
  mockRunCloseOrchestrator,
  mockListCloseOrchestratorRuns,
  mockGetCloseOrchestratorRun,
  mockWithMiddleware,
  mockDbSelect,
  mockDbUpdate,
} = vi.hoisted(() => {
  const mockWithMiddleware = vi.fn(
    (handler: (...args: any[]) => any, _options: unknown) => {
      return async (request: any) => {
        const ctx = {
          user: { id: 'user_001' },
          tenantId: 'tenant_001',
          locationId: undefined as string | undefined,
          requestId: 'req_001',
          isPlatformAdmin: false,
          params: {} as Record<string, string>,
        };
        return handler(request, ctx);
      };
    },
  );

  return {
    mockGetAllWorkflowConfigs: vi.fn(),
    mockGetModuleWorkflowConfigs: vi.fn(),
    mockGetWorkflowConfig: vi.fn(),
    mockSetWorkflowConfig: vi.fn(),
    mockValidateWorkflowOverride: vi.fn(),
    mockClassifyTenant: vi.fn(),
    mockApplyTierChange: vi.fn(),
    mockValidateTierTransition: vi.fn(),
    mockRunCloseOrchestrator: vi.fn(),
    mockListCloseOrchestratorRuns: vi.fn(),
    mockGetCloseOrchestratorRun: vi.fn(),
    mockWithMiddleware,
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
  };
});

// ── Module mocks ──────────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/core/erp', async () => {
  const { z } = await import('zod');
  return {
    getAllWorkflowConfigs: mockGetAllWorkflowConfigs,
    getModuleWorkflowConfigs: mockGetModuleWorkflowConfigs,
    getWorkflowConfig: mockGetWorkflowConfig,
    setWorkflowConfig: mockSetWorkflowConfig,
    validateWorkflowOverride: mockValidateWorkflowOverride,
    classifyTenant: mockClassifyTenant,
    applyTierChange: mockApplyTierChange,
    validateTierTransition: mockValidateTierTransition,
    changeTierSchema: z.object({
      newTier: z.enum(['SMB', 'MID_MARKET', 'ENTERPRISE']),
      reason: z.string().min(1),
    }),
    updateWorkflowConfigSchema: z.object({
      moduleKey: z.string().min(1),
      workflowKey: z.string().min(1),
      autoMode: z.boolean().optional(),
      approvalRequired: z.boolean().optional(),
      userVisible: z.boolean().optional(),
      customSettings: z.record(z.unknown()).optional(),
      reason: z.string().optional(),
    }),
    runCloseOrchestratorSchema: z.object({
      businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      locationId: z.string().optional(),
    }),
  };
});

vi.mock('@oppsera/shared', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
  };
});

vi.mock('@oppsera/module-accounting', () => ({
  runCloseOrchestrator: mockRunCloseOrchestrator,
  listCloseOrchestratorRuns: mockListCloseOrchestratorRuns,
  getCloseOrchestratorRun: mockGetCloseOrchestratorRun,
}));

vi.mock('@oppsera/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
  withTenant: vi.fn((_id: string, fn: (tx: any) => any) => fn({
    execute: vi.fn().mockResolvedValue([{ count: 0 }]),
  })),
  tenants: {
    id: 'id',
    businessTier: 'businessTier',
    businessVertical: 'businessVertical',
    tierOverride: 'tierOverride',
    tierOverrideReason: 'tierOverrideReason',
    tierLastEvaluatedAt: 'tierLastEvaluatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
  sql: vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────

describe('ERP API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/erp/config', () => {
    it('returns all workflow configs', async () => {
      const configs = {
        'accounting.journal_posting': { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} },
        'payments.settlement_matching': { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} },
      };
      mockGetAllWorkflowConfigs.mockResolvedValue(configs);

      const { GET } = await import('../app/api/v1/erp/config/route');
      const request = new Request('http://localhost/api/v1/erp/config') as unknown as NextRequest;
      const response = await GET(request);
      const body = await response.json();

      expect(body.data).toEqual(configs);
      expect(mockGetAllWorkflowConfigs).toHaveBeenCalledWith('tenant_001');
    });
  });

  describe('GET /api/v1/erp/config/[moduleKey]', () => {
    it('returns configs for a specific module', async () => {
      const configs = {
        'accounting.journal_posting': { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} },
      };
      mockGetModuleWorkflowConfigs.mockResolvedValue(configs);

      // Mock withMiddleware to include params
      mockWithMiddleware.mockImplementation(
        (handler: (...args: any[]) => any, _options: unknown) => {
          return async (request: any) => {
            const ctx = {
              user: { id: 'user_001' },
              tenantId: 'tenant_001',
              requestId: 'req_001',
              params: { moduleKey: 'accounting' },
            };
            return handler(request, ctx);
          };
        },
      );

      const { GET } = await import('../app/api/v1/erp/config/[moduleKey]/route');
      const request = new Request('http://localhost/api/v1/erp/config/accounting') as unknown as NextRequest;
      const response = await GET(request);
      const body = await response.json();

      expect(body.data).toEqual(configs);
      expect(mockGetModuleWorkflowConfigs).toHaveBeenCalledWith('tenant_001', 'accounting');
    });
  });

  describe('GET /api/v1/erp/tier', () => {
    it('returns current tier information', async () => {
      const tierData = {
        businessTier: 'SMB',
        businessVertical: 'retail',
        tierOverride: false,
        tierOverrideReason: null,
        tierLastEvaluatedAt: null,
      };

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([tierData]),
          }),
        }),
      });

      // Reset middleware to default
      mockWithMiddleware.mockImplementation(
        (handler: (...args: any[]) => any, _options: unknown) => {
          return async (request: any) => {
            const ctx = {
              user: { id: 'user_001' },
              tenantId: 'tenant_001',
              requestId: 'req_001',
              params: {},
            };
            return handler(request, ctx);
          };
        },
      );

      const { GET } = await import('../app/api/v1/erp/tier/route');
      const request = new Request('http://localhost/api/v1/erp/tier') as unknown as NextRequest;
      const response = await GET(request);
      const body = await response.json();

      expect(body.data.businessTier).toBe('SMB');
      expect(body.data.businessVertical).toBe('retail');
    });

    it('returns 404 when tenant not found', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      mockWithMiddleware.mockImplementation(
        (handler: (...args: any[]) => any, _options: unknown) => {
          return async (request: any) => {
            const ctx = {
              user: { id: 'user_001' },
              tenantId: 'tenant_missing',
              requestId: 'req_001',
              params: {},
            };
            return handler(request, ctx);
          };
        },
      );

      const { GET } = await import('../app/api/v1/erp/tier/route');
      const request = new Request('http://localhost/api/v1/erp/tier') as unknown as NextRequest;
      const response = await GET(request);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/erp/close-orchestrator', () => {
    it('triggers a close orchestrator run', async () => {
      const runResult = {
        runId: 'run_001',
        status: 'completed',
        totalSteps: 5,
        completedSteps: 5,
        skippedSteps: 0,
        failedSteps: 0,
        stepResults: [],
        remainingManualSteps: [],
      };
      mockRunCloseOrchestrator.mockResolvedValue(runResult);

      mockWithMiddleware.mockImplementation(
        (handler: (...args: any[]) => any, _options: unknown) => {
          return async (request: any) => {
            const ctx = {
              user: { id: 'user_001' },
              tenantId: 'tenant_001',
              requestId: 'req_001',
              params: {},
            };
            return handler(request, ctx);
          };
        },
      );

      const { POST } = await import('../app/api/v1/erp/close-orchestrator/route');
      const request = new Request('http://localhost/api/v1/erp/close-orchestrator', {
        method: 'POST',
        body: JSON.stringify({ businessDate: '2026-02-24' }),
        headers: { 'Content-Type': 'application/json' },
      }) as unknown as NextRequest;
      const response = await POST(request);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.data.runId).toBe('run_001');
      expect(body.data.status).toBe('completed');
    });
  });

  describe('GET /api/v1/erp/close-orchestrator', () => {
    it('lists close orchestrator runs', async () => {
      mockListCloseOrchestratorRuns.mockResolvedValue({
        items: [{ id: 'run_001', status: 'completed' }],
        cursor: null,
        hasMore: false,
      });

      mockWithMiddleware.mockImplementation(
        (handler: (...args: any[]) => any, _options: unknown) => {
          return async (request: any) => {
            const ctx = {
              user: { id: 'user_001' },
              tenantId: 'tenant_001',
              requestId: 'req_001',
              params: {},
            };
            return handler(request, ctx);
          };
        },
      );

      const { GET } = await import('../app/api/v1/erp/close-orchestrator/route');
      const request = new Request('http://localhost/api/v1/erp/close-orchestrator') as unknown as NextRequest;
      const response = await GET(request);
      const body = await response.json();

      expect(body.data).toHaveLength(1);
      expect(body.meta.hasMore).toBe(false);
    });
  });

  describe('GET /api/v1/erp/close-orchestrator/[id]', () => {
    it('returns a specific run', async () => {
      mockGetCloseOrchestratorRun.mockResolvedValue({
        id: 'run_001',
        status: 'completed',
        totalSteps: 5,
        stepResults: [],
      });

      mockWithMiddleware.mockImplementation(
        (handler: (...args: any[]) => any, _options: unknown) => {
          return async (request: any) => {
            const ctx = {
              user: { id: 'user_001' },
              tenantId: 'tenant_001',
              requestId: 'req_001',
              params: { id: 'run_001' },
            };
            return handler(request, ctx);
          };
        },
      );

      const { GET } = await import('../app/api/v1/erp/close-orchestrator/[id]/route');
      const request = new Request('http://localhost/api/v1/erp/close-orchestrator/run_001') as unknown as NextRequest;
      const response = await GET(request);
      const body = await response.json();

      expect(body.data.id).toBe('run_001');
      expect(body.data.status).toBe('completed');
    });

    it('returns 404 for missing run', async () => {
      mockGetCloseOrchestratorRun.mockResolvedValue(null);

      mockWithMiddleware.mockImplementation(
        (handler: (...args: any[]) => any, _options: unknown) => {
          return async (request: any) => {
            const ctx = {
              user: { id: 'user_001' },
              tenantId: 'tenant_001',
              requestId: 'req_001',
              params: { id: 'run_missing' },
            };
            return handler(request, ctx);
          };
        },
      );

      const { GET } = await import('../app/api/v1/erp/close-orchestrator/[id]/route');
      const request = new Request('http://localhost/api/v1/erp/close-orchestrator/run_missing') as unknown as NextRequest;
      const response = await GET(request);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/erp/verticals', () => {
    it('returns all business verticals', async () => {
      mockWithMiddleware.mockImplementation(
        (handler: (...args: any[]) => any, _options: unknown) => {
          return async (request: any) => {
            const ctx = {
              user: { id: 'user_001' },
              tenantId: 'tenant_001',
              requestId: 'req_001',
              params: {},
            };
            return handler(request, ctx);
          };
        },
      );

      const { GET } = await import('../app/api/v1/erp/verticals/route');
      const request = new Request('http://localhost/api/v1/erp/verticals') as unknown as NextRequest;
      const response = await GET(request);
      const body = await response.json();

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      // Check structure of first entry
      const first = body.data[0];
      expect(first).toHaveProperty('key');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('icon');
      expect(first).toHaveProperty('status');
      expect(first).toHaveProperty('category');
      expect(first).toHaveProperty('defaultTier');
      expect(first).toHaveProperty('recommendedModules');
    });

    it('includes available verticals', async () => {
      const { GET } = await import('../app/api/v1/erp/verticals/route');
      const request = new Request('http://localhost/api/v1/erp/verticals') as unknown as NextRequest;
      const response = await GET(request);
      const body = await response.json();

      const keys = body.data.map((v: any) => v.key);
      expect(keys).toContain('retail');
      expect(keys).toContain('restaurant');
      expect(keys).toContain('golf_club');
      expect(keys).toContain('general');
    });
  });
});
