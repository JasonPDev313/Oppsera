import type { NavItem, SubNavItem } from './navigation';
import type { WorkflowConfig } from '@/hooks/use-erp-config';

/**
 * Filters navigation items based on ERP workflow visibility configs.
 *
 * Items with `workflowModuleKey` + `workflowKey` are hidden when
 * the corresponding workflow config has `userVisible === false`.
 *
 * This is a second-pass filter applied AFTER module-key entitlement gating.
 */
export function filterNavByTier(
  navItems: NavItem[],
  workflowConfigs: Record<string, WorkflowConfig>,
): NavItem[] {
  return navItems
    .map((item) => {
      // Check the parent's own workflow visibility first
      if (isWorkflowHidden(item, workflowConfigs)) return null;

      if (!item.children) return item;

      // Filter children
      const filteredChildren = item.children.filter(
        (child) => !isWorkflowHidden(child, workflowConfigs),
      );

      // If all children are hidden, hide the parent too
      if (filteredChildren.length === 0) return null;

      return { ...item, children: filteredChildren };
    })
    .filter(Boolean) as NavItem[];
}

function isWorkflowHidden(
  item: NavItem | SubNavItem,
  configs: Record<string, WorkflowConfig>,
): boolean {
  const wfItem = item as NavItem & { workflowModuleKey?: string; workflowKey?: string };
  if (!wfItem.workflowModuleKey || !wfItem.workflowKey) return false;

  const key = `${wfItem.workflowModuleKey}.${wfItem.workflowKey}`;
  const config = configs[key];

  // If no explicit config exists, the item is visible by default
  if (!config) return false;

  return !config.userVisible;
}
