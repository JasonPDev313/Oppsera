import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────

const {
  mockSelect,
  mockUpdate,
  mockInsert,
  mockDelete,
} = vi.hoisted(() => {
  function makeSelectChain(result: unknown[] = []) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.leftJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.offset = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
    return chain;
  }

  const mockSelect = vi.fn(() => makeSelectChain());
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();

  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-action-1' }]),
    }),
  });

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'action-1' }]),
      }),
    }),
  });

  mockDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  return { mockSelect, mockInsert, mockUpdate, mockDelete };
});

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn((_tenantId: string, fn: (tx: unknown) => unknown) => {
    const tx = {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    };
    return fn(tx);
  }),
  tagActions: {
    id: 'id',
    tenantId: 'tenant_id',
    tagId: 'tag_id',
    trigger: 'trigger',
    actionType: 'action_type',
    config: 'config',
    isActive: 'is_active',
    executionOrder: 'execution_order',
    updatedAt: 'updated_at',
  },
  tagActionExecutions: {
    id: 'id',
    tenantId: 'tenant_id',
    tagActionId: 'tag_action_id',
    customerId: 'customer_id',
    trigger: 'trigger',
    status: 'status',
    resultSummary: 'result_summary',
    errorMessage: 'error_message',
    durationMs: 'duration_ms',
  },
  tags: {
    id: 'id',
    tenantId: 'tenant_id',
    name: 'name',
  },
  customerActivityLog: {},
  customerServiceFlags: {
    id: 'id',
    tenantId: 'tenant_id',
    customerId: 'customer_id',
    flagType: 'flag_type',
    expiresAt: 'expires_at',
  },
  customerSegmentMemberships: {
    id: 'id',
    tenantId: 'tenant_id',
    customerId: 'customer_id',
    segmentId: 'segment_id',
    removedAt: 'removed_at',
  },
  customerWalletAccounts: {
    id: 'id',
    tenantId: 'tenant_id',
    customerId: 'customer_id',
    walletType: 'wallet_type',
    balanceCents: 'balance_cents',
    status: 'status',
  },
  customerAlerts: {},
  customerPreferences: {
    id: 'id',
    tenantId: 'tenant_id',
    customerId: 'customer_id',
    category: 'category',
    key: 'key',
  },
  customers: {
    id: 'id',
    tenantId: 'tenant_id',
  },
}));

vi.mock('@oppsera/shared', () => ({
  generateUlid: vi.fn(() => 'test-ulid-123'),
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    constructor(entity: string, id: string) {
      super(`${entity} not found: ${id}`);
    }
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  asc: vi.fn((col: unknown) => ({ type: 'asc', col })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
  gt: vi.fn((...args: unknown[]) => ({ type: 'gt', args })),
  lte: vi.fn((...args: unknown[]) => ({ type: 'lte', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));

// ── Import services ─────────────────────────────────────────────

import { executeTagActions } from '../services/tag-action-executor';
import {
  createTagAction,
  updateTagAction,
  deleteTagAction,
  reorderTagActions,
  createTagActionSchema,
  updateTagActionSchema,
  reorderTagActionsSchema,
} from '../commands/manage-tag-actions';

// ── Helpers ─────────────────────────────────────────────────────

function makeSelectChain(result: unknown[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

function makeTx() {
  return {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  };
}

const TENANT_ID = 'tenant-001';
const CUSTOMER_ID = 'cust-001';
const TAG_ID = 'tag-001';

// ──────────────────────────────────────────────────────────────────
// Tag Action Executor
// ──────────────────────────────────────────────────────────────────

describe('Tag Action Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock chains
    mockSelect.mockImplementation(() => makeSelectChain([]));
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'new-id' }]),
      }),
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'updated-id' }]),
        }),
      }),
    });
  });

  it('returns empty result when no actions exist', async () => {
    const tx = makeTx();
    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.executed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('executes log_activity action successfully', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-1',
        actionType: 'log_activity',
        config: { activityType: 'tag_applied', message: 'VIP tag applied' },
        isActive: true,
      },
    ];

    // First call returns actions, subsequent calls return empty
    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.executed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]!.actionType).toBe('log_activity');
    expect(result.results[0]!.status).toBe('success');
    expect(result.results[0]!.resultSummary).toEqual({
      activityType: 'tag_applied',
      message: 'VIP tag applied',
    });
  });

  it('executes set_customer_field action for allowed fields', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-2',
        actionType: 'set_customer_field',
        config: { field: 'vipLevel', value: 'gold' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({ field: 'vipLevel', value: 'gold' });
  });

  it('fails set_customer_field for disallowed fields', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-3',
        actionType: 'set_customer_field',
        config: { field: 'email', value: 'evil@example.com' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.failed).toBe(1);
    expect(result.results[0]!.status).toBe('failed');
    expect(result.results[0]!.errorMessage).toContain('not allowed');
  });

  it('executes add_to_segment action with new membership', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-4',
        actionType: 'add_to_segment',
        config: { segmentId: 'seg-vip' },
        isActive: true,
      },
    ];

    // First call: action query returns actions
    // Second call: existing membership check returns empty
    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({ segmentId: 'seg-vip', action: 'added' });
  });

  it('reactivates existing segment membership', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-4b',
        actionType: 'add_to_segment',
        config: { segmentId: 'seg-vip' },
        isActive: true,
      },
    ];

    // First call: action query returns actions
    // Second call: existing membership found
    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementationOnce(() => makeSelectChain([{ id: 'existing-membership' }]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({ segmentId: 'seg-vip', action: 'reactivated' });
  });

  it('executes remove_from_segment action', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-5',
        actionType: 'remove_from_segment',
        config: { segmentId: 'seg-churned' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_remove');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({ segmentId: 'seg-churned', action: 'removed' });
  });

  it('executes set_service_flag action', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-6',
        actionType: 'set_service_flag',
        config: { flagType: 'vip_service', severity: 'info', note: 'Elevated service' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({ flagType: 'vip_service', severity: 'info' });
  });

  it('executes remove_service_flag action', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-7',
        actionType: 'remove_service_flag',
        config: { flagType: 'vip_service' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_remove');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({ flagType: 'vip_service', action: 'deactivated' });
  });

  it('executes send_notification action (logs only in V1)', async () => {
    const tx = makeTx();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const actions = [
      {
        id: 'action-8',
        actionType: 'send_notification',
        config: { channel: 'email', template: 'welcome_vip', recipientRole: 'manager' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({
      channel: 'email',
      template: 'welcome_vip',
      recipientRole: 'manager',
      status: 'logged',
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('executes adjust_wallet action creating new wallet', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-9',
        actionType: 'adjust_wallet',
        config: { walletType: 'loyalty', amountCents: 500, reason: 'VIP bonus' },
        isActive: true,
      },
    ];

    // First: action query. Second: wallet lookup returns empty (no wallet)
    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementationOnce(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({
      walletType: 'loyalty',
      amountCents: 500,
      newBalance: 500,
      action: 'created',
    });
  });

  it('executes adjust_wallet action adjusting existing wallet', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-9b',
        actionType: 'adjust_wallet',
        config: { walletType: 'loyalty', amountCents: 200 },
        isActive: true,
      },
    ];

    // First: action query. Second: wallet lookup returns existing wallet
    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementationOnce(() => makeSelectChain([{ id: 'wallet-1', balanceCents: 300 }]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({
      walletType: 'loyalty',
      amountCents: 200,
      newBalance: 500,
      action: 'adjusted',
    });
  });

  it('fails adjust_wallet with zero amountCents', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-9c',
        actionType: 'adjust_wallet',
        config: { walletType: 'loyalty', amountCents: 0 },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.failed).toBe(1);
    expect(result.results[0]!.errorMessage).toContain('non-zero');
  });

  it('executes set_preference action creating new preference', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-10',
        actionType: 'set_preference',
        config: { category: 'service', key: 'priority', value: 'high' },
        isActive: true,
      },
    ];

    // First: action query. Second: preference lookup returns empty
    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementationOnce(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({
      category: 'service',
      key: 'priority',
      value: 'high',
      action: 'created',
    });
  });

  it('executes set_preference action updating existing preference', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-10b',
        actionType: 'set_preference',
        config: { category: 'service', key: 'priority', value: 'urgent' },
        isActive: true,
      },
    ];

    // First: action query. Second: preference lookup returns existing
    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementationOnce(() => makeSelectChain([{ id: 'pref-1' }]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({
      category: 'service',
      key: 'priority',
      value: 'urgent',
      action: 'updated',
    });
  });

  it('executes create_alert action', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-11',
        actionType: 'create_alert',
        config: { alertType: 'vip_notification', severity: 'warning', message: 'New VIP member' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.resultSummary).toEqual({
      alertType: 'vip_notification',
      severity: 'warning',
      message: 'New VIP member',
    });
  });

  it('fails create_alert without message', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-11b',
        actionType: 'create_alert',
        config: { alertType: 'test' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.failed).toBe(1);
    expect(result.results[0]!.errorMessage).toContain('message');
  });

  it('handles unknown action type gracefully', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-12',
        actionType: 'unknown_action',
        config: {},
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.failed).toBe(1);
    expect(result.results[0]!.status).toBe('failed');
    expect(result.results[0]!.errorMessage).toContain('Unknown action type');
  });

  it('continues executing after individual action failure', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-fail',
        actionType: 'set_customer_field',
        config: { field: 'disallowed_field', value: 'x' },
        isActive: true,
      },
      {
        id: 'action-succeed',
        actionType: 'log_activity',
        config: { message: 'Success after failure' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.executed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.results[0]!.status).toBe('failed');
    expect(result.results[1]!.status).toBe('success');
  });

  it('never throws even when top-level query fails', async () => {
    const tx = makeTx();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockSelect.mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.executed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('records execution audit trail for each action', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-audit-1',
        actionType: 'log_activity',
        config: { message: 'Test' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    // Should have called insert twice: once for log_activity, once for execution audit
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('tracks durationMs for each action', async () => {
    const tx = makeTx();
    const actions = [
      {
        id: 'action-timing',
        actionType: 'log_activity',
        config: { message: 'Timing test' },
        isActive: true,
      },
    ];

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    expect(result.results[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles audit insert failure without blocking', async () => {
    const tx = makeTx();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const actions = [
      {
        id: 'action-audit-fail',
        actionType: 'log_activity',
        config: { message: 'Test' },
        isActive: true,
      },
    ];

    let insertCallCount = 0;
    mockInsert.mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 2) {
        // Second insert is the audit trail — fail it
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('Audit insert failed')),
          }),
        };
      }
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'ok' }]),
        }),
      };
    });

    mockSelect
      .mockImplementationOnce(() => makeSelectChain(actions))
      .mockImplementation(() => makeSelectChain([]));

    const result = await executeTagActions(tx, TENANT_ID, CUSTOMER_ID, TAG_ID, 'on_apply');

    // Should still succeed — audit failure doesn't block
    expect(result.executed).toBe(1);
    expect(result.succeeded).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// Tag Action CRUD Commands
// ──────────────────────────────────────────────────────────────────

describe('Tag Action CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSelect.mockImplementation(() => makeSelectChain([{ id: 'tag-exists' }]));
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'new-action-1',
          tenantId: TENANT_ID,
          tagId: TAG_ID,
          trigger: 'on_apply',
          actionType: 'log_activity',
          config: {},
          isActive: true,
          executionOrder: 100,
        }]),
      }),
    });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'action-1',
            trigger: 'on_remove',
          }]),
        }),
      }),
    });
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  describe('createTagAction', () => {
    it('creates a tag action with valid input', async () => {
      const result = await createTagAction(TENANT_ID, TAG_ID, {
        trigger: 'on_apply',
        actionType: 'log_activity',
        config: { message: 'Hello' },
      });

      expect(result).toBeDefined();
      expect(mockInsert).toHaveBeenCalled();
    });

    it('throws NotFoundError if tag does not exist', async () => {
      mockSelect.mockImplementation(() => makeSelectChain([]));

      await expect(
        createTagAction(TENANT_ID, TAG_ID, {
          trigger: 'on_apply',
          actionType: 'log_activity',
        }),
      ).rejects.toThrow('not found');
    });

    it('uses default executionOrder of 100', async () => {
      await createTagAction(TENANT_ID, TAG_ID, {
        trigger: 'on_apply',
        actionType: 'log_activity',
      });

      const insertValues = mockInsert.mock.results[0]?.value.values;
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ executionOrder: 100 }),
      );
    });

    it('uses default isActive of true', async () => {
      await createTagAction(TENANT_ID, TAG_ID, {
        trigger: 'on_expire',
        actionType: 'send_notification',
      });

      const insertValues = mockInsert.mock.results[0]?.value.values;
      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  describe('updateTagAction', () => {
    it('updates a tag action', async () => {
      // First select: action exists check
      mockSelect.mockImplementation(() => makeSelectChain([{ id: 'action-1' }]));

      const result = await updateTagAction(TENANT_ID, TAG_ID, 'action-1', {
        trigger: 'on_remove',
      });

      expect(result).toBeDefined();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('throws NotFoundError if action does not exist', async () => {
      mockSelect.mockImplementation(() => makeSelectChain([]));

      await expect(
        updateTagAction(TENANT_ID, TAG_ID, 'nonexistent', { isActive: false }),
      ).rejects.toThrow('not found');
    });

    it('only updates provided fields', async () => {
      mockSelect.mockImplementation(() => makeSelectChain([{ id: 'action-1' }]));

      await updateTagAction(TENANT_ID, TAG_ID, 'action-1', { isActive: false });

      const setCall = mockUpdate.mock.results[0]?.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe('deleteTagAction', () => {
    it('deletes a tag action', async () => {
      mockSelect.mockImplementation(() => makeSelectChain([{ id: 'action-1' }]));

      const result = await deleteTagAction(TENANT_ID, TAG_ID, 'action-1');

      expect(result).toEqual({ deleted: true });
      expect(mockDelete).toHaveBeenCalled();
    });

    it('throws NotFoundError if action does not exist', async () => {
      mockSelect.mockImplementation(() => makeSelectChain([]));

      await expect(
        deleteTagAction(TENANT_ID, TAG_ID, 'nonexistent'),
      ).rejects.toThrow('not found');
    });
  });

  describe('reorderTagActions', () => {
    it('updates execution_order for each action', async () => {
      // Tag exists + final select returns reordered
      mockSelect
        .mockImplementationOnce(() => makeSelectChain([{ id: 'tag-exists' }]))
        .mockImplementationOnce(() => makeSelectChain([
          { id: 'action-b', executionOrder: 10 },
          { id: 'action-a', executionOrder: 20 },
        ]));

      const result = await reorderTagActions(TENANT_ID, TAG_ID, {
        actionIds: ['action-b', 'action-a'],
      });

      expect(result).toHaveLength(2);
      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundError if tag does not exist', async () => {
      mockSelect.mockImplementation(() => makeSelectChain([]));

      await expect(
        reorderTagActions(TENANT_ID, TAG_ID, { actionIds: ['a', 'b'] }),
      ).rejects.toThrow('not found');
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// Validation Schemas
// ──────────────────────────────────────────────────────────────────

describe('Tag Action Validation Schemas', () => {
  describe('createTagActionSchema', () => {
    it('accepts valid input with all fields', () => {
      const result = createTagActionSchema.safeParse({
        trigger: 'on_apply',
        actionType: 'log_activity',
        config: { message: 'test' },
        isActive: true,
        executionOrder: 50,
      });
      expect(result.success).toBe(true);
    });

    it('accepts minimal input (trigger + actionType only)', () => {
      const result = createTagActionSchema.safeParse({
        trigger: 'on_remove',
        actionType: 'set_customer_field',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.config).toEqual({});
        expect(result.data.isActive).toBe(true);
        expect(result.data.executionOrder).toBe(100);
      }
    });

    it('rejects invalid trigger', () => {
      const result = createTagActionSchema.safeParse({
        trigger: 'on_click',
        actionType: 'log_activity',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid actionType', () => {
      const result = createTagActionSchema.safeParse({
        trigger: 'on_apply',
        actionType: 'drop_table',
      });
      expect(result.success).toBe(false);
    });

    it('rejects executionOrder out of range', () => {
      const result = createTagActionSchema.safeParse({
        trigger: 'on_apply',
        actionType: 'log_activity',
        executionOrder: 10000,
      });
      expect(result.success).toBe(false);
    });

    it('accepts all 10 action types', () => {
      const actionTypes = [
        'log_activity', 'set_customer_field', 'add_to_segment',
        'remove_from_segment', 'set_service_flag', 'remove_service_flag',
        'send_notification', 'adjust_wallet', 'set_preference', 'create_alert',
      ];
      for (const actionType of actionTypes) {
        const result = createTagActionSchema.safeParse({
          trigger: 'on_apply',
          actionType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts all 3 trigger types', () => {
      for (const trigger of ['on_apply', 'on_remove', 'on_expire']) {
        const result = createTagActionSchema.safeParse({
          trigger,
          actionType: 'log_activity',
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('updateTagActionSchema', () => {
    it('accepts partial updates', () => {
      const result = updateTagActionSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('accepts empty object (no updates)', () => {
      const result = updateTagActionSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('reorderTagActionsSchema', () => {
    it('accepts valid action IDs array', () => {
      const result = reorderTagActionsSchema.safeParse({
        actionIds: ['action-1', 'action-2', 'action-3'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty actionIds array', () => {
      const result = reorderTagActionsSchema.safeParse({
        actionIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing actionIds', () => {
      const result = reorderTagActionsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
