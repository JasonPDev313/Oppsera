import type { BusinessTier } from '@oppsera/shared';

/**
 * Workflows that MUST always run regardless of tier or visibility.
 * These ensure data integrity even when the UI hides them.
 */
export const SMB_PROTECTED_WORKFLOWS = [
  'accounting.journal_posting',
  'accounting.period_close',
  'inventory.costing',
  'payments.settlement_matching',
  'ar.credit_hold',
] as const;

export function isProtectedWorkflow(moduleKey: string, workflowKey: string): boolean {
  const key = `${moduleKey}.${workflowKey}`;
  return (SMB_PROTECTED_WORKFLOWS as readonly string[]).includes(key);
}

export interface WorkflowOverrideValidation {
  valid: boolean;
  warnings: string[];
}

/**
 * Validates a workflow config override.
 * Prevents SMB tenants from disabling protected workflows.
 */
export function validateWorkflowOverride(
  tier: BusinessTier,
  moduleKey: string,
  workflowKey: string,
  newConfig: Partial<{ autoMode: boolean; approvalRequired: boolean; userVisible: boolean }>,
): WorkflowOverrideValidation {
  const warnings: string[] = [];

  if (isProtectedWorkflow(moduleKey, workflowKey)) {
    // Protected workflows cannot have auto mode disabled for SMB
    if (tier === 'SMB' && newConfig.autoMode === false) {
      return {
        valid: false,
        warnings: [`${moduleKey}.${workflowKey} is a protected workflow and cannot be set to manual mode for SMB tenants.`],
      };
    }
  }

  // Warn on potentially risky changes
  if (tier === 'SMB' && newConfig.approvalRequired === true) {
    warnings.push(`Enabling approval workflows for SMB tenants may create friction. Consider upgrading to MID_MARKET tier.`);
  }

  if (tier === 'ENTERPRISE' && newConfig.autoMode === true && newConfig.userVisible === false) {
    warnings.push(`Setting an Enterprise workflow to auto+invisible reduces audit visibility.`);
  }

  return { valid: true, warnings };
}
