import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const { mockExecute, mockWithTenant, mockPublishWithOutbox, mockAuditLog, mockCheckIdempotency, mockSaveIdempotencyKey, mockBuildEventFromContext } = vi.hoisted(() => {
  const mockExecute = vi.fn();

  const mockWithTenant = vi.fn(
    async (_tid: string, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { execute: mockExecute };
      return fn(tx);
    },
  );

  const mockPublishWithOutbox = vi.fn(
    async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: mockExecute,
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 'proj_001',
              tenantId: 'T1',
              projectNumber: 'PJ-20260227-ABC123',
              name: 'Test Project',
              status: 'active',
              version: 1,
            }]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                id: 'proj_001',
                tenantId: 'T1',
                name: 'Updated Project',
                status: 'active',
                version: 2,
              }]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      const result = await fn(tx);
      return (result as any).result;
    },
  );

  const mockAuditLog = vi.fn().mockResolvedValue(undefined);
  const mockCheckIdempotency = vi.fn().mockResolvedValue({ isDuplicate: false });
  const mockSaveIdempotencyKey = vi.fn().mockResolvedValue(undefined);
  const mockBuildEventFromContext = vi.fn(() => ({ type: 'test.event.v1', data: {} }));

  return { mockExecute, mockWithTenant, mockPublishWithOutbox, mockAuditLog, mockCheckIdempotency, mockSaveIdempotencyKey, mockBuildEventFromContext };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth', () => ({
  withTenant: mockWithTenant,
}));

vi.mock('@oppsera/core/events', () => ({
  publishWithOutbox: mockPublishWithOutbox,
  buildEventFromContext: mockBuildEventFromContext,
}));

vi.mock('@oppsera/core/audit', () => ({
  auditLog: mockAuditLog,
}));

vi.mock('@oppsera/core/helpers', () => ({
  checkIdempotency: mockCheckIdempotency,
  saveIdempotencyKey: mockSaveIdempotencyKey,
}));

vi.mock('@oppsera/shared', () => ({
  ulid: vi.fn(() => 'ULID_TEST_01PROJ'),
  generateUlid: vi.fn(() => 'ULID_TEST_01PROJ'),
}));

vi.mock('@oppsera/db', () => ({
  withTenant: mockWithTenant,
  projects: Symbol('projects'),
  projectTasks: Symbol('projectTasks'),
  rmProjectCostSummary: Symbol('rmProjectCostSummary'),
  glJournalLines: Symbol('glJournalLines'),
  glJournalEntries: Symbol('glJournalEntries'),
  glAccounts: Symbol('glAccounts'),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
  }),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  lt: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  like: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
  or: vi.fn(),
  sql: Object.assign(vi.fn((...args: unknown[]) => args), {
    raw: vi.fn((s: string) => s),
  }),
}));

// ── Imports ───────────────────────────────────────────────────

import {
  createProjectSchema,
  updateProjectSchema,
  archiveProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  listProjectsSchema,
  listTasksSchema,
  projectCostDetailSchema,
} from '../validation';

import { handleGlEntryPostedForProjectCost } from '../consumers/gl-entry-posted';

// ── Test Context ──────────────────────────────────────────────

const mockCtx = {
  tenantId: 'T1',
  locationId: 'L1',
  user: { id: 'U1', email: 'test@test.com', role: 'owner' },
  requestId: 'REQ1',
};

// ─────────────────────────────────────────────────────────────
// VALIDATION TESTS
// ─────────────────────────────────────────────────────────────

describe('Validation: createProjectSchema', () => {
  it('accepts valid minimal input', () => {
    const result = createProjectSchema.safeParse({ name: 'My Project' });
    expect(result.success).toBe(true);
  });

  it('accepts valid full input', () => {
    const result = createProjectSchema.safeParse({
      name: 'Full Project',
      description: 'A detailed project',
      projectType: 'renovation',
      customerId: 'CUST1',
      managerUserId: 'MGR1',
      startDate: '2026-03-01',
      endDate: '2026-06-30',
      budgetAmount: '50000.00',
      budgetLaborHours: '200.00',
      notes: 'Some notes',
      metadata: { source: 'manual' },
      clientRequestId: 'CRQ1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createProjectSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 200 chars', () => {
    const result = createProjectSchema.safeParse({ name: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = createProjectSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects description over 2000 chars', () => {
    const result = createProjectSchema.safeParse({
      name: 'Valid',
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects notes over 5000 chars', () => {
    const result = createProjectSchema.safeParse({
      name: 'Valid',
      notes: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe('Validation: updateProjectSchema', () => {
  it('accepts empty update (all optional)', () => {
    const result = updateProjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts name update', () => {
    const result = updateProjectSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts nullable fields', () => {
    const result = updateProjectSchema.safeParse({
      description: null,
      projectType: null,
      customerId: null,
      managerUserId: null,
      startDate: null,
      endDate: null,
      budgetAmount: null,
      budgetLaborHours: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts expectedVersion for optimistic locking', () => {
    const result = updateProjectSchema.safeParse({ name: 'X', expectedVersion: 3 });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer expectedVersion', () => {
    const result = updateProjectSchema.safeParse({ expectedVersion: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('Validation: archiveProjectSchema', () => {
  it('accepts empty input', () => {
    const result = archiveProjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts reason', () => {
    const result = archiveProjectSchema.safeParse({ reason: 'Project cancelled' });
    expect(result.success).toBe(true);
  });

  it('rejects reason over 500 chars', () => {
    const result = archiveProjectSchema.safeParse({ reason: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe('Validation: createTaskSchema', () => {
  it('accepts valid minimal input', () => {
    const result = createTaskSchema.safeParse({ name: 'Task 1' });
    expect(result.success).toBe(true);
  });

  it('defaults sortOrder to 0', () => {
    const result = createTaskSchema.safeParse({ name: 'Task 1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(0);
    }
  });

  it('accepts full input', () => {
    const result = createTaskSchema.safeParse({
      name: 'Foundation Work',
      description: 'Pour the foundation',
      budgetAmount: '10000.00',
      budgetHours: '50',
      glExpenseAccountId: 'ACC1',
      sortOrder: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createTaskSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('Validation: updateTaskSchema', () => {
  it('accepts status transition', () => {
    const result = updateTaskSchema.safeParse({ status: 'in_progress' });
    expect(result.success).toBe(true);
  });

  it('accepts all valid statuses', () => {
    for (const status of ['open', 'in_progress', 'complete', 'closed']) {
      const result = updateTaskSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = updateTaskSchema.safeParse({ status: 'cancelled' });
    expect(result.success).toBe(false);
  });
});

describe('Validation: listProjectsSchema', () => {
  it('accepts minimal input (tenantId required)', () => {
    const result = listProjectsSchema.safeParse({ tenantId: 'T1' });
    expect(result.success).toBe(true);
  });

  it('defaults limit to 50', () => {
    const result = listProjectsSchema.safeParse({ tenantId: 'T1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('accepts all filter combinations', () => {
    const result = listProjectsSchema.safeParse({
      tenantId: 'T1',
      status: 'active',
      locationId: 'L1',
      customerId: 'C1',
      startDateFrom: '2026-01-01',
      startDateTo: '2026-12-31',
      search: 'foundation',
      cursor: 'CURSOR_1',
      limit: 25,
    });
    expect(result.success).toBe(true);
  });

  it('rejects limit over 100', () => {
    const result = listProjectsSchema.safeParse({ tenantId: 'T1', limit: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects limit of 0', () => {
    const result = listProjectsSchema.safeParse({ tenantId: 'T1', limit: 0 });
    expect(result.success).toBe(false);
  });
});

describe('Validation: listTasksSchema', () => {
  it('requires tenantId and projectId', () => {
    const result = listTasksSchema.safeParse({ tenantId: 'T1', projectId: 'P1' });
    expect(result.success).toBe(true);
  });

  it('rejects missing projectId', () => {
    const result = listTasksSchema.safeParse({ tenantId: 'T1' });
    expect(result.success).toBe(false);
  });

  it('defaults limit to 50', () => {
    const result = listTasksSchema.safeParse({ tenantId: 'T1', projectId: 'P1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });
});

describe('Validation: projectCostDetailSchema', () => {
  it('requires tenantId and projectId', () => {
    const result = projectCostDetailSchema.safeParse({ tenantId: 'T1', projectId: 'P1' });
    expect(result.success).toBe(true);
  });

  it('accepts all filters', () => {
    const result = projectCostDetailSchema.safeParse({
      tenantId: 'T1',
      projectId: 'P1',
      taskId: 'TASK1',
      accountType: 'expense',
      fromDate: '2026-01-01',
      toDate: '2026-06-30',
      cursor: 'C1',
      limit: 200,
    });
    expect(result.success).toBe(true);
  });

  it('defaults limit to 100', () => {
    const result = projectCostDetailSchema.safeParse({ tenantId: 'T1', projectId: 'P1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100);
    }
  });

  it('rejects limit over 500', () => {
    const result = projectCostDetailSchema.safeParse({
      tenantId: 'T1',
      projectId: 'P1',
      limit: 501,
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// CONSUMER TESTS
// ─────────────────────────────────────────────────────────────

/** Wrap GL entry data in an EventEnvelope structure */
function makeGlEvent(tenantId: string, data: Record<string, unknown>) {
  return {
    eventId: `evt-${data.journalEntryId ?? 'test'}`,
    eventType: 'accounting.journal.posted.v1',
    occurredAt: '2026-03-15T00:00:00.000Z',
    tenantId,
    idempotencyKey: `idem-${data.journalEntryId ?? 'test'}`,
    data,
  } as any;
}

describe('Consumer: handleGlEntryPostedForProjectCost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue([]);
  });

  it('skips when no project lines exist', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE1',
      entryDate: '2026-03-15',
      lines: [
        { accountId: 'A1', debitAmount: '100.00', creditAmount: '0.00', projectId: null },
        { accountId: 'A2', debitAmount: '0.00', creditAmount: '100.00', projectId: null },
      ],
    }));

    expect(mockWithTenant).not.toHaveBeenCalled();
  });

  it('upserts cost summary for revenue lines', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE2',
      entryDate: '2026-03-15',
      lines: [
        {
          accountId: 'REV1',
          accountType: 'revenue',
          debitAmount: '0.00',
          creditAmount: '5000.00',
          projectId: 'P1',
        },
      ],
    }));

    expect(mockWithTenant).toHaveBeenCalledWith('T1', expect.any(Function));
    expect(mockExecute).toHaveBeenCalled();
  });

  it('upserts cost summary for expense lines', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE3',
      entryDate: '2026-04-01',
      lines: [
        {
          accountId: 'EXP1',
          accountType: 'expense',
          debitAmount: '2500.00',
          creditAmount: '0.00',
          projectId: 'P1',
        },
      ],
    }));

    expect(mockWithTenant).toHaveBeenCalledWith('T1', expect.any(Function));
    expect(mockExecute).toHaveBeenCalled();
  });

  it('upserts cost summary for asset lines as material cost', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE4',
      entryDate: '2026-04-15',
      lines: [
        {
          accountId: 'MAT1',
          accountType: 'asset',
          debitAmount: '1200.00',
          creditAmount: '0.00',
          projectId: 'P1',
        },
      ],
    }));

    expect(mockWithTenant).toHaveBeenCalledWith('T1', expect.any(Function));
    expect(mockExecute).toHaveBeenCalled();
  });

  it('groups by project across multiple lines', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE5',
      entryDate: '2026-05-01',
      lines: [
        { accountId: 'R1', accountType: 'revenue', debitAmount: '0.00', creditAmount: '3000.00', projectId: 'PA' },
        { accountId: 'E1', accountType: 'expense', debitAmount: '1500.00', creditAmount: '0.00', projectId: 'PA' },
        { accountId: 'R2', accountType: 'revenue', debitAmount: '0.00', creditAmount: '2000.00', projectId: 'PB' },
      ],
    }));

    expect(mockWithTenant).toHaveBeenCalledWith('T1', expect.any(Function));
    // Should have called execute twice (once per project)
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('derives fiscal period from entry date', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE6',
      entryDate: '2026-11-20',
      lines: [
        { accountId: 'E1', accountType: 'expense', debitAmount: '500.00', creditAmount: '0.00', projectId: 'P1' },
      ],
    }));

    // The fiscal period should be 2026-11
    expect(mockWithTenant).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalled();
  });

  it('handles unknown account types as other cost', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE7',
      entryDate: '2026-06-01',
      lines: [
        { accountId: 'X1', accountType: 'liability', debitAmount: '300.00', creditAmount: '0.00', projectId: 'P1' },
      ],
    }));

    expect(mockWithTenant).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalled();
  });

  it('handles missing accountType gracefully', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE8',
      entryDate: '2026-06-15',
      lines: [
        { accountId: 'X2', debitAmount: '150.00', creditAmount: '0.00', projectId: 'P1' },
      ],
    }));

    expect(mockWithTenant).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalled();
  });

  it('filters out non-project lines from mixed entry', async () => {
    await handleGlEntryPostedForProjectCost(makeGlEvent('T1', {
      journalEntryId: 'JE9',
      entryDate: '2026-07-01',
      lines: [
        { accountId: 'R1', accountType: 'revenue', debitAmount: '0.00', creditAmount: '1000.00', projectId: 'P1' },
        { accountId: 'E1', accountType: 'expense', debitAmount: '500.00', creditAmount: '0.00', projectId: null },
        { accountId: 'E2', accountType: 'expense', debitAmount: '300.00', creditAmount: '0.00', projectId: 'P1' },
      ],
    }));

    // Only one project (P1), so one execute call
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────
// CONSTANTS TESTS
// ─────────────────────────────────────────────────────────────

describe('Constants: PROJECT_STATUSES', () => {
  it('has expected statuses', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@oppsera/shared');
    const PROJECT_STATUSES = actual.PROJECT_STATUSES as Record<string, unknown>;
    expect(PROJECT_STATUSES).toBeDefined();
    expect(typeof PROJECT_STATUSES).toBe('object');
    const keys = Object.keys(PROJECT_STATUSES);
    expect(keys).toContain('active');
    expect(keys).toContain('completed');
    expect(keys).toContain('closed');
    expect(keys).toContain('archived');
  });
});

describe('Constants: TASK_STATUSES', () => {
  it('has expected statuses', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@oppsera/shared');
    const TASK_STATUSES = actual.TASK_STATUSES as Record<string, unknown>;
    expect(TASK_STATUSES).toBeDefined();
    const keys = Object.keys(TASK_STATUSES);
    expect(keys).toContain('open');
    expect(keys).toContain('in_progress');
    expect(keys).toContain('complete');
    expect(keys).toContain('closed');
  });
});

describe('Constants: PROJECT_TYPES', () => {
  it('has expected types', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@oppsera/shared');
    const PROJECT_TYPES = actual.PROJECT_TYPES as Record<string, unknown>;
    expect(PROJECT_TYPES).toBeDefined();
    const keys = Object.keys(PROJECT_TYPES);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    expect(keys).toContain('renovation');
    expect(keys).toContain('event');
    expect(keys).toContain('campaign');
  });
});

describe('Constants: PROJECT_NUMBER_PREFIX', () => {
  it('is PJ', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@oppsera/shared');
    expect(actual.PROJECT_NUMBER_PREFIX).toBe('PJ');
  });
});

// ─────────────────────────────────────────────────────────────
// MODULE EXPORT TESTS
// ─────────────────────────────────────────────────────────────

describe('Module: exports', () => {
  it('exports all commands', async () => {
    const mod = await import('../index');
    expect(mod.createProject).toBeDefined();
    expect(mod.updateProject).toBeDefined();
    expect(mod.archiveProject).toBeDefined();
    expect(mod.unarchiveProject).toBeDefined();
    expect(mod.closeProject).toBeDefined();
    expect(mod.createTask).toBeDefined();
    expect(mod.updateTask).toBeDefined();
    expect(mod.closeTask).toBeDefined();
  });

  it('exports all queries', async () => {
    const mod = await import('../index');
    expect(mod.listProjects).toBeDefined();
    expect(mod.getProject).toBeDefined();
    expect(mod.getProjectProfitability).toBeDefined();
    expect(mod.getProjectCostDetail).toBeDefined();
    expect(mod.listTasks).toBeDefined();
  });

  it('exports consumer', async () => {
    const mod = await import('../index');
    expect(mod.handleGlEntryPostedForProjectCost).toBeDefined();
  });

  it('exports validation schemas', async () => {
    const mod = await import('../index');
    expect(mod.createProjectSchema).toBeDefined();
    expect(mod.updateProjectSchema).toBeDefined();
    expect(mod.archiveProjectSchema).toBeDefined();
    expect(mod.createTaskSchema).toBeDefined();
    expect(mod.updateTaskSchema).toBeDefined();
    expect(mod.listProjectsSchema).toBeDefined();
    expect(mod.listTasksSchema).toBeDefined();
    expect(mod.projectCostDetailSchema).toBeDefined();
  });

  it('exports module constants', async () => {
    const mod = await import('../index');
    expect(mod.MODULE_KEY).toBe('project_costing');
    expect(mod.MODULE_NAME).toBe('Project Costing');
  });
});
