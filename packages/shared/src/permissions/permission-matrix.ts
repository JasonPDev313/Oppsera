/**
 * PERMISSION_MATRIX — Single authoritative source of truth for all system permissions.
 *
 * Used by: seed scripts, admin permissions viewer, runtime validation docs.
 *
 * Every permission used in `withMiddleware({ permission: '...' })` MUST exist here.
 */

export interface PermissionDefinition {
  key: string;
  module: string;
  description: string;
  defaultRoles: string[];
  requiresManagerPin: boolean;
  requiresAudit: boolean;
}

// ── System Roles Reference ──────────────────────────────────
// owner     — Full access (wildcard *)
// manager   — Daily operations management
// supervisor— Floor supervision + approvals
// cashier   — POS terminal operations
// server    — F&B service operations
// staff     — Basic read-only staff

export const PERMISSION_MATRIX: PermissionDefinition[] = [
  // ── Platform Core ───────────────────────────────────────────
  { key: 'dashboard.view', module: 'platform', description: 'View the main dashboard', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'dashboard.configure', module: 'platform', description: 'Configure dashboard widgets and layout', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'settings.view', module: 'platform', description: 'View system settings', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'settings.update', module: 'platform', description: 'Modify system settings', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'users.view', module: 'platform', description: 'View user list and profiles', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'users.manage', module: 'platform', description: 'Create, edit, and manage users and role assignments', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'modules.manage', module: 'platform', description: 'Enable and disable modules', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'audit.view', module: 'platform', description: 'View the audit log', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },

  // ── Catalog ─────────────────────────────────────────────────
  { key: 'catalog.view', module: 'catalog', description: 'View items, categories, taxes, and pricing', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'catalog.manage', module: 'catalog', description: 'Create, edit, and archive items, categories, and taxes', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },

  // ── Orders / POS ────────────────────────────────────────────
  { key: 'orders.view', module: 'pos', description: 'View orders and order history', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: false },
  { key: 'orders.create', module: 'pos', description: 'Create new orders in POS', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: false },
  { key: 'orders.manage', module: 'pos', description: 'Modify existing orders (update lines, add charges)', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'orders.void', module: 'pos', description: 'Void an entire order', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },
  { key: 'returns.create', module: 'pos', description: 'Create return orders and process refunds', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: true, requiresAudit: true },
  { key: 'price.override', module: 'pos', description: 'Override item prices during sale', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: true, requiresAudit: true },
  { key: 'discounts.apply', module: 'pos', description: 'Apply discounts to orders', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'charges.manage', module: 'pos', description: 'Add or remove service charges', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },

  // ── Payments / Tenders ──────────────────────────────────────
  { key: 'tenders.view', module: 'payments', description: 'View payment/tender records', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: false },
  { key: 'tenders.create', module: 'payments', description: 'Record payments (cash, card, etc.)', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: true },
  { key: 'tenders.adjust', module: 'payments', description: 'Adjust tip amounts on tenders', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: true },
  { key: 'tenders.refund', module: 'payments', description: 'Reverse tenders and issue refunds', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },

  // ── Cash Drawer / Shift ─────────────────────────────────────
  { key: 'shift.manage', module: 'pos', description: 'Open and close drawer sessions', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'cash.drawer', module: 'pos', description: 'Record paid-in, paid-out, and no-sale events', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'cash.drop', module: 'pos', description: 'Record cash drops to safe', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },

  // ── Register Tabs ─────────────────────────────────────────────
  { key: 'pos.register_tabs.view_all', module: 'pos', description: 'View all register tabs at a location (manager view)', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos.register_tabs.transfer', module: 'pos', description: 'Transfer register tabs between employees', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },

  // ── Inventory ───────────────────────────────────────────────
  { key: 'inventory.view', module: 'inventory', description: 'View stock levels, movements, and receiving history', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'inventory.manage', module: 'inventory', description: 'Receive, adjust, transfer stock; manage vendors and POs', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },

  // ── Customers ───────────────────────────────────────────────
  { key: 'customers.view', module: 'customers', description: 'View customer profiles and search', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'customers.manage', module: 'customers', description: 'Create, edit, merge customers; manage contacts and service flags', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'billing.view', module: 'customers', description: 'View billing accounts, statements, and AR transactions', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'billing.manage', module: 'customers', description: 'Manage billing accounts, post charges, process payments', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },

  // ── Reporting ───────────────────────────────────────────────
  { key: 'reports.view', module: 'reporting', description: 'View standard reports and dashboards', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'reports.export', module: 'reporting', description: 'Export reports to CSV', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'reports.custom.view', module: 'reporting', description: 'View saved custom reports and dashboards', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'reports.custom.manage', module: 'reporting', description: 'Create, edit, and delete custom reports and dashboards', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },

  // ── Accounting / GL ─────────────────────────────────────────
  { key: 'accounting.view', module: 'accounting', description: 'View chart of accounts, journal entries, reports, statements', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'accounting.manage', module: 'accounting', description: 'Post journal entries, manage accounts, configure settings', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'accounting.mappings.manage', module: 'accounting', description: 'Configure GL account mappings (sub-department, payment type, tax group, F&B)', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'accounting.period.close', module: 'accounting', description: 'Close an accounting period (irreversible)', defaultRoles: ['owner'], requiresManagerPin: true, requiresAudit: true },
  { key: 'accounting.banking.view', module: 'accounting', description: 'View bank accounts, deposits, and settlements', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'accounting.banking.reconcile', module: 'accounting', description: 'Perform bank reconciliation', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'accounting.tax.view', module: 'accounting', description: 'View tax remittance and reports', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'accounting.financials.view', module: 'accounting', description: 'View financial reports and statements', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'accounting.revenue.view', module: 'accounting', description: 'View COGS and tip payouts', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'cogs.manage', module: 'accounting', description: 'Calculate and post periodic COGS entries', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'expenses.view', module: 'accounting', description: 'View expense reports and summaries', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'expenses.create', module: 'accounting', description: 'Create and submit expense reports', defaultRoles: ['owner', 'manager', 'supervisor', 'staff'], requiresManagerPin: false, requiresAudit: true },
  { key: 'expenses.approve', module: 'accounting', description: 'Approve or reject expense reports', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'expenses.manage', module: 'accounting', description: 'Manage expense policies and reimbursements', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'project_costing.view', module: 'accounting', description: 'View projects, tasks, and cost allocations', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'project_costing.manage', module: 'accounting', description: 'Create and manage projects, tasks, and budgets', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },

  // ── Accounts Payable ────────────────────────────────────────
  { key: 'ap.view', module: 'ap', description: 'View bills, payment history, vendor ledger, and aging reports', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'ap.manage', module: 'ap', description: 'Create, post, and void bills and payments', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },

  // ── Accounts Receivable ─────────────────────────────────────
  { key: 'ar.view', module: 'ar', description: 'View invoices, receipts, customer ledger, and aging reports', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'ar.manage', module: 'ar', description: 'Create, post, and void invoices and receipts', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },

  // ── Room Layouts ────────────────────────────────────────────
  { key: 'room_layouts.view', module: 'room_layouts', description: 'View floor plans and room configurations', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'room_layouts.manage', module: 'room_layouts', description: 'Edit floor plans, publish versions, manage templates', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },

  // ── AI Insights / Semantic ──────────────────────────────────
  { key: 'semantic.view', module: 'semantic', description: 'View available metrics and dimensions', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'semantic.query', module: 'semantic', description: 'Run AI-powered queries and chat', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'semantic.manage', module: 'semantic', description: 'Create and edit custom lenses', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'semantic.admin', module: 'semantic', description: 'View semantic metrics, invalidate cache', defaultRoles: ['owner'], requiresManagerPin: false, requiresAudit: false },

  // ── F&B POS ─────────────────────────────────────────────────
  { key: 'pos_fnb.floor_plan.view', module: 'pos_fnb', description: 'View floor plan and table status', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.floor_plan.manage', module: 'pos_fnb', description: 'Edit table assignments and sections', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.tabs.view', module: 'pos_fnb', description: 'View open tabs and check details', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.tabs.create', module: 'pos_fnb', description: 'Open new tabs', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.tabs.transfer', module: 'pos_fnb', description: 'Transfer tabs between servers', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.tabs.void', module: 'pos_fnb', description: 'Void entire tabs', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },
  { key: 'pos_fnb.tabs.manage', module: 'pos_fnb', description: 'Close, reopen, and manage tab lifecycle', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.tabs.manage_bulk_all_servers', module: 'pos_fnb', description: 'Bulk manage tabs across all servers', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },
  // ── KDS (Kitchen Display) ──────────────────────────────────
  { key: 'pos_fnb.kds.view', module: 'pos_fnb', description: 'View kitchen display system', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.kds.bump', module: 'pos_fnb', description: 'Bump items and tickets on KDS', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.kds.recall', module: 'pos_fnb', description: 'Recall bumped items on KDS', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.kds.manage', module: 'pos_fnb', description: 'Manage KDS stations and routing rules', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.kds.settings.manage', module: 'pos_fnb', description: 'Configure KDS settings, bump bars, alerts, and targets', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.payments.create', module: 'pos_fnb', description: 'Process F&B payments', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.payments.split', module: 'pos_fnb', description: 'Split checks', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.payments.refund', module: 'pos_fnb', description: 'Process F&B refunds', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },
  { key: 'pos_fnb.payments.void', module: 'pos_fnb', description: 'Void F&B payments', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },
  { key: 'pos_fnb.tips.adjust', module: 'pos_fnb', description: 'Adjust tip amounts', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.tips.finalize', module: 'pos_fnb', description: 'Finalize tips for period', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.tips.pool_manage', module: 'pos_fnb', description: 'Manage tip pools and distribution', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.tips.manage', module: 'pos_fnb', description: 'Declare and manage tip operations', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.menu.manage', module: 'pos_fnb', description: '86/restore menu items', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.menu.comp', module: 'pos_fnb', description: 'Comp items (posts to expense GL)', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },
  { key: 'pos_fnb.menu.discount', module: 'pos_fnb', description: 'Apply discounts to F&B items', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.menu.price_override', module: 'pos_fnb', description: 'Override F&B item prices', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },
  { key: 'pos_fnb.close_batch.manage', module: 'pos_fnb', description: 'Start, reconcile, and post close batches', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.close_batch.cash_count', module: 'pos_fnb', description: 'Enter cash counts for close batch', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.reports.view', module: 'pos_fnb', description: 'View F&B reports', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.reports.export', module: 'pos_fnb', description: 'Export F&B reports', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.settings.manage', module: 'pos_fnb', description: 'Configure F&B settings', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.gl.view', module: 'pos_fnb', description: 'View F&B GL posting status and reconciliation', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.gl.manage', module: 'pos_fnb', description: 'Configure F&B GL posting and mappings', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.gl.post', module: 'pos_fnb', description: 'Post F&B batches to GL', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.gl.reverse', module: 'pos_fnb', description: 'Reverse F&B GL postings', defaultRoles: ['owner', 'manager'], requiresManagerPin: true, requiresAudit: true },
  { key: 'pos_fnb.gl.mappings', module: 'pos_fnb', description: 'Configure F&B GL account mappings', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.inventory.view', module: 'pos_fnb', description: 'View F&B inventory items and stock levels', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.inventory.manage', module: 'pos_fnb', description: 'Add, edit, and manage F&B inventory items', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.host.view', module: 'pos_fnb', description: 'View host stand, reservations, and waitlist', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'server', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pos_fnb.host.manage', module: 'pos_fnb', description: 'Create/edit reservations, manage waitlist entries', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.host.notifications', module: 'pos_fnb', description: 'Send SMS notifications to guests', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pos_fnb.host.analytics', module: 'pos_fnb', description: 'View host analytics and reports', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },

  // ── PMS (Property Management) ───────────────────────────────
  { key: 'pms.property.view', module: 'pms', description: 'View property information', defaultRoles: ['owner', 'manager', 'supervisor', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.property.manage', module: 'pms', description: 'Manage property settings', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.rooms.view', module: 'pms', description: 'View rooms and room types', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.rooms.manage', module: 'pms', description: 'Manage rooms, room types, and out-of-order status', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.reservations.view', module: 'pms', description: 'View reservations', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.reservations.create', module: 'pms', description: 'Create new reservations', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.reservations.edit', module: 'pms', description: 'Edit existing reservations', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.reservations.cancel', module: 'pms', description: 'Cancel reservations', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.front_desk.check_in', module: 'pms', description: 'Check in guests', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.front_desk.check_out', module: 'pms', description: 'Check out guests', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.front_desk.no_show', module: 'pms', description: 'Mark reservations as no-show', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.calendar.view', module: 'pms', description: 'View reservation calendar', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.calendar.move', module: 'pms', description: 'Move reservations on calendar', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.calendar.resize', module: 'pms', description: 'Resize reservations (change dates)', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.housekeeping.view', module: 'pms', description: 'View housekeeping tasks and room status', defaultRoles: ['owner', 'manager', 'supervisor', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.housekeeping.manage', module: 'pms', description: 'Manage housekeeping assignments and room status', defaultRoles: ['owner', 'manager', 'supervisor', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.guests.view', module: 'pms', description: 'View guest profiles', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.guests.manage', module: 'pms', description: 'Manage guest profiles', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.folio.view', module: 'pms', description: 'View guest folios', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.folio.post_charges', module: 'pms', description: 'Post charges to guest folio', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.folio.post_payments', module: 'pms', description: 'Post payments to guest folio', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.rates.view', module: 'pms', description: 'View rate plans', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'pms.rates.manage', module: 'pms', description: 'Manage rate plans and pricing', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.housekeepers.manage', module: 'pms', description: 'Manage housekeeper staff assignments', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'pms.reports.view', module: 'pms', description: 'View PMS reports', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },

  // ── Spa Management ────────────────────────────────────────────
  { key: 'spa.services.view', module: 'spa', description: 'View spa services and categories', defaultRoles: ['owner', 'manager', 'supervisor', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.services.manage', module: 'spa', description: 'Create, edit, and archive spa services and categories', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.providers.view', module: 'spa', description: 'View provider profiles and schedules', defaultRoles: ['owner', 'manager', 'supervisor', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.providers.manage', module: 'spa', description: 'Create, edit, and manage provider profiles and availability', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.resources.view', module: 'spa', description: 'View spa resources (rooms, equipment)', defaultRoles: ['owner', 'manager', 'supervisor', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.resources.manage', module: 'spa', description: 'Create, edit, and manage spa resources', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.appointments.view', module: 'spa', description: 'View appointments and calendar', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.appointments.create', module: 'spa', description: 'Create new appointments', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.appointments.manage', module: 'spa', description: 'Update, reschedule, check in/out appointments', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.appointments.cancel', module: 'spa', description: 'Cancel appointments (may trigger cancellation fees)', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.packages.view', module: 'spa', description: 'View spa packages and balances', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.packages.manage', module: 'spa', description: 'Sell, redeem, and manage spa packages', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.commissions.view', module: 'spa', description: 'View commission rules and ledger', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.commissions.manage', module: 'spa', description: 'Configure commission rules and approve payouts', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.intake.view', module: 'spa', description: 'View intake forms and clinical notes', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.intake.manage', module: 'spa', description: 'Create and manage intake form templates', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.clinical_notes.manage', module: 'spa', description: 'Create and manage SOAP clinical notes', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.settings.view', module: 'spa', description: 'View spa settings and configuration', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.settings.manage', module: 'spa', description: 'Configure spa settings, booking widget, and operations', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.reports.view', module: 'spa', description: 'View spa reports and analytics', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.reports.export', module: 'spa', description: 'Export spa reports to CSV', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.waitlist.view', module: 'spa', description: 'View the spa waitlist', defaultRoles: ['owner', 'manager', 'supervisor', 'cashier', 'staff'], requiresManagerPin: false, requiresAudit: false },
  { key: 'spa.waitlist.manage', module: 'spa', description: 'Add, offer, and remove waitlist entries', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.booking.manage', module: 'spa', description: 'Manage online booking widget configuration', defaultRoles: ['owner', 'manager'], requiresManagerPin: false, requiresAudit: true },
  { key: 'spa.operations.manage', module: 'spa', description: 'Manage room turnover, daily checklists, and operations', defaultRoles: ['owner', 'manager', 'supervisor'], requiresManagerPin: false, requiresAudit: false },
];

// ── Derived lookups ─────────────────────────────────────────

/** All unique module keys in the matrix */
export const PERMISSION_MODULES = [...new Set(PERMISSION_MATRIX.map((p) => p.module))].sort();

/** Lookup by permission key */
export const PERMISSION_BY_KEY = new Map(PERMISSION_MATRIX.map((p) => [p.key, p]));

/** Group permissions by module */
export function getPermissionsByModule(module: string): PermissionDefinition[] {
  return PERMISSION_MATRIX.filter((p) => p.module === module);
}

/** All permission keys that require audit */
export const AUDIT_REQUIRED_PERMISSIONS = new Set(
  PERMISSION_MATRIX.filter((p) => p.requiresAudit).map((p) => p.key),
);

/** All permission keys that require manager PIN */
export const PIN_REQUIRED_PERMISSIONS = new Set(
  PERMISSION_MATRIX.filter((p) => p.requiresManagerPin).map((p) => p.key),
);
