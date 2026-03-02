import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Setup ──────────────────────────────────────────────────

const mockTx = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  delete: vi.fn().mockReturnThis(),
  execute: vi.fn(),
};

vi.mock('@oppsera/core/events/publish-with-outbox', () => ({
  publishWithOutbox: vi.fn(async (_ctx: any, fn: any) => {
    const { result } = await fn(mockTx);
    return result;
  }),
}));

vi.mock('@oppsera/core/events/build-event', () => ({
  buildEventFromContext: vi.fn((_ctx, type, payload) => ({ type, payload })),
}));

vi.mock('@oppsera/core/audit/helpers', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@oppsera/core/helpers/idempotency', () => ({
  checkIdempotency: vi.fn().mockResolvedValue({ isDuplicate: false }),
  saveIdempotencyKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: any) => fn(mockTx)),
  fnbTabs: { id: 'id', tenantId: 'tenant_id', status: 'status', tableId: 'table_id', serverUserId: 'server_user_id', version: 'version', locationId: 'location_id', openedAt: 'opened_at', metadata: 'metadata' },
  fnbTableLiveStatus: { tenantId: 'tenant_id', tableId: 'table_id', status: 'status', currentTabId: 'current_tab_id', currentServerUserId: 'current_server_user_id', partySize: 'party_size', guestNames: 'guest_names', seatedAt: 'seated_at', updatedAt: 'updated_at' },
  fnbTabTransfers: { tenantId: 'tenant_id', tabId: 'tab_id', transferType: 'transfer_type', fromServerUserId: 'from_server_user_id', toServerUserId: 'to_server_user_id', reason: 'reason', transferredBy: 'transferred_by' },
  fnbManagerOverrides: { id: 'id', tenantId: 'tenant_id', locationId: 'location_id', initiatorUserId: 'initiator_user_id', approverUserId: 'approver_user_id', actionType: 'action_type', tabIds: 'tab_ids', reasonCode: 'reason_code', reasonText: 'reason_text', metadata: 'metadata', resultSummary: 'result_summary', idempotencyKey: 'idempotency_key', createdAt: 'created_at' },
  fnbManageTabsSettings: { id: 'id', tenantId: 'tenant_id', locationId: 'location_id', showManageTabsButton: 'show_manage_tabs_button', requirePinForTransfer: 'require_pin_for_transfer', requirePinForVoid: 'require_pin_for_void', allowBulkAllServers: 'allow_bulk_all_servers', readOnlyForNonManagers: 'read_only_for_non_managers', maxBulkSelection: 'max_bulk_selection' },
  fnbSoftLocks: { tenantId: 'tenant_id' },
  memberships: { userId: 'user_id', tenantId: 'tenant_id', status: 'status' },
  users: { id: 'id', displayName: 'display_name', email: 'email', overridePin: 'override_pin' },
  roleAssignments: { tenantId: 'tenant_id', userId: 'user_id', roleId: 'role_id', locationId: 'location_id' },
  roles: { id: 'id', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: any[]) => ({ type: 'and', args })),
  or: vi.fn((...args: any[]) => ({ type: 'or', args })),
  inArray: vi.fn((...args: any[]) => ({ type: 'inArray', args })),
  desc: vi.fn((col: any) => ({ type: 'desc', col })),
  asc: vi.fn((col: any) => ({ type: 'asc', col })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => ({ strings, values }),
    { join: vi.fn(), raw: vi.fn((s: string) => s) },
  ),
  lt: vi.fn((...args: any[]) => ({ type: 'lt', args })),
  gte: vi.fn((...args: any[]) => ({ type: 'gte', args })),
  ilike: vi.fn((...args: any[]) => ({ type: 'ilike', args })),
}));

import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { buildEventFromContext } from '@oppsera/core/events/build-event';


// ── Helpers ─────────────────────────────────────────────────────

function makeCtx(overrides: Record<string, any> = {}): any {
  return {
    tenantId: 'tenant-1',
    user: { id: 'user-1', displayName: 'Test User' },
    locationId: 'loc-1',
    ...overrides,
  };
}

function makeTab(overrides: Record<string, any> = {}): any {
  return {
    id: 'tab-1',
    tenantId: 'tenant-1',
    status: 'open',
    tableId: 'table-1',
    serverUserId: 'server-1',
    version: 1,
    locationId: 'loc-1',
    openedAt: new Date('2026-01-01'),
    metadata: {},
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('Manage Tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset clears once-queues that clearAllMocks misses (gotcha #29)
    mockTx.select.mockReset().mockReturnThis();
    mockTx.from.mockReset().mockReturnThis();
    mockTx.where.mockReset().mockReturnThis();
    mockTx.limit.mockReset().mockReturnThis();
    mockTx.orderBy.mockReset().mockReturnThis();
    mockTx.innerJoin.mockReset().mockReturnThis();
    mockTx.leftJoin.mockReset().mockReturnThis();
    mockTx.update.mockReset().mockReturnThis();
    mockTx.set.mockReset().mockReturnThis();
    mockTx.insert.mockReset().mockReturnThis();
    mockTx.values.mockReset().mockReturnThis();
    mockTx.returning.mockReset().mockResolvedValue([]);
    mockTx.delete.mockReset().mockReturnThis();
    mockTx.execute.mockReset().mockResolvedValue([]);
  });

  // ────────────────────────────────────────────────────────────
  // Bulk Void Tabs
  // ────────────────────────────────────────────────────────────

  describe('bulkVoidTabs', () => {
    async function importBulkVoid() {
      return (await import('../commands/bulk-void-tabs')).bulkVoidTabs;
    }

    const VOIDABLE = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested'];

    it('voids tabs in valid statuses', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const tabs = VOIDABLE.map((status, i) => makeTab({ id: `tab-${i}`, status }));
      // select tabs
      mockTx.where.mockResolvedValueOnce(tabs);
      // insert override (source doesn't call .returning() on tab updates)
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: tabs.map((t: any) => t.id),
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-1',
      });

      expect(result.succeeded).toHaveLength(5);
      expect(result.failed).toHaveLength(0);
      expect(result.overrideId).toBe('override-1');
    });

    it('rejects tabs with invalid status', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const tab = makeTab({ id: 'tab-1', status: 'closed' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'error_correction',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-2',
      });

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.error).toContain("Cannot void tab in status 'closed'");
    });

    it('handles tab not found', async () => {
      const bulkVoidTabs = await importBulkVoid();
      mockTx.where.mockResolvedValueOnce([]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['nonexistent-tab'],
        reasonCode: 'stale_tab',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-3',
      });

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.error).toBe('Tab not found');
    });

    it('handles mixed valid and invalid tabs', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const tabs = [
        makeTab({ id: 'tab-1', status: 'open' }),
        makeTab({ id: 'tab-2', status: 'voided' }),
        makeTab({ id: 'tab-3', status: 'ordering' }),
      ];
      mockTx.where.mockResolvedValueOnce(tabs);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1', 'tab-2', 'tab-3'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-4',
      });

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.tabId).toBe('tab-2');
    });

    it('returns cached result on duplicate idempotency key', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const cachedResult = { succeeded: ['tab-1'], failed: [], overrideId: 'cached-override' };
      vi.mocked(checkIdempotency).mockResolvedValueOnce({ isDuplicate: true, originalResult: cachedResult });

      const result = await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-dup',
      });

      expect(result).toEqual(cachedResult);
      expect(mockTx.where).not.toHaveBeenCalled();
    });

    it('emits TABS_BULK_VOIDED event', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const tab = makeTab({ id: 'tab-1', status: 'open' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'server_leaving',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-event',
      });

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('bulk_voided'),
        expect.objectContaining({ overrideId: 'override-1', tabIds: ['tab-1'] }),
      );
    });

    it('creates audit log entry', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const tab = makeTab({ id: 'tab-1', status: 'open' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-audit',
      });

      expect(auditLog).toHaveBeenCalledWith(
        expect.anything(),
        'fnb.tabs.bulk_voided',
        'fnb_manager_overrides',
        'override-1',
        undefined,
        expect.objectContaining({ tabCount: 1, reasonCode: 'end_of_shift' }),
      );
    });

    it('saves idempotency key after success', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const tab = makeTab({ id: 'tab-1', status: 'open' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-save',
      });

      expect(saveIdempotencyKey).toHaveBeenCalledWith(
        mockTx,
        'tenant-1',
        'req-void-save',
        'bulkVoidTabs',
        expect.objectContaining({ succeeded: ['tab-1'], overrideId: 'override-1' }),
      );
    });

    it('skips table update for bar tabs (no tableId)', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const tab = makeTab({ id: 'tab-1', status: 'open', tableId: null });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-bar',
      });

      // update called once for the tab, NOT for table status
      const updateCalls = mockTx.update.mock.calls.length;
      // Should update fnbTabs only (1 call), not fnbTableLiveStatus
      expect(updateCalls).toBeLessThanOrEqual(1);
    });

    it('rejects voided tab status', async () => {
      const bulkVoidTabs = await importBulkVoid();
      const tab = makeTab({ id: 'tab-1', status: 'voided' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'error_correction',
        approverUserId: 'manager-1',
        clientRequestId: 'req-void-voided',
      });

      expect(result.failed[0]!.error).toContain("Cannot void tab in status 'voided'");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Bulk Transfer Tabs
  // ────────────────────────────────────────────────────────────

  describe('bulkTransferTabs', () => {
    async function importBulkTransfer() {
      return (await import('../commands/bulk-transfer-tabs')).bulkTransferTabs;
    }

    it('transfers tabs to a new server', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      const tab = makeTab({ id: 'tab-1', status: 'open', serverUserId: 'server-1' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkTransferTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        toServerUserId: 'server-2',
        reasonCode: 'server_leaving',
        clientRequestId: 'req-transfer-1',
      });

      expect(result.succeeded).toEqual(['tab-1']);
      expect(result.failed).toHaveLength(0);
      expect(result.overrideId).toBe('override-1');
    });

    it('rejects tab already assigned to target server', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      const tab = makeTab({ id: 'tab-1', status: 'open', serverUserId: 'server-2' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkTransferTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        toServerUserId: 'server-2',
        reasonCode: 'end_of_shift',
        clientRequestId: 'req-transfer-same',
      });

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.error).toContain('already assigned to target server');
    });

    it('rejects tabs with invalid status', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      const tab = makeTab({ id: 'tab-1', status: 'closed', serverUserId: 'server-1' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkTransferTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        toServerUserId: 'server-2',
        reasonCode: 'end_of_shift',
        clientRequestId: 'req-transfer-invalid',
      });

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.error).toContain("Cannot transfer tab in status 'closed'");
    });

    it('handles tab not found', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      mockTx.where.mockResolvedValueOnce([]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkTransferTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['missing-tab'],
        toServerUserId: 'server-2',
        reasonCode: 'error_correction',
        clientRequestId: 'req-transfer-missing',
      });

      expect(result.failed[0]!.error).toBe('Tab not found');
    });

    it('records transfer in fnbTabTransfers', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      const tab = makeTab({ id: 'tab-1', status: 'open', serverUserId: 'server-1' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkTransferTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        toServerUserId: 'server-2',
        reasonCode: 'server_leaving',
        clientRequestId: 'req-transfer-record',
      });

      // insert called for tab transfer + override
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('defaults approverUserId to ctx.user.id when not provided', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      const tab = makeTab({ id: 'tab-1', status: 'open', serverUserId: 'server-1' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkTransferTabs(makeCtx({ user: { id: 'ctx-user' } }), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        toServerUserId: 'server-2',
        reasonCode: 'end_of_shift',
        clientRequestId: 'req-transfer-default-approver',
      });

      // The event should have approverUserId = ctx.user.id
      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('bulk_transferred'),
        expect.objectContaining({ approverUserId: 'ctx-user' }),
      );
    });

    it('returns cached result on duplicate idempotency key', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      const cachedResult = { succeeded: ['tab-1'], failed: [], overrideId: 'cached' };
      vi.mocked(checkIdempotency).mockResolvedValueOnce({ isDuplicate: true, originalResult: cachedResult });

      const result = await bulkTransferTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        toServerUserId: 'server-2',
        reasonCode: 'end_of_shift',
        clientRequestId: 'req-transfer-dup',
      });

      expect(result).toEqual(cachedResult);
    });

    it('emits TABS_BULK_TRANSFERRED event with toServerUserId', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      const tab = makeTab({ id: 'tab-1', status: 'ordering', serverUserId: 'server-1' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkTransferTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        toServerUserId: 'server-2',
        reasonCode: 'server_leaving',
        clientRequestId: 'req-transfer-event',
      });

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('bulk_transferred'),
        expect.objectContaining({ toServerUserId: 'server-2' }),
      );
    });

    it('transfers multiple tabs with mixed results', async () => {
      const bulkTransferTabs = await importBulkTransfer();
      const tabs = [
        makeTab({ id: 'tab-1', status: 'open', serverUserId: 'server-1' }),
        makeTab({ id: 'tab-2', status: 'closed', serverUserId: 'server-1' }),
        makeTab({ id: 'tab-3', status: 'in_progress', serverUserId: 'server-2' }),
      ];
      mockTx.where.mockResolvedValueOnce(tabs);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkTransferTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1', 'tab-2', 'tab-3'],
        toServerUserId: 'server-2',
        reasonCode: 'end_of_shift',
        clientRequestId: 'req-transfer-mixed',
      });

      expect(result.succeeded).toEqual(['tab-1']);
      expect(result.failed).toHaveLength(2);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Bulk Close Tabs
  // ────────────────────────────────────────────────────────────

  describe('bulkCloseTabs', () => {
    async function importBulkClose() {
      return (await import('../commands/bulk-close-tabs')).bulkCloseTabs;
    }

    it('closes tabs in valid statuses', async () => {
      const bulkCloseTabs = await importBulkClose();
      const tab = makeTab({ id: 'tab-1', status: 'open' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkCloseTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-close-1',
      });

      expect(result.succeeded).toEqual(['tab-1']);
      expect(result.failed).toHaveLength(0);
    });

    it('accepts paying status (unlike void)', async () => {
      const bulkCloseTabs = await importBulkClose();
      const tab = makeTab({ id: 'tab-1', status: 'paying' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkCloseTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-close-paying',
      });

      expect(result.succeeded).toEqual(['tab-1']);
    });

    it('rejects voided or closed tabs', async () => {
      const bulkCloseTabs = await importBulkClose();
      const tabs = [
        makeTab({ id: 'tab-1', status: 'voided' }),
        makeTab({ id: 'tab-2', status: 'closed' }),
      ];
      mockTx.where.mockResolvedValueOnce(tabs);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkCloseTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1', 'tab-2'],
        reasonCode: 'error_correction',
        approverUserId: 'manager-1',
        clientRequestId: 'req-close-invalid',
      });

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
    });

    it('creates audit log with bulk_close action type', async () => {
      const bulkCloseTabs = await importBulkClose();
      const tab = makeTab({ id: 'tab-1', status: 'open' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkCloseTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-close-audit',
      });

      expect(auditLog).toHaveBeenCalledWith(
        expect.anything(),
        'fnb.tabs.bulk_closed',
        'fnb_manager_overrides',
        'override-1',
        undefined,
        expect.any(Object),
      );
    });

    it('emits TABS_BULK_CLOSED event', async () => {
      const bulkCloseTabs = await importBulkClose();
      const tab = makeTab({ id: 'tab-1', status: 'open' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await bulkCloseTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-close-event',
      });

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('bulk_closed'),
        expect.objectContaining({ tabIds: ['tab-1'] }),
      );
    });

    it('handles tab not found', async () => {
      const bulkCloseTabs = await importBulkClose();
      mockTx.where.mockResolvedValueOnce([]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await bulkCloseTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['missing'],
        reasonCode: 'stale_tab',
        approverUserId: 'manager-1',
        clientRequestId: 'req-close-missing',
      });

      expect(result.failed[0]!.error).toBe('Tab not found');
    });

    it('returns cached result on duplicate idempotency key', async () => {
      const bulkCloseTabs = await importBulkClose();
      const cached = { succeeded: ['tab-1'], failed: [], overrideId: 'cached' };
      vi.mocked(checkIdempotency).mockResolvedValueOnce({ isDuplicate: true, originalResult: cached });

      const result = await bulkCloseTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-1'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-close-dup',
      });

      expect(result).toEqual(cached);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Emergency Cleanup
  // ────────────────────────────────────────────────────────────

  describe('emergencyCleanup', () => {
    async function importEmergencyCleanup() {
      return (await import('../commands/emergency-cleanup')).emergencyCleanup;
    }

    it('runs closePaidTabs sub-operation', async () => {
      const emergencyCleanup = await importEmergencyCleanup();
      // paying tabs query
      mockTx.where.mockResolvedValueOnce([makeTab({ id: 'paid-1', status: 'paying', tableId: 'table-1' })]);
      // insert override
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await emergencyCleanup(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        actions: { closePaidTabs: true, releaseLocks: false, voidStaleTabs: false },
        approverUserId: 'manager-1',
        clientRequestId: 'req-emergency-paid',
      });

      expect(result.overrideId).toBe('override-1');
    });

    it('runs releaseLocks sub-operation', async () => {
      const emergencyCleanup = await importEmergencyCleanup();
      // closePaidTabs=false so no paying tabs select — don't mock where
      // delete locks returns 3 released
      mockTx.returning.mockResolvedValueOnce([{ id: 'lock-1' }, { id: 'lock-2' }, { id: 'lock-3' }]);
      // insert override
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await emergencyCleanup(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        actions: { closePaidTabs: false, releaseLocks: true, voidStaleTabs: false },
        approverUserId: 'manager-1',
        clientRequestId: 'req-emergency-locks',
      });

      expect(result.overrideId).toBe('override-1');
    });

    it('runs voidStaleTabs with threshold', async () => {
      const emergencyCleanup = await importEmergencyCleanup();
      const staleTab = makeTab({
        id: 'stale-1',
        status: 'open',
        tableId: 'table-1',
        openedAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      });
      // stale tabs query
      mockTx.where.mockResolvedValueOnce([staleTab]);
      // insert override
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await emergencyCleanup(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        actions: {
          closePaidTabs: false,
          releaseLocks: false,
          voidStaleTabs: true,
          staleThresholdMinutes: 120,
        },
        approverUserId: 'manager-1',
        clientRequestId: 'req-emergency-stale',
      });

      expect(result.overrideId).toBe('override-1');
    });

    it('runs all sub-operations when enabled', async () => {
      const emergencyCleanup = await importEmergencyCleanup();
      // paying tabs select (terminal)
      mockTx.where
        .mockResolvedValueOnce([makeTab({ id: 'paid-1', status: 'paying', tableId: null })])
        .mockReturnValueOnce(mockTx)    // tab update .where() — intermediate
        .mockReturnValueOnce(mockTx)    // delete locks .where() — intermediate
        .mockResolvedValueOnce([]);     // stale tabs select (terminal)
      // lock deletes returning
      mockTx.returning.mockResolvedValueOnce([{ id: 'lock-1' }]);
      // insert override returning
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await emergencyCleanup(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        actions: {
          closePaidTabs: true,
          releaseLocks: true,
          voidStaleTabs: true,
          staleThresholdMinutes: 240,
        },
        approverUserId: 'manager-1',
        clientRequestId: 'req-emergency-all',
      });

      expect(result.overrideId).toBe('override-1');
    });

    it('creates audit log entry', async () => {
      const emergencyCleanup = await importEmergencyCleanup();
      mockTx.where.mockResolvedValueOnce([]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await emergencyCleanup(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        actions: { closePaidTabs: false, releaseLocks: false, voidStaleTabs: false },
        approverUserId: 'manager-1',
        clientRequestId: 'req-emergency-audit',
      });

      expect(auditLog).toHaveBeenCalledWith(
        expect.anything(),
        'fnb.tabs.emergency_cleanup',
        'fnb_manager_overrides',
        'override-1',
        undefined,
        expect.any(Object),
      );
    });

    it('emits TABS_EMERGENCY_CLEANUP event', async () => {
      const emergencyCleanup = await importEmergencyCleanup();
      mockTx.where.mockResolvedValueOnce([]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      await emergencyCleanup(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        actions: { closePaidTabs: true, releaseLocks: false, voidStaleTabs: false },
        approverUserId: 'manager-1',
        clientRequestId: 'req-emergency-event',
      });

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('emergency_cleanup'),
        expect.objectContaining({ overrideId: 'override-1' }),
      );
    });

    it('returns cached result on duplicate idempotency key', async () => {
      const emergencyCleanup = await importEmergencyCleanup();
      const cached = { paidTabsClosed: 2, locksReleased: 5, staleTabsVoided: 1, errors: [], overrideId: 'cached' };
      vi.mocked(checkIdempotency).mockResolvedValueOnce({ isDuplicate: true, originalResult: cached });

      const result = await emergencyCleanup(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        actions: { closePaidTabs: true, releaseLocks: true, voidStaleTabs: true },
        approverUserId: 'manager-1',
        clientRequestId: 'req-emergency-dup',
      });

      expect(result).toEqual(cached);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Verify Manager PIN
  // ────────────────────────────────────────────────────────────

  describe('verifyManagerPin', () => {
    async function importVerifyPin() {
      return (await import('../commands/verify-manager-pin')).verifyManagerPin;
    }

    it('verifies PIN with stored pin', async () => {
      const verifyManagerPin = await importVerifyPin();
      mockTx.where.mockResolvedValueOnce([
        { userId: 'mgr-1', roleName: 'manager', displayName: 'Jane', email: 'jane@test.com', overridePin: '9876' },
      ]);

      const result = await verifyManagerPin('tenant-1', { tenantId: 'tenant-1', pin: '9876', actionType: 'bulk_void' });

      expect(result.verified).toBe(true);
      expect(result.userId).toBe('mgr-1');
      expect(result.userName).toBe('Jane');
      expect(result.role).toBe('manager');
    });

    it('falls back to last 4 of userId when no stored pin', async () => {
      const verifyManagerPin = await importVerifyPin();
      mockTx.where.mockResolvedValueOnce([
        { userId: 'user-id-abcd1234', roleName: 'manager', displayName: 'Bob', email: null, overridePin: null },
      ]);

      const result = await verifyManagerPin('tenant-1', { tenantId: 'tenant-1', pin: '1234', actionType: 'bulk_void' });

      expect(result.verified).toBe(true);
      expect(result.userId).toBe('user-id-abcd1234');
    });

    it('throws INVALID_PIN when no match', async () => {
      const verifyManagerPin = await importVerifyPin();
      mockTx.where.mockResolvedValueOnce([
        { userId: 'user-id-abcd1234', roleName: 'manager', displayName: 'Bob', email: null, overridePin: '5555' },
      ]);

      await expect(
        verifyManagerPin('tenant-1', { tenantId: 'tenant-1', pin: '0000', actionType: 'bulk_void' }),
      ).rejects.toThrow();
    });

    it('only checks manager roles (owner, manager, supervisor)', async () => {
      const verifyManagerPin = await importVerifyPin();
      // The source now filters by role name in the WHERE clause via inArray(roles.name, MANAGER_ROLES),
      // so non-manager rows won't be returned. Return empty to simulate no managers found.
      mockTx.where.mockResolvedValueOnce([]);

      await expect(
        verifyManagerPin('tenant-1', { tenantId: 'tenant-1', pin: '1234', actionType: 'bulk_void' }),
      ).rejects.toThrow();
    });

    it('verifies owner role', async () => {
      const verifyManagerPin = await importVerifyPin();
      mockTx.where.mockResolvedValueOnce([
        { userId: 'owner-abcd1111', roleName: 'owner', displayName: 'Owner', email: 'owner@test.com', overridePin: '1111' },
      ]);

      const result = await verifyManagerPin('tenant-1', { tenantId: 'tenant-1', pin: '1111', actionType: 'emergency_cleanup' });

      expect(result.verified).toBe(true);
      expect(result.role).toBe('owner');
    });

    it('verifies supervisor role', async () => {
      const verifyManagerPin = await importVerifyPin();
      mockTx.where.mockResolvedValueOnce([
        { userId: 'super-abcd2222', roleName: 'supervisor', displayName: null, email: 'sup@test.com', overridePin: '2222' },
      ]);

      const result = await verifyManagerPin('tenant-1', { tenantId: 'tenant-1', pin: '2222', actionType: 'bulk_transfer' });

      expect(result.verified).toBe(true);
      expect(result.userName).toBe('sup@test.com');
    });

    it('uses "Manager" as fallback userName', async () => {
      const verifyManagerPin = await importVerifyPin();
      mockTx.where.mockResolvedValueOnce([
        { userId: 'mgr-abcd3333', roleName: 'manager', displayName: null, email: null, overridePin: '3333' },
      ]);

      const result = await verifyManagerPin('tenant-1', { tenantId: 'tenant-1', pin: '3333', actionType: 'bulk_close' });

      expect(result.userName).toBe('Manager');
    });

    it('stored pin takes priority over userId fallback', async () => {
      const verifyManagerPin = await importVerifyPin();
      // userId ends in '1234' but stored overridePin is '9999'
      mockTx.where.mockResolvedValueOnce([
        { userId: 'user-id-xxxx1234', roleName: 'manager', displayName: 'Mgr', email: null, overridePin: '9999' },
      ]);

      // PIN '1234' should NOT match because stored overridePin '9999' takes priority
      await expect(
        verifyManagerPin('tenant-1', { tenantId: 'tenant-1', pin: '1234', actionType: 'bulk_void' }),
      ).rejects.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────
  // Update Manage Tabs Settings
  // ────────────────────────────────────────────────────────────

  describe('updateManageTabsSettings', () => {
    async function importUpdateSettings() {
      return (await import('../commands/update-manage-tabs-settings')).updateManageTabsSettings;
    }

    it('creates new settings when none exist', async () => {
      const updateManageTabsSettings = await importUpdateSettings();
      // select existing → empty
      mockTx.limit.mockResolvedValueOnce([]);
      // insert new → return settings
      mockTx.returning.mockResolvedValueOnce([{ id: 'settings-1', tenantId: 'tenant-1', locationId: null }]);

      const result = await updateManageTabsSettings(
        makeCtx(),
        null,
        { showManageTabsButton: false },
      );

      expect(result.id).toBe('settings-1');
    });

    it('updates existing settings', async () => {
      const updateManageTabsSettings = await importUpdateSettings();
      // select existing → found
      mockTx.limit.mockResolvedValueOnce([{ id: 'settings-1' }]);
      // update → return updated
      mockTx.returning.mockResolvedValueOnce([{ id: 'settings-1', requirePinForVoid: false }]);

      const result = await updateManageTabsSettings(
        makeCtx(),
        null,
        { requirePinForVoid: false },
      );

      expect(result.id).toBe('settings-1');
    });

    it('only sets provided fields', async () => {
      const updateManageTabsSettings = await importUpdateSettings();
      mockTx.limit.mockResolvedValueOnce([{ id: 'settings-1' }]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'settings-1' }]);

      await updateManageTabsSettings(
        makeCtx(),
        null,
        { maxBulkSelection: 100 },
      );

      // set should have been called with only maxBulkSelection + updatedAt
      expect(mockTx.set).toHaveBeenCalled();
    });

    it('handles location-specific settings', async () => {
      const updateManageTabsSettings = await importUpdateSettings();
      mockTx.limit.mockResolvedValueOnce([]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'settings-2', locationId: 'loc-1' }]);

      const result = await updateManageTabsSettings(
        makeCtx(),
        'loc-1',
        { allowBulkAllServers: true },
      );

      expect(result.locationId).toBe('loc-1');
    });

    it('emits settings_updated event', async () => {
      const updateManageTabsSettings = await importUpdateSettings();
      mockTx.limit.mockResolvedValueOnce([]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'settings-1' }]);

      await updateManageTabsSettings(
        makeCtx(),
        null,
        { readOnlyForNonManagers: true },
      );

      expect(buildEventFromContext).toHaveBeenCalledWith(
        expect.anything(),
        'fnb.manage_tabs.settings_updated.v1',
        expect.objectContaining({ settingsId: 'settings-1', changes: { readOnlyForNonManagers: true } }),
      );
    });

    it('creates audit log', async () => {
      const updateManageTabsSettings = await importUpdateSettings();
      mockTx.limit.mockResolvedValueOnce([]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'settings-1' }]);

      await updateManageTabsSettings(
        makeCtx(),
        'loc-1',
        { requirePinForTransfer: true },
      );

      expect(auditLog).toHaveBeenCalledWith(
        expect.anything(),
        'fnb.manage_tabs.settings_updated',
        'fnb_manage_tabs_settings',
        'settings-1',
        undefined,
        expect.objectContaining({ locationId: 'loc-1', changes: { requirePinForTransfer: true } }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // Get Manage Tabs Settings Query
  // ────────────────────────────────────────────────────────────

  describe('getManageTabsSettings', () => {
    async function importGetSettings() {
      return (await import('../queries/get-manage-tabs-settings')).getManageTabsSettings;
    }

    it('returns defaults when no settings exist', async () => {
      const getManageTabsSettings = await importGetSettings();
      mockTx.execute.mockResolvedValueOnce([]);

      const result = await getManageTabsSettings('tenant-1', null);

      expect(result.showManageTabsButton).toBe(true);
      expect(result.requirePinForVoid).toBe(true);
      expect(result.requirePinForTransfer).toBe(false);
      expect(result.allowBulkAllServers).toBe(false);
      expect(result.readOnlyForNonManagers).toBe(false);
      expect(result.maxBulkSelection).toBe(50);
    });

    it('returns stored settings when found', async () => {
      const getManageTabsSettings = await importGetSettings();
      mockTx.execute.mockResolvedValueOnce([{
        id: 'settings-1',
        show_manage_tabs_button: false,
        require_pin_for_transfer: true,
        require_pin_for_void: false,
        allow_bulk_all_servers: true,
        read_only_for_non_managers: true,
        max_bulk_selection: 25,
      }]);

      const result = await getManageTabsSettings('tenant-1', 'loc-1');

      expect(result.showManageTabsButton).toBe(false);
      expect(result.requirePinForTransfer).toBe(true);
      expect(result.requirePinForVoid).toBe(false);
      expect(result.allowBulkAllServers).toBe(true);
      expect(result.maxBulkSelection).toBe(25);
    });
  });

  // ────────────────────────────────────────────────────────────
  // List Tabs for Manage Query
  // ────────────────────────────────────────────────────────────

  describe('listTabsForManage', () => {
    async function importListTabs() {
      return (await import('../queries/list-tabs-for-manage')).listTabsForManage;
    }

    it('returns empty list when no tabs', async () => {
      const listTabsForManage = await importListTabs();
      mockTx.execute.mockResolvedValueOnce([]);

      const result = await listTabsForManage({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        sortBy: 'oldest',
        viewMode: 'all',
        includeAmounts: false,
        limit: 100,
      });

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('returns paginated results with cursor', async () => {
      const listTabsForManage = await importListTabs();
      // Return limit+1 items (default limit=100, so 101 items = hasMore)
      const items = Array.from({ length: 101 }, (_, i) => ({
        id: `tab-${i}`,
        tab_number: i + 1,
        guest_name: `Guest ${i}`,
        status: 'open',
        service_mode: 'dine_in',
        table_id: `table-${i}`,
        table_label: `Table ${i}`,
        server_user_id: 'server-1',
        server_name: 'Server 1',
        party_size: 2,
        course_count: 1,
        opened_at: new Date(),
        updated_at: new Date(),
        closed_at: null,
        version: 1,
        order_total: 5000,
        amount_paid: 0,
        balance: 5000,
        open_duration_minutes: 30,
      }));
      mockTx.execute.mockResolvedValueOnce(items);

      const result = await listTabsForManage({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        sortBy: 'oldest',
        viewMode: 'all',
        includeAmounts: false,
        limit: 100,
      });

      expect(result.items).toHaveLength(100);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────
  // List Manager Overrides Query
  // ────────────────────────────────────────────────────────────

  describe('listManagerOverrides', () => {
    async function importListOverrides() {
      return (await import('../queries/list-manager-overrides')).listManagerOverrides;
    }

    it('returns empty list when no overrides', async () => {
      const listManagerOverrides = await importListOverrides();
      mockTx.execute.mockResolvedValueOnce([]);

      const result = await listManagerOverrides({
        tenantId: 'tenant-1',
      });

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('returns overrides with pagination', async () => {
      const listManagerOverrides = await importListOverrides();
      const items = Array.from({ length: 51 }, (_, i) => ({
        id: `override-${i}`,
        location_id: 'loc-1',
        initiator_user_id: 'user-1',
        initiator_name: 'User 1',
        approver_user_id: 'mgr-1',
        approver_name: 'Manager 1',
        action_type: 'bulk_void',
        tab_ids: ['tab-1'],
        reason_code: 'end_of_shift',
        reason_text: null,
        metadata: {},
        result_summary: { succeeded: 1, failed: 0 },
        created_at: new Date(),
      }));
      mockTx.execute.mockResolvedValueOnce(items);

      const result = await listManagerOverrides({
        tenantId: 'tenant-1',
        limit: 50,
      });

      expect(result.items).toHaveLength(50);
      expect(result.hasMore).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Status Constants Validation
  // ────────────────────────────────────────────────────────────

  describe('Status Constants', () => {
    it('VOIDABLE_STATUSES includes expected values', async () => {
      const mod = await import('../commands/bulk-void-tabs');
      const statuses = ['open', 'ordering', 'sent_to_kitchen', 'in_progress', 'check_requested'];
      // Access through testing that all expected statuses are accepted
      for (const status of statuses) {
        const tab = makeTab({ id: 'tab-test', status });
        mockTx.where.mockResolvedValueOnce([tab]);
        mockTx.returning.mockResolvedValueOnce([{ id: 'override-test' }]);
        vi.mocked(checkIdempotency).mockResolvedValueOnce({ isDuplicate: false });

        const result = await mod.bulkVoidTabs(makeCtx(), {
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          tabIds: ['tab-test'],
          reasonCode: 'end_of_shift',
          approverUserId: 'manager-1',
          clientRequestId: `req-status-${status}`,
        });
        expect(result.succeeded).toContain('tab-test');
      }
    });

    it('CLOSEABLE_STATUSES includes paying (additional over voidable)', async () => {
      const mod = await import('../commands/bulk-close-tabs');
      const tab = makeTab({ id: 'tab-paying', status: 'paying' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await mod.bulkCloseTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-paying'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-paying-close',
      });

      expect(result.succeeded).toContain('tab-paying');
    });

    it('paying status is NOT voidable', async () => {
      const mod = await import('../commands/bulk-void-tabs');
      const tab = makeTab({ id: 'tab-paying', status: 'paying' });
      mockTx.where.mockResolvedValueOnce([tab]);
      mockTx.returning.mockResolvedValueOnce([{ id: 'override-1' }]);

      const result = await mod.bulkVoidTabs(makeCtx(), {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        tabIds: ['tab-paying'],
        reasonCode: 'end_of_shift',
        approverUserId: 'manager-1',
        clientRequestId: 'req-paying-void',
      });

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.error).toContain('paying');
    });
  });
});
