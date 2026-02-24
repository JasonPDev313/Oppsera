import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────

const { mockGetWorkflowConfig, mockGetAllWorkflowConfigs } = vi.hoisted(() => ({
  mockGetWorkflowConfig: vi.fn(),
  mockGetAllWorkflowConfigs: vi.fn(),
}));

vi.mock('../workflow-engine', () => ({
  getWorkflowConfig: mockGetWorkflowConfig,
  getAllWorkflowConfigs: mockGetAllWorkflowConfigs,
}));

import {
  isWorkflowVisible,
  isWorkflowAutomatic,
  requiresApproval,
  getEffectiveAccountingMode,
  getEffectiveNavItems,
} from '../module-config-resolver';
import type { NavItem } from '../module-config-resolver';

describe('module-config-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isWorkflowVisible', () => {
    it('returns true when userVisible is true', async () => {
      mockGetWorkflowConfig.mockResolvedValue({
        autoMode: true,
        approvalRequired: false,
        userVisible: true,
        customSettings: {},
      });

      const result = await isWorkflowVisible('tnt_01', 'accounting', 'journal_posting');
      expect(result).toBe(true);
    });

    it('returns false when userVisible is false', async () => {
      mockGetWorkflowConfig.mockResolvedValue({
        autoMode: true,
        approvalRequired: false,
        userVisible: false,
        customSettings: {},
      });

      const result = await isWorkflowVisible('tnt_01', 'accounting', 'journal_posting');
      expect(result).toBe(false);
    });
  });

  describe('isWorkflowAutomatic', () => {
    it('returns true when autoMode is true', async () => {
      mockGetWorkflowConfig.mockResolvedValue({
        autoMode: true,
        approvalRequired: false,
        userVisible: false,
        customSettings: {},
      });

      const result = await isWorkflowAutomatic('tnt_01', 'accounting', 'journal_posting');
      expect(result).toBe(true);
    });

    it('returns false when autoMode is false', async () => {
      mockGetWorkflowConfig.mockResolvedValue({
        autoMode: false,
        approvalRequired: true,
        userVisible: true,
        customSettings: {},
      });

      const result = await isWorkflowAutomatic('tnt_01', 'accounting', 'journal_posting');
      expect(result).toBe(false);
    });
  });

  describe('requiresApproval', () => {
    it('returns true when approvalRequired is true', async () => {
      mockGetWorkflowConfig.mockResolvedValue({
        autoMode: false,
        approvalRequired: true,
        userVisible: true,
        customSettings: {},
      });

      const result = await requiresApproval('tnt_01', 'accounting', 'journal_posting');
      expect(result).toBe(true);
    });

    it('returns false when approvalRequired is false', async () => {
      mockGetWorkflowConfig.mockResolvedValue({
        autoMode: true,
        approvalRequired: false,
        userVisible: false,
        customSettings: {},
      });

      const result = await requiresApproval('tnt_01', 'accounting', 'journal_posting');
      expect(result).toBe(false);
    });
  });

  describe('getEffectiveAccountingMode', () => {
    it('returns auto_post when autoMode is true (SMB)', async () => {
      mockGetWorkflowConfig.mockResolvedValue({
        autoMode: true,
        approvalRequired: false,
        userVisible: false,
        customSettings: {},
      });

      const mode = await getEffectiveAccountingMode('tnt_smb');
      expect(mode).toBe('auto_post');
      expect(mockGetWorkflowConfig).toHaveBeenCalledWith('tnt_smb', 'accounting', 'journal_posting');
    });

    it('returns draft_only when autoMode is false (ENTERPRISE)', async () => {
      mockGetWorkflowConfig.mockResolvedValue({
        autoMode: false,
        approvalRequired: true,
        userVisible: true,
        customSettings: {},
      });

      const mode = await getEffectiveAccountingMode('tnt_ent');
      expect(mode).toBe('draft_only');
    });
  });

  describe('getEffectiveNavItems', () => {
    const navItems: NavItem[] = [
      { name: 'Dashboard', href: '/dashboard' },
      { name: 'Accounting', href: '/accounting', workflowModuleKey: 'accounting', workflowKey: 'journal_posting' },
      { name: 'Banking', href: '/accounting/banking', workflowModuleKey: 'accounting', workflowKey: 'bank_reconciliation' },
      { name: 'Settings', href: '/settings' },
    ];

    it('preserves items without workflowModuleKey', async () => {
      mockGetAllWorkflowConfigs.mockResolvedValue({
        'accounting.journal_posting': { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} },
        'accounting.bank_reconciliation': { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} },
      });

      const filtered = await getEffectiveNavItems('tnt_smb', navItems);
      const names = filtered.map((i) => i.name);
      expect(names).toContain('Dashboard');
      expect(names).toContain('Settings');
    });

    it('hides items when workflow is not visible (SMB)', async () => {
      mockGetAllWorkflowConfigs.mockResolvedValue({
        'accounting.journal_posting': { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} },
        'accounting.bank_reconciliation': { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} },
      });

      const filtered = await getEffectiveNavItems('tnt_smb', navItems);
      const names = filtered.map((i) => i.name);
      expect(names).not.toContain('Accounting');
      expect(names).not.toContain('Banking');
    });

    it('shows items when workflow is visible (ENTERPRISE)', async () => {
      mockGetAllWorkflowConfigs.mockResolvedValue({
        'accounting.journal_posting': { autoMode: false, approvalRequired: true, userVisible: true, customSettings: {} },
        'accounting.bank_reconciliation': { autoMode: false, approvalRequired: false, userVisible: true, customSettings: {} },
      });

      const filtered = await getEffectiveNavItems('tnt_ent', navItems);
      const names = filtered.map((i) => i.name);
      expect(names).toContain('Accounting');
      expect(names).toContain('Banking');
    });

    it('hides items when config key is missing (defaults to not visible)', async () => {
      mockGetAllWorkflowConfigs.mockResolvedValue({});

      const filtered = await getEffectiveNavItems('tnt_test', navItems);
      const names = filtered.map((i) => i.name);
      expect(names).not.toContain('Accounting');
      expect(names).not.toContain('Banking');
      // Items without workflowModuleKey always show
      expect(names).toContain('Dashboard');
      expect(names).toContain('Settings');
    });

    it('handles mixed visibility', async () => {
      mockGetAllWorkflowConfigs.mockResolvedValue({
        'accounting.journal_posting': { autoMode: true, approvalRequired: false, userVisible: true, customSettings: {} },
        'accounting.bank_reconciliation': { autoMode: true, approvalRequired: false, userVisible: false, customSettings: {} },
      });

      const filtered = await getEffectiveNavItems('tnt_mid', navItems);
      const names = filtered.map((i) => i.name);
      expect(names).toContain('Accounting');
      expect(names).not.toContain('Banking');
    });

    it('returns all items when all workflows are visible', async () => {
      mockGetAllWorkflowConfigs.mockResolvedValue({
        'accounting.journal_posting': { autoMode: false, approvalRequired: true, userVisible: true, customSettings: {} },
        'accounting.bank_reconciliation': { autoMode: false, approvalRequired: false, userVisible: true, customSettings: {} },
      });

      const filtered = await getEffectiveNavItems('tnt_ent', navItems);
      expect(filtered).toHaveLength(4);
    });
  });
});
