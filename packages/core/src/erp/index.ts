// ── ERP Dual-Mode Architecture ──────────────────────────────────
// Modules read their config via this thin public interface.
// They never import the tier engine or workflow engine directly.

// Tier classification (pure functions)
export { classifyTenant } from './tier-classifier';
export type { TenantMetrics } from './tier-classifier';

// Workflow config engine (read/write + cache)
export {
  getWorkflowConfig,
  getModuleWorkflowConfigs,
  getAllWorkflowConfigs,
  setWorkflowConfig,
  invalidateWorkflowCache,
} from './workflow-engine';
export type { WorkflowConfig } from './workflow-engine';

// Convenience resolvers for modules
export {
  isWorkflowVisible,
  isWorkflowAutomatic,
  requiresApproval,
  getEffectiveAccountingMode,
  getEffectiveNavItems,
} from './module-config-resolver';
export type { NavItem } from './module-config-resolver';

// SMB protection
export {
  SMB_PROTECTED_WORKFLOWS,
  isProtectedWorkflow,
  validateWorkflowOverride,
} from './smb-protection';
export type { WorkflowOverrideValidation } from './smb-protection';

// Tier change operations
export { applyTierChange } from './tier-change';

// Validation schemas
export {
  updateWorkflowConfigSchema,
  changeTierSchema,
  evaluateTierSchema,
  runCloseOrchestratorSchema,
  validateTierTransition,
} from './validation';
export type { TierTransitionResult } from './validation';
