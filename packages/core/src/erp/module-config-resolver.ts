import { getWorkflowConfig, getAllWorkflowConfigs } from './workflow-engine';

/**
 * Convenience wrappers for modules to check workflow behaviour.
 * Modules call these — they never import the workflow engine directly.
 */

export async function isWorkflowVisible(
  tenantId: string,
  moduleKey: string,
  workflowKey: string,
): Promise<boolean> {
  const cfg = await getWorkflowConfig(tenantId, moduleKey, workflowKey);
  return cfg.userVisible;
}

export async function isWorkflowAutomatic(
  tenantId: string,
  moduleKey: string,
  workflowKey: string,
): Promise<boolean> {
  const cfg = await getWorkflowConfig(tenantId, moduleKey, workflowKey);
  return cfg.autoMode;
}

export async function requiresApproval(
  tenantId: string,
  moduleKey: string,
  workflowKey: string,
): Promise<boolean> {
  const cfg = await getWorkflowConfig(tenantId, moduleKey, workflowKey);
  return cfg.approvalRequired;
}

/**
 * Returns the effective journal posting mode for accounting.
 * SMB → 'auto_post', ENTERPRISE → 'draft_only'.
 */
export async function getEffectiveAccountingMode(
  tenantId: string,
): Promise<'auto_post' | 'draft_only'> {
  const cfg = await getWorkflowConfig(tenantId, 'accounting', 'journal_posting');
  return cfg.autoMode ? 'auto_post' : 'draft_only';
}

export interface NavItem {
  name: string;
  href: string;
  workflowModuleKey?: string;
  workflowKey?: string;
  [key: string]: unknown;
}

/**
 * Filters navigation items based on workflow visibility.
 * Items without workflowModuleKey are always included.
 * Items with workflowModuleKey are only included if that workflow is userVisible.
 */
export async function getEffectiveNavItems(
  tenantId: string,
  allNavItems: NavItem[],
): Promise<NavItem[]> {
  const configs = await getAllWorkflowConfigs(tenantId);
  return allNavItems.filter((item) => {
    if (!item.workflowModuleKey || !item.workflowKey) return true;
    const key = `${item.workflowModuleKey}.${item.workflowKey}`;
    const cfg = configs[key];
    return cfg ? cfg.userVisible : false;
  });
}
