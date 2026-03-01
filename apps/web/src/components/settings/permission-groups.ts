import { PERMISSION_BY_KEY } from '@oppsera/shared';

// ── Types ────────────────────────────────────────────────────

export interface PermissionSubGroup {
  label: string;
  permissions: string[];
}

export interface PermissionGroupEntry {
  label: string;
  /** Flat list — used for small groups with no sub-sections */
  permissions?: string[];
  /** Hierarchical sub-groups — each toggleable independently */
  subGroups?: PermissionSubGroup[];
}

// ── Permission Groups ────────────────────────────────────────

/** Get all permissions for a group (flat or sub-grouped) */
export function getAllGroupPerms(group: PermissionGroupEntry): string[] {
  if (group.permissions) return group.permissions;
  return group.subGroups?.flatMap((sg) => sg.permissions) ?? [];
}

export const PERMISSION_GROUPS: PermissionGroupEntry[] = [
  // ── Platform ──────────────────────────────────────────────
  {
    label: 'Platform',
    subGroups: [
      { label: 'Dashboard', permissions: ['dashboard.view', 'dashboard.configure'] },
      { label: 'Settings', permissions: ['settings.view', 'settings.update'] },
      { label: 'Users & Roles', permissions: ['users.view', 'users.manage'] },
      { label: 'Modules', permissions: ['modules.manage'] },
      { label: 'Audit Log', permissions: ['audit.view'] },
    ],
  },
  // ── Catalog ───────────────────────────────────────────────
  { label: 'Inventory Items', permissions: ['catalog.view', 'catalog.manage'] },
  // ── POS / Orders ──────────────────────────────────────────
  {
    label: 'POS / Orders',
    subGroups: [
      { label: 'Orders', permissions: ['orders.view', 'orders.create', 'orders.manage', 'orders.void'] },
      { label: 'Returns & Overrides', permissions: ['returns.create', 'price.override', 'discounts.apply', 'charges.manage'] },
      { label: 'Cash Drawer', permissions: ['shift.manage', 'cash.drawer', 'cash.drop'] },
      { label: 'Register Tabs', permissions: ['pos.register_tabs.view_all', 'pos.register_tabs.transfer'] },
    ],
  },
  // ── Payments ──────────────────────────────────────────────
  { label: 'Payments', permissions: ['tenders.view', 'tenders.create', 'tenders.adjust', 'tenders.refund'] },
  // ── Inventory ─────────────────────────────────────────────
  { label: 'Inventory', permissions: ['inventory.view', 'inventory.manage'] },
  // ── Customers ─────────────────────────────────────────────
  {
    label: 'Customers',
    subGroups: [
      { label: 'Profiles', permissions: ['customers.view', 'customers.manage'] },
      { label: 'Billing & AR', permissions: ['billing.view', 'billing.manage'] },
    ],
  },
  // ── Reports ───────────────────────────────────────────────
  {
    label: 'Reports',
    subGroups: [
      { label: 'Standard Reports', permissions: ['reports.view', 'reports.export'] },
      { label: 'Custom Reports', permissions: ['reports.custom.view', 'reports.custom.manage'] },
    ],
  },
  // ── Accounting ────────────────────────────────────────────
  {
    label: 'Accounting',
    subGroups: [
      { label: 'General Ledger', permissions: ['accounting.view', 'accounting.manage'] },
      { label: 'GL Mappings', permissions: ['accounting.mappings.manage'] },
      { label: 'Period Close', permissions: ['accounting.period.close'] },
      { label: 'Banking', permissions: ['accounting.banking.view', 'accounting.banking.reconcile'] },
      { label: 'Tax & Financials', permissions: ['accounting.tax.view', 'accounting.financials.view', 'accounting.revenue.view'] },
      { label: 'COGS', permissions: ['cogs.manage'] },
    ],
  },
  // ── AP / AR / Expenses ────────────────────────────────────
  { label: 'Accounts Payable', permissions: ['ap.view', 'ap.manage'] },
  { label: 'Accounts Receivable', permissions: ['ar.view', 'ar.manage'] },
  { label: 'Expense Management', permissions: ['expenses.view', 'expenses.create', 'expenses.approve', 'expenses.manage'] },
  // ── F&B POS ───────────────────────────────────────────────
  {
    label: 'F&B POS',
    subGroups: [
      { label: 'Floor Plan', permissions: ['pos_fnb.floor_plan.view', 'pos_fnb.floor_plan.manage'] },
      { label: 'Tabs', permissions: ['pos_fnb.tabs.view', 'pos_fnb.tabs.create', 'pos_fnb.tabs.transfer', 'pos_fnb.tabs.void', 'pos_fnb.tabs.manage'] },
      { label: 'KDS', permissions: ['pos_fnb.kds.view', 'pos_fnb.kds.bump', 'pos_fnb.kds.recall'] },
      { label: 'Payments', permissions: ['pos_fnb.payments.create', 'pos_fnb.payments.split', 'pos_fnb.payments.refund', 'pos_fnb.payments.void'] },
      { label: 'Tips', permissions: ['pos_fnb.tips.adjust', 'pos_fnb.tips.finalize', 'pos_fnb.tips.pool_manage', 'pos_fnb.tips.manage'] },
      { label: 'Menu', permissions: ['pos_fnb.menu.manage', 'pos_fnb.menu.comp', 'pos_fnb.menu.discount', 'pos_fnb.menu.price_override'] },
      { label: 'Close Batch', permissions: ['pos_fnb.close_batch.manage', 'pos_fnb.close_batch.cash_count'] },
      { label: 'Reports', permissions: ['pos_fnb.reports.view', 'pos_fnb.reports.export'] },
      { label: 'Settings', permissions: ['pos_fnb.settings.manage'] },
      { label: 'GL Posting', permissions: ['pos_fnb.gl.view', 'pos_fnb.gl.manage', 'pos_fnb.gl.post', 'pos_fnb.gl.reverse', 'pos_fnb.gl.mappings'] },
      { label: 'Host Stand', permissions: ['pos_fnb.host.view', 'pos_fnb.host.manage', 'pos_fnb.host.notifications', 'pos_fnb.host.analytics'] },
    ],
  },
  // ── AI Insights ───────────────────────────────────────────
  { label: 'AI Insights', permissions: ['semantic.view', 'semantic.query', 'semantic.manage', 'semantic.admin'] },
  // ── Room Layouts ──────────────────────────────────────────
  { label: 'Room Layouts', permissions: ['room_layouts.view', 'room_layouts.manage'] },
  // ── PMS ───────────────────────────────────────────────────
  {
    label: 'Property Management',
    subGroups: [
      { label: 'Property', permissions: ['pms.property.view', 'pms.property.manage'] },
      { label: 'Rooms', permissions: ['pms.rooms.view', 'pms.rooms.manage'] },
      { label: 'Reservations', permissions: ['pms.reservations.view', 'pms.reservations.create', 'pms.reservations.edit', 'pms.reservations.cancel'] },
      { label: 'Front Desk', permissions: ['pms.front_desk.check_in', 'pms.front_desk.check_out', 'pms.front_desk.no_show'] },
      { label: 'Calendar', permissions: ['pms.calendar.view', 'pms.calendar.move', 'pms.calendar.resize'] },
      { label: 'Housekeeping', permissions: ['pms.housekeeping.view', 'pms.housekeeping.manage'] },
      { label: 'Guests', permissions: ['pms.guests.view', 'pms.guests.manage'] },
      { label: 'Folios', permissions: ['pms.folio.view', 'pms.folio.post_charges', 'pms.folio.post_payments'] },
      { label: 'Rates', permissions: ['pms.rates.view', 'pms.rates.manage'] },
    ],
  },
];

// ── Category Filter Tabs ────────────────────────────────────

export interface CategoryTab {
  key: string;
  label: string;
  groupLabels: string[];
}

export const CATEGORY_TABS: CategoryTab[] = [
  { key: 'all', label: 'All', groupLabels: [] },
  { key: 'platform', label: 'Platform', groupLabels: ['Platform'] },
  { key: 'pos', label: 'POS', groupLabels: ['POS / Orders', 'Payments', 'Inventory Items', 'Inventory'] },
  { key: 'fnb', label: 'F&B', groupLabels: ['F&B POS'] },
  { key: 'accounting', label: 'Accounting', groupLabels: ['Accounting', 'Accounts Payable', 'Accounts Receivable', 'Expense Management'] },
  { key: 'pms', label: 'PMS', groupLabels: ['Property Management'] },
  { key: 'customers', label: 'Customers', groupLabels: ['Customers'] },
  { key: 'reports', label: 'Reports & AI', groupLabels: ['Reports', 'Golf', 'AI Insights'] },
  { key: 'other', label: 'Other', groupLabels: ['Room Layouts'] },
];

// ── Permission Helpers ──────────────────────────────────────

/** Total permission count across all groups */
export const TOTAL_PERMISSION_COUNT = PERMISSION_GROUPS.reduce(
  (sum, g) => sum + getAllGroupPerms(g).length,
  0,
);

/** Get human-readable label for a permission key */
export function getPermLabel(key: string): string {
  return PERMISSION_BY_KEY.get(key)?.description ?? key;
}

/** Get metadata for a permission */
export function getPermMeta(key: string) {
  return PERMISSION_BY_KEY.get(key) ?? null;
}

/** Check if a permission matches a search query */
export function permMatchesSearch(
  permKey: string,
  groupLabel: string,
  subGroupLabel: string | null,
  query: string,
): boolean {
  const q = query.toLowerCase();
  if (permKey.toLowerCase().includes(q)) return true;
  const def = PERMISSION_BY_KEY.get(permKey);
  if (def?.description.toLowerCase().includes(q)) return true;
  if (groupLabel.toLowerCase().includes(q)) return true;
  if (subGroupLabel?.toLowerCase().includes(q)) return true;
  return false;
}
