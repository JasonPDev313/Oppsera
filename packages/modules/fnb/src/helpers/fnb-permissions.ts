/**
 * F&B POS Permission Definitions
 *
 * All F&B-specific permissions for RBAC.
 * These extend the base system roles (Owner, Manager, Supervisor, Cashier, Server, Staff)
 * with restaurant-specific permissions.
 */

export interface FnbPermission {
  key: string;
  description: string;
  category: string;
}

export const FNB_PERMISSIONS: FnbPermission[] = [
  // Floor Plan
  { key: 'pos_fnb.floor_plan.view', description: 'View floor plan and table status', category: 'floor_plan' },
  { key: 'pos_fnb.floor_plan.manage', description: 'Edit table assignments and combine/split tables', category: 'floor_plan' },

  // Tabs
  { key: 'pos_fnb.tabs.view', description: 'View open tabs', category: 'tabs' },
  { key: 'pos_fnb.tabs.create', description: 'Open new tabs', category: 'tabs' },
  { key: 'pos_fnb.tabs.transfer', description: 'Transfer tabs between servers', category: 'tabs' },
  { key: 'pos_fnb.tabs.void', description: 'Void tabs (requires reason)', category: 'tabs' },

  // Payments
  { key: 'pos_fnb.payments.create', description: 'Process payments and tenders', category: 'payments' },
  { key: 'pos_fnb.payments.split', description: 'Split checks', category: 'payments' },
  { key: 'pos_fnb.payments.refund', description: 'Process refunds', category: 'payments' },
  { key: 'pos_fnb.payments.void', description: 'Void payments', category: 'payments' },

  // Tips
  { key: 'pos_fnb.tips.adjust', description: 'Adjust tip amounts', category: 'tips' },
  { key: 'pos_fnb.tips.finalize', description: 'Finalize tips for batch', category: 'tips' },
  { key: 'pos_fnb.tips.pool_manage', description: 'Manage tip pools', category: 'tips' },

  // Menu
  { key: 'pos_fnb.menu.manage', description: '86/restore menu items', category: 'menu' },
  { key: 'pos_fnb.menu.comp', description: 'Comp items (requires reason)', category: 'menu' },
  { key: 'pos_fnb.menu.discount', description: 'Apply discounts', category: 'menu' },
  { key: 'pos_fnb.menu.price_override', description: 'Override item prices', category: 'menu' },

  // Close Batch
  { key: 'pos_fnb.close_batch.manage', description: 'Start and post close batches', category: 'close_batch' },
  { key: 'pos_fnb.close_batch.cash_count', description: 'Enter cash counts', category: 'close_batch' },

  // Reporting
  { key: 'pos_fnb.reports.view', description: 'View F&B reports and dashboards', category: 'reports' },
  { key: 'pos_fnb.reports.export', description: 'Export F&B reports', category: 'reports' },

  // Settings
  { key: 'pos_fnb.settings.manage', description: 'Configure F&B POS settings', category: 'settings' },

  // Manage Tabs (bulk operations)
  { key: 'pos_fnb.tabs.manage', description: 'Bulk manage tabs (void, transfer, close)', category: 'tabs' },
  { key: 'pos_fnb.tabs.manage_bulk_all_servers', description: 'Manage tabs across all servers', category: 'tabs' },

  // GL Posting
  { key: 'pos_fnb.gl.post', description: 'Post batches to general ledger', category: 'gl' },
  { key: 'pos_fnb.gl.reverse', description: 'Reverse GL postings', category: 'gl' },
  { key: 'pos_fnb.gl.mappings', description: 'Configure GL account mappings', category: 'gl' },
];

// ── Role → Permission Defaults ────────────────────────────────────

export type SystemRole = 'owner' | 'manager' | 'supervisor' | 'cashier' | 'server' | 'staff';

export const FNB_ROLE_DEFAULTS: Record<SystemRole, string[]> = {
  owner: FNB_PERMISSIONS.map((p) => p.key), // all permissions

  manager: [
    'pos_fnb.floor_plan.view', 'pos_fnb.floor_plan.manage',
    'pos_fnb.tabs.view', 'pos_fnb.tabs.create', 'pos_fnb.tabs.transfer', 'pos_fnb.tabs.void',
    'pos_fnb.payments.create', 'pos_fnb.payments.split', 'pos_fnb.payments.refund', 'pos_fnb.payments.void',
    'pos_fnb.tips.adjust', 'pos_fnb.tips.finalize', 'pos_fnb.tips.pool_manage',
    'pos_fnb.menu.manage', 'pos_fnb.menu.comp', 'pos_fnb.menu.discount', 'pos_fnb.menu.price_override',
    'pos_fnb.close_batch.manage', 'pos_fnb.close_batch.cash_count',
    'pos_fnb.reports.view', 'pos_fnb.reports.export',
    'pos_fnb.settings.manage',
    'pos_fnb.gl.post', 'pos_fnb.gl.reverse', 'pos_fnb.gl.mappings',
    'pos_fnb.tabs.manage', 'pos_fnb.tabs.manage_bulk_all_servers',
  ],

  supervisor: [
    'pos_fnb.floor_plan.view', 'pos_fnb.floor_plan.manage',
    'pos_fnb.tabs.view', 'pos_fnb.tabs.create', 'pos_fnb.tabs.transfer', 'pos_fnb.tabs.void',
    'pos_fnb.tabs.manage',
    'pos_fnb.payments.create', 'pos_fnb.payments.split', 'pos_fnb.payments.refund',
    'pos_fnb.tips.adjust',
    'pos_fnb.menu.manage', 'pos_fnb.menu.comp', 'pos_fnb.menu.discount',
    'pos_fnb.close_batch.cash_count',
    'pos_fnb.reports.view',
  ],

  cashier: [
    'pos_fnb.floor_plan.view',
    'pos_fnb.tabs.view', 'pos_fnb.tabs.create',
    'pos_fnb.payments.create', 'pos_fnb.payments.split',
    'pos_fnb.menu.discount',
  ],

  server: [
    'pos_fnb.floor_plan.view',
    'pos_fnb.tabs.view', 'pos_fnb.tabs.create',
    'pos_fnb.payments.create', 'pos_fnb.payments.split',
    'pos_fnb.tips.adjust',
  ],

  staff: [
    'pos_fnb.floor_plan.view',
  ],
};

/**
 * Check if a role has a specific permission.
 */
export function roleHasPermission(role: SystemRole, permission: string): boolean {
  return FNB_ROLE_DEFAULTS[role].includes(permission);
}

/**
 * Get all permission categories.
 */
export function getPermissionCategories(): string[] {
  return [...new Set(FNB_PERMISSIONS.map((p) => p.category))];
}

/**
 * Get permissions by category.
 */
export function getPermissionsByCategory(category: string): FnbPermission[] {
  return FNB_PERMISSIONS.filter((p) => p.category === category);
}
