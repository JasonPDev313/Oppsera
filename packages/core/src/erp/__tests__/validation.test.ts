import { describe, it, expect } from 'vitest';
import {
  updateWorkflowConfigSchema,
  changeTierSchema,
  evaluateTierSchema,
  runCloseOrchestratorSchema,
  validateTierTransition,
} from '../validation';

describe('validateTierTransition', () => {
  it('SMB → MID_MARKET is allowed with no warnings', () => {
    const result = validateTierTransition('SMB', 'MID_MARKET');
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('SMB → ENTERPRISE is allowed with no warnings', () => {
    const result = validateTierTransition('SMB', 'ENTERPRISE');
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('MID_MARKET → ENTERPRISE is allowed with no warnings', () => {
    const result = validateTierTransition('MID_MARKET', 'ENTERPRISE');
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('ENTERPRISE → SMB warns about lost visibility', () => {
    const result = validateTierTransition('ENTERPRISE', 'SMB');
    expect(result.allowed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Downgrading from Enterprise');
    expect(result.warnings[0]).toContain('automatic mode');
  });

  it('ENTERPRISE → MID_MARKET warns about downgrade', () => {
    const result = validateTierTransition('ENTERPRISE', 'MID_MARKET');
    expect(result.allowed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Enterprise');
  });

  it('MID_MARKET → SMB warns about hidden nav items', () => {
    const result = validateTierTransition('MID_MARKET', 'SMB');
    expect(result.allowed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('SMB');
  });

  it('same tier returns no change', () => {
    const result = validateTierTransition('SMB', 'SMB');
    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.dataPreservation).toBe('No change');
  });

  it('all transitions preserve data', () => {
    const result = validateTierTransition('ENTERPRISE', 'SMB');
    expect(result.dataPreservation).toContain('preserved');
  });
});

describe('changeTierSchema', () => {
  it('validates correct input', () => {
    const result = changeTierSchema.safeParse({
      newTier: 'MID_MARKET',
      reason: 'Business growth',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing reason', () => {
    const result = changeTierSchema.safeParse({
      newTier: 'MID_MARKET',
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid tier value', () => {
    const result = changeTierSchema.safeParse({
      newTier: 'MEGA',
      reason: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all three valid tiers', () => {
    for (const tier of ['SMB', 'MID_MARKET', 'ENTERPRISE']) {
      const result = changeTierSchema.safeParse({ newTier: tier, reason: 'test' });
      expect(result.success).toBe(true);
    }
  });
});

describe('updateWorkflowConfigSchema', () => {
  it('validates required fields', () => {
    const result = updateWorkflowConfigSchema.safeParse({
      moduleKey: 'accounting',
      workflowKey: 'journal_posting',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty moduleKey', () => {
    const result = updateWorkflowConfigSchema.safeParse({
      moduleKey: '',
      workflowKey: 'journal_posting',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty workflowKey', () => {
    const result = updateWorkflowConfigSchema.safeParse({
      moduleKey: 'accounting',
      workflowKey: '',
    });
    expect(result.success).toBe(false);
  });

  it('validates boolean fields', () => {
    const result = updateWorkflowConfigSchema.safeParse({
      moduleKey: 'accounting',
      workflowKey: 'journal_posting',
      autoMode: true,
      approvalRequired: false,
      userVisible: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoMode).toBe(true);
      expect(result.data.approvalRequired).toBe(false);
      expect(result.data.userVisible).toBe(true);
    }
  });

  it('allows optional boolean fields', () => {
    const result = updateWorkflowConfigSchema.safeParse({
      moduleKey: 'accounting',
      workflowKey: 'journal_posting',
      autoMode: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approvalRequired).toBeUndefined();
      expect(result.data.userVisible).toBeUndefined();
    }
  });

  it('accepts customSettings as record', () => {
    const result = updateWorkflowConfigSchema.safeParse({
      moduleKey: 'accounting',
      workflowKey: 'journal_posting',
      customSettings: { threshold: 1000 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional reason', () => {
    const result = updateWorkflowConfigSchema.safeParse({
      moduleKey: 'accounting',
      workflowKey: 'journal_posting',
      reason: 'Policy update',
    });
    expect(result.success).toBe(true);
  });
});

describe('evaluateTierSchema', () => {
  it('defaults apply to false', () => {
    const result = evaluateTierSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apply).toBe(false);
    }
  });

  it('accepts apply as true', () => {
    const result = evaluateTierSchema.safeParse({ apply: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apply).toBe(true);
    }
  });
});

describe('runCloseOrchestratorSchema', () => {
  it('validates correct date format', () => {
    const result = runCloseOrchestratorSchema.safeParse({
      businessDate: '2026-02-24',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const result = runCloseOrchestratorSchema.safeParse({
      businessDate: '02-24-2026',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-date string', () => {
    const result = runCloseOrchestratorSchema.safeParse({
      businessDate: 'yesterday',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional locationId', () => {
    const result = runCloseOrchestratorSchema.safeParse({
      businessDate: '2026-02-24',
      locationId: 'loc_01',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locationId).toBe('loc_01');
    }
  });

  it('allows missing locationId', () => {
    const result = runCloseOrchestratorSchema.safeParse({
      businessDate: '2026-02-24',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locationId).toBeUndefined();
    }
  });
});
