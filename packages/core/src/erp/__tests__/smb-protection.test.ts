import { describe, it, expect } from 'vitest';
import {
  SMB_PROTECTED_WORKFLOWS,
  isProtectedWorkflow,
  validateWorkflowOverride,
} from '../smb-protection';

describe('SMB_PROTECTED_WORKFLOWS', () => {
  it('contains exactly 5 protected workflows', () => {
    expect(SMB_PROTECTED_WORKFLOWS).toHaveLength(5);
  });

  it('includes accounting.journal_posting', () => {
    expect(SMB_PROTECTED_WORKFLOWS).toContain('accounting.journal_posting');
  });

  it('includes accounting.period_close', () => {
    expect(SMB_PROTECTED_WORKFLOWS).toContain('accounting.period_close');
  });

  it('includes inventory.costing', () => {
    expect(SMB_PROTECTED_WORKFLOWS).toContain('inventory.costing');
  });

  it('includes payments.settlement_matching', () => {
    expect(SMB_PROTECTED_WORKFLOWS).toContain('payments.settlement_matching');
  });

  it('includes ar.credit_hold', () => {
    expect(SMB_PROTECTED_WORKFLOWS).toContain('ar.credit_hold');
  });
});

describe('isProtectedWorkflow', () => {
  it('returns true for accounting.journal_posting', () => {
    expect(isProtectedWorkflow('accounting', 'journal_posting')).toBe(true);
  });

  it('returns true for accounting.period_close', () => {
    expect(isProtectedWorkflow('accounting', 'period_close')).toBe(true);
  });

  it('returns true for inventory.costing', () => {
    expect(isProtectedWorkflow('inventory', 'costing')).toBe(true);
  });

  it('returns true for payments.settlement_matching', () => {
    expect(isProtectedWorkflow('payments', 'settlement_matching')).toBe(true);
  });

  it('returns true for ar.credit_hold', () => {
    expect(isProtectedWorkflow('ar', 'credit_hold')).toBe(true);
  });

  it('returns false for non-protected workflow', () => {
    expect(isProtectedWorkflow('accounting', 'depreciation')).toBe(false);
  });

  it('returns false for ap.bill_approval', () => {
    expect(isProtectedWorkflow('ap', 'bill_approval')).toBe(false);
  });

  it('returns false for unknown workflow', () => {
    expect(isProtectedWorkflow('unknown', 'module')).toBe(false);
  });
});

describe('validateWorkflowOverride', () => {
  describe('SMB tier', () => {
    it('rejects disabling auto mode on protected workflow', () => {
      const result = validateWorkflowOverride('SMB', 'accounting', 'journal_posting', {
        autoMode: false,
      });
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('protected workflow');
      expect(result.warnings[0]).toContain('manual mode');
    });

    it('rejects disabling auto mode on inventory.costing', () => {
      const result = validateWorkflowOverride('SMB', 'inventory', 'costing', {
        autoMode: false,
      });
      expect(result.valid).toBe(false);
    });

    it('rejects disabling auto mode on ar.credit_hold', () => {
      const result = validateWorkflowOverride('SMB', 'ar', 'credit_hold', {
        autoMode: false,
      });
      expect(result.valid).toBe(false);
    });

    it('allows disabling auto mode on non-protected workflow', () => {
      const result = validateWorkflowOverride('SMB', 'accounting', 'depreciation', {
        autoMode: false,
      });
      expect(result.valid).toBe(true);
    });

    it('allows changing visibility on protected workflow', () => {
      const result = validateWorkflowOverride('SMB', 'accounting', 'journal_posting', {
        userVisible: true,
      });
      expect(result.valid).toBe(true);
    });

    it('warns when enabling approval for SMB', () => {
      const result = validateWorkflowOverride('SMB', 'accounting', 'depreciation', {
        approvalRequired: true,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('friction');
      expect(result.warnings[0]).toContain('MID_MARKET');
    });

    it('allows setting auto mode true on protected workflow', () => {
      const result = validateWorkflowOverride('SMB', 'accounting', 'journal_posting', {
        autoMode: true,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('MID_MARKET tier', () => {
    it('allows disabling auto mode on any workflow', () => {
      const result = validateWorkflowOverride('MID_MARKET', 'accounting', 'journal_posting', {
        autoMode: false,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('allows enabling approval on any workflow', () => {
      const result = validateWorkflowOverride('MID_MARKET', 'accounting', 'journal_posting', {
        approvalRequired: true,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('ENTERPRISE tier', () => {
    it('allows disabling auto mode on any workflow', () => {
      const result = validateWorkflowOverride('ENTERPRISE', 'accounting', 'journal_posting', {
        autoMode: false,
      });
      expect(result.valid).toBe(true);
    });

    it('warns when setting auto+invisible on enterprise workflow', () => {
      const result = validateWorkflowOverride('ENTERPRISE', 'accounting', 'journal_posting', {
        autoMode: true,
        userVisible: false,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('audit visibility');
    });

    it('no warning for auto+visible on enterprise workflow', () => {
      const result = validateWorkflowOverride('ENTERPRISE', 'accounting', 'journal_posting', {
        autoMode: true,
        userVisible: true,
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
