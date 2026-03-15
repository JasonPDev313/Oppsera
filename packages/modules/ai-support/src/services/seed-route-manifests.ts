import { db, aiSupportRouteManifests } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

/**
 * Route manifest definitions for the AI assistant's T4 retrieval tier.
 *
 * Each manifest tells the AI what a page does, what actions are available,
 * what permissions are needed, and common help text. This is the structured
 * knowledge the AI uses to answer "how do I..." questions accurately.
 */
interface RouteManifest {
  route: string;
  moduleKey: string;
  pageTitle: string;
  description: string;
  helpText?: string;
  tabsJson?: string[];
  actionsJson?: string[];
  permissionsJson?: string[];
  warningsJson?: string[];
}

const MANIFESTS: RouteManifest[] = [
  // ─── Dashboard ──────────────────────────────────────────────────
  {
    route: '/dashboard',
    moduleKey: 'dashboard',
    pageTitle: 'Dashboard',
    description: 'Main dashboard showing business overview, key metrics, recent activity, and quick-access links to common tasks.',
    helpText: 'The dashboard updates in real-time. Use the module cards to navigate to specific areas. Key metrics include daily sales, open orders, and alerts.',
  },

  // ─── POS Retail ─────────────────────────────────────────────────
  {
    route: '/pos/retail',
    moduleKey: 'pos_retail',
    pageTitle: 'Retail POS',
    description: 'Point of sale terminal for retail transactions. Scan or search items, build orders, apply discounts, and process payments.',
    helpText: 'To ring up a sale: scan a barcode or search for an item, adjust quantity if needed, then click Pay. You can apply discounts, add custom items, and split tenders. Use the customer lookup to attach a loyalty member.',
    actionsJson: ['Scan/search items', 'Apply discount', 'Add custom item', 'Attach customer', 'Park order', 'Process payment', 'Open cash drawer', 'Print receipt'],
    permissionsJson: ['orders.create', 'orders.void', 'payments.process', 'orders.discount'],
  },

  // ─── Retail Inventory ────────────────────────────────────────────
  {
    route: '/retail-inventory',
    moduleKey: 'pos_retail',
    pageTitle: 'Retail Inventory',
    description: 'Quick inventory view for retail POS operators. Shows stock levels, low-stock alerts, and recent receiving.',
    helpText: 'Use this screen to check stock before promising items to customers. For full inventory management (transfers, adjustments, cycle counts), go to Catalog > Inventory.',
  },

  // ─── F&B POS ────────────────────────────────────────────────────
  {
    route: '/pos/fnb',
    moduleKey: 'pos_fnb',
    pageTitle: 'F&B POS',
    description: 'Food & beverage point of sale with table management, coursing, and kitchen ticket integration.',
    helpText: 'Select a table or start a quick-sale order. Add menu items, apply modifiers (e.g., "no onions"), and fire courses to the kitchen. Payment can be split by seat or item. Tips are captured at payment time.',
    actionsJson: ['Select table', 'Add menu items', 'Apply modifiers', 'Fire course to kitchen', 'Split check', 'Process payment', 'Transfer table', 'Void item'],
    permissionsJson: ['orders.create', 'orders.void', 'fnb.fire_course', 'payments.process'],
  },

  // ─── Host Stand ─────────────────────────────────────────────────
  {
    route: '/host',
    moduleKey: 'pos_fnb',
    pageTitle: 'Host Stand',
    description: 'Restaurant host stand showing floor plan, table status, waitlist, and seating management.',
    helpText: 'Green tables are available, yellow are occupied, red need attention. Click a table to see its status or seat a party. Use the waitlist to manage walk-ins and reservations.',
    actionsJson: ['Seat party', 'Add to waitlist', 'View table status', 'Mark table dirty/clean', 'Assign server'],
  },

  // ─── F&B Manager ─────────────────────────────────────────────────
  {
    route: '/fnb-manager',
    moduleKey: 'pos_fnb',
    pageTitle: 'F&B Manager',
    description: 'Manager dashboard for food & beverage operations. Overview of open orders, server performance, table turn times, and kitchen throughput.',
    helpText: 'Monitor live operations from this screen. Click any open order to view details or intervene. The kitchen queue shows items waiting to be prepared.',
    actionsJson: ['View open orders', 'Void/comp items', 'Transfer tables between servers', 'View server sales', 'Close batch'],
    permissionsJson: ['fnb.*', 'orders.void'],
  },

  // ─── Close Batch ────────────────────────────────────────────────
  {
    route: '/close-batch',
    moduleKey: 'pos_fnb',
    pageTitle: 'Close Batch',
    description: 'End-of-day batch close for F&B. Settles all open orders, reconciles tips, and generates closing reports.',
    helpText: 'All open orders must be closed or voided before closing the batch. Review tip adjustments and cash counts. Once closed, a summary report is generated for accounting.',
    actionsJson: ['Review open orders', 'Adjust tips', 'Enter cash count', 'Close batch', 'Print closing report'],
    permissionsJson: ['fnb.close_batch'],
  },

  // ─── F&B Inventory ──────────────────────────────────────────────
  {
    route: '/fnb-inventory',
    moduleKey: 'pos_fnb',
    pageTitle: 'F&B Inventory',
    description: 'Food & beverage inventory tracking — ingredients, prep items, and waste logging.',
    helpText: 'Track ingredient stock levels, log prep counts, and record waste. Low-stock alerts notify you when items need reordering.',
  },

  // ─── KDS ────────────────────────────────────────────────────────
  {
    route: '/kds',
    moduleKey: 'kds',
    pageTitle: 'Kitchen Display System',
    description: 'Kitchen display showing incoming orders and tickets. Stations can be configured for different prep areas (grill, fry, salad, etc.).',
    helpText: 'Tickets appear when courses are fired from the POS. Tap a ticket to mark items as started, then tap again to mark as done. Color coding shows urgency: white = normal, yellow = approaching SLA, red = overdue.',
    actionsJson: ['Bump ticket', 'Recall ticket', 'Mark item started', 'Mark item done', 'Refire ticket'],
    permissionsJson: ['kds.view', 'kds.clear', 'kds.refire'],
  },
  {
    route: '/kds/settings',
    moduleKey: 'kds',
    pageTitle: 'KDS Settings',
    description: 'Configure kitchen display stations, routing rules, SLA timers, and display preferences.',
    helpText: 'Each station can be assigned to specific item categories (e.g., "Grill" station gets all burger orders). Set SLA timers to track prep time targets.',
    actionsJson: ['Add station', 'Edit routing rules', 'Set SLA timers', 'Configure display layout'],
    permissionsJson: ['kds.admin'],
  },

  // ─── Catalog ────────────────────────────────────────────────────
  {
    route: '/catalog',
    moduleKey: 'catalog',
    pageTitle: 'Catalog',
    description: 'Product and service catalog management. Create items, set prices, manage categories, and configure variants.',
    helpText: 'To add a new item: click "Add Item", fill in name and price, assign a category, then save. Items appear in the POS immediately. Use the hierarchy view for bulk category management.',
    actionsJson: ['Add item', 'Edit item', 'Set price', 'Manage categories', 'Import items', 'Export catalog'],
    permissionsJson: ['catalog.create', 'catalog.update', 'catalog.delete'],
  },
  {
    route: '/catalog/hierarchy',
    moduleKey: 'catalog',
    pageTitle: 'Category Hierarchy',
    description: 'Visual tree view of product categories. Drag and drop to reorganize the catalog structure.',
    helpText: 'Categories organize your items in the POS and reports. Drag categories to reorder or nest them. Each item must belong to at least one category.',
  },
  {
    route: '/catalog/items/new',
    moduleKey: 'catalog',
    pageTitle: 'New Catalog Item',
    description: 'Create a new product or service in the catalog with pricing, tax rules, and inventory tracking.',
    helpText: 'Required fields: name and price. Optional: SKU, barcode, category, tax class, inventory tracking. For items with size/color variants, use the Variants tab after creating the base item.',
    actionsJson: ['Save item', 'Add variant', 'Set tax rules', 'Enable inventory tracking'],
    permissionsJson: ['catalog.create'],
  },
  {
    route: '/catalog/modifiers',
    moduleKey: 'catalog',
    pageTitle: 'Modifier Groups',
    description: 'Manage modifier groups (add-ons, options) that can be attached to catalog items.',
    helpText: 'Modifiers let customers customize items (e.g., "Extra cheese +$1.50"). Create a modifier group, add options with prices, then link the group to items.',
    actionsJson: ['Add modifier group', 'Add modifier option', 'Link to items'],
  },
  {
    route: '/catalog/taxes',
    moduleKey: 'catalog',
    pageTitle: 'Tax Configuration',
    description: 'Configure tax rates and tax classes for catalog items.',
    helpText: 'Set up tax rates for your jurisdiction. Assign tax classes to items (e.g., "Food" at 0%, "Alcohol" at 8.5%). Tax is calculated automatically at checkout.',
  },

  // ─── Inventory ──────────────────────────────────────────────────
  {
    route: '/inventory/receiving',
    moduleKey: 'catalog',
    pageTitle: 'Receiving',
    description: 'Receive inventory from purchase orders. Scan or manually enter items, verify quantities, and update stock levels.',
    helpText: 'Select a purchase order or create a blind receiving document. Scan barcodes to receive items. Stock levels update immediately after posting.',
    actionsJson: ['Create receiving doc', 'Scan items', 'Adjust quantities', 'Post receiving'],
    permissionsJson: ['inventory.receive'],
  },
  {
    route: '/inventory/stock-alerts',
    moduleKey: 'catalog',
    pageTitle: 'Stock Alerts',
    description: 'View items below reorder point and generate purchase suggestions.',
    helpText: 'Items appear here when their stock drops below the reorder point set in the catalog. Click "Create PO" to generate a purchase order for the vendor.',
    actionsJson: ['View low stock', 'Create purchase order', 'Adjust reorder points'],
  },

  // ─── Vendors ────────────────────────────────────────────────────
  {
    route: '/vendors',
    moduleKey: 'catalog',
    pageTitle: 'Vendors',
    description: 'Manage supplier/vendor directory with contact info, payment terms, and purchase history.',
    helpText: 'Add vendors here to link them to purchase orders and bills. Each vendor can have default payment terms and a primary contact.',
    actionsJson: ['Add vendor', 'Edit vendor', 'View purchase history'],
    permissionsJson: ['catalog.vendors'],
  },

  // ─── Orders ─────────────────────────────────────────────────────
  {
    route: '/orders',
    moduleKey: 'pos_retail',
    pageTitle: 'Sales History',
    description: 'Browse and search all completed orders. View order details, process returns, and reprint receipts.',
    helpText: 'Use filters to find orders by date, customer, or amount. Click an order to view line items and payment details. Returns and exchanges are initiated from the order detail page.',
    actionsJson: ['Search orders', 'View order detail', 'Process return', 'Reprint receipt', 'Export orders'],
    permissionsJson: ['orders.read', 'orders.return'],
  },

  // ─── Payments ───────────────────────────────────────────────────
  {
    route: '/payments/transactions',
    moduleKey: 'payments',
    pageTitle: 'Payment Transactions',
    description: 'View all payment transactions across all channels. Search by date, amount, card type, or status.',
    helpText: 'This shows every payment processed through the system. Failed payments appear in red. Click a transaction for full details including processor response codes.',
    actionsJson: ['Search transactions', 'View transaction detail', 'Issue refund', 'Export transactions'],
    permissionsJson: ['payments.read', 'payments.refund'],
  },
  {
    route: '/payments/failed',
    moduleKey: 'payments',
    pageTitle: 'Failed Payments',
    description: 'View and retry failed payment transactions.',
    helpText: 'Failed payments may be due to declined cards, network errors, or processor issues. Review the error code and retry or contact the customer.',
  },

  // ─── Customers ──────────────────────────────────────────────────
  {
    route: '/customers',
    moduleKey: 'customers',
    pageTitle: 'Customer Directory',
    description: 'Manage customer records — contact info, purchase history, loyalty points, and notes.',
    helpText: 'Search by name, email, or phone. Click a customer to view their full profile including purchase history, membership status, and notes. Use "Add Customer" to create a new record.',
    actionsJson: ['Add customer', 'Search customers', 'View profile', 'Edit customer', 'Merge duplicates'],
    permissionsJson: ['customers.read', 'customers.create', 'customers.update'],
  },

  // ─── Membership ─────────────────────────────────────────────────
  {
    route: '/membership/plans',
    moduleKey: 'customers',
    pageTitle: 'Membership Plans',
    description: 'Configure membership tiers, pricing, benefits, and enrollment rules.',
    helpText: 'Create membership plans with monthly/annual pricing. Each plan can include benefits like discounts, free items, or priority booking. Members are enrolled from the customer profile.',
    actionsJson: ['Create plan', 'Edit plan', 'Set benefits', 'View enrollment stats'],
    permissionsJson: ['membership.admin'],
  },
  {
    route: '/membership/billing',
    moduleKey: 'customers',
    pageTitle: 'Membership Billing',
    description: 'View and manage recurring membership billing — upcoming charges, failed renewals, and billing history.',
    helpText: 'Failed renewals appear in red. Click to retry billing or update the payment method on file.',
  },

  // ─── Reports ────────────────────────────────────────────────────
  {
    route: '/reports',
    moduleKey: 'reporting',
    pageTitle: 'Reports',
    description: 'Business intelligence and reporting hub. Access built-in reports for sales, inventory, customers, labor, and more.',
    helpText: 'Choose a report category from the menu. Most reports support date range filtering and CSV export. Custom reports can be built in the Custom Reports section.',
    actionsJson: ['View reports', 'Set date range', 'Export CSV', 'Create custom report'],
    permissionsJson: ['reporting.read'],
  },

  // ─── AI Insights ────────────────────────────────────────────────
  {
    route: '/insights',
    moduleKey: 'semantic',
    pageTitle: 'AI Insights',
    description: 'AI-powered business insights including trend analysis, anomaly detection, and natural language queries.',
    helpText: 'Ask questions about your business in plain English (e.g., "What were my top-selling items last week?"). The AI analyzes your data and provides charts and summaries.',
    actionsJson: ['Ask a question', 'View watchlist', 'Browse insight history', 'Create embed'],
    permissionsJson: ['semantic.read'],
  },

  // ─── Spa ────────────────────────────────────────────────────────
  {
    route: '/spa',
    moduleKey: 'spa',
    pageTitle: 'Spa Dashboard',
    description: 'Spa management overview — today\'s appointments, provider availability, and revenue summary.',
    helpText: 'View today\'s schedule at a glance. Click an appointment for details. Use the calendar for future dates. Quick-book from the "New Appointment" button.',
  },
  {
    route: '/spa/appointments',
    moduleKey: 'spa',
    pageTitle: 'Spa Appointments',
    description: 'View, create, and manage spa appointments. Filter by date, provider, service, or status.',
    helpText: 'To book a new appointment: click "New Appointment", select a service and provider, choose a date/time, and optionally attach a customer. The system checks provider availability automatically.',
    actionsJson: ['New appointment', 'Edit appointment', 'Cancel appointment', 'Check in guest', 'Process payment'],
    permissionsJson: ['spa.appointments.create', 'spa.appointments.update'],
  },
  {
    route: '/spa/services',
    moduleKey: 'spa',
    pageTitle: 'Spa Services',
    description: 'Manage spa service menu — treatments, durations, pricing, and provider assignments.',
    helpText: 'Each service has a name, duration, price, and category. Assign providers who are qualified to perform each service. Services appear in the booking flow.',
    actionsJson: ['Add service', 'Edit service', 'Set pricing', 'Assign providers'],
    permissionsJson: ['spa.services.manage'],
  },
  {
    route: '/spa/providers',
    moduleKey: 'spa',
    pageTitle: 'Spa Providers',
    description: 'Manage spa service providers — schedules, service assignments, and performance metrics.',
    helpText: 'Add providers (therapists, estheticians, etc.) and set their working hours. Assign which services each provider can perform. View utilization and revenue per provider.',
    actionsJson: ['Add provider', 'Set schedule', 'Assign services', 'View performance'],
  },

  // ─── PMS (Property Management) ──────────────────────────────────
  {
    route: '/pms',
    moduleKey: 'pms',
    pageTitle: 'Property Management',
    description: 'Hotel/property management dashboard — occupancy, arrivals, departures, housekeeping status.',
    helpText: 'The dashboard shows today\'s arrivals, departures, and in-house guests. Use the tape chart for a visual room availability view.',
  },
  {
    route: '/pms/reservations',
    moduleKey: 'pms',
    pageTitle: 'Reservations',
    description: 'Manage hotel reservations — search, create, modify, and cancel bookings.',
    helpText: 'Search by guest name, confirmation number, or date. To create a new reservation: select dates, choose a room type, enter guest details, and confirm. Rate plans are applied automatically.',
    actionsJson: ['New reservation', 'Edit reservation', 'Cancel reservation', 'Check in', 'Check out', 'Assign room'],
    permissionsJson: ['pms.reservations.create', 'pms.reservations.update'],
  },
  {
    route: '/pms/front-desk',
    moduleKey: 'pms',
    pageTitle: 'Front Desk',
    description: 'Front desk operations — check-ins, check-outs, room moves, and guest requests.',
    helpText: 'Today\'s expected arrivals and departures are shown. Click "Check In" to assign a room and register the guest. For early check-in/late check-out, adjust the dates in the reservation.',
    actionsJson: ['Check in guest', 'Check out guest', 'Move room', 'Post charge', 'Print folio'],
    permissionsJson: ['pms.front_desk'],
  },
  {
    route: '/pms/housekeeping',
    moduleKey: 'pms',
    pageTitle: 'Housekeeping',
    description: 'Housekeeping board — room cleaning status, assignments, and inspection tracking.',
    helpText: 'Rooms are colored by status: green = clean, yellow = dirty, red = out of order. Assign rooms to housekeeping staff and mark as inspected when done.',
    actionsJson: ['Assign rooms', 'Mark clean', 'Mark inspected', 'Report maintenance issue'],
    permissionsJson: ['pms.housekeeping'],
  },

  // ─── Accounting ─────────────────────────────────────────────────
  {
    route: '/accounting',
    moduleKey: 'accounting',
    pageTitle: 'Accounting Dashboard',
    description: 'Accounting overview — GL summary, period status, unposted transactions, and reconciliation alerts.',
    helpText: 'The dashboard shows your current accounting period, unposted batches, and any reconciliation items needing attention. Navigate to sub-modules from the left menu.',
  },
  {
    route: '/accounting/gl',
    moduleKey: 'accounting',
    pageTitle: 'General Ledger',
    description: 'View and manage general ledger entries. Browse by account, period, or source module.',
    helpText: 'GL entries are automatically posted from sales, payments, and other modules. Use this screen to review postings, create manual journal entries, or investigate discrepancies.',
    actionsJson: ['View entries', 'Create journal entry', 'Filter by account', 'Export GL'],
    permissionsJson: ['accounting.gl.read', 'accounting.gl.write'],
  },
  {
    route: '/accounting/accounts',
    moduleKey: 'accounting',
    pageTitle: 'Chart of Accounts',
    description: 'Manage the chart of accounts — add, edit, and organize GL accounts.',
    helpText: 'The chart of accounts defines your financial structure. Each account has a number, name, type (asset/liability/equity/revenue/expense), and optional sub-accounts.',
    actionsJson: ['Add account', 'Edit account', 'Deactivate account'],
    permissionsJson: ['accounting.accounts.manage'],
  },
  {
    route: '/accounting/journals',
    moduleKey: 'accounting',
    pageTitle: 'Journal Entries',
    description: 'Create and review manual journal entries. Supports recurring entries and templates.',
    helpText: 'Manual journal entries must balance (debits = credits). Use templates for common entries like depreciation or accruals. Recurring entries auto-post on schedule.',
    actionsJson: ['Create entry', 'Post entry', 'Reverse entry', 'Create template'],
    permissionsJson: ['accounting.journals.create', 'accounting.journals.post'],
  },

  // ─── Accounts Payable ───────────────────────────────────────────
  {
    route: '/accounting/payables',
    moduleKey: 'ap',
    pageTitle: 'Accounts Payable',
    description: 'Manage vendor bills, payment runs, and AP aging.',
    helpText: 'Enter vendor bills, schedule payments, and track what you owe. The aging report shows overdue balances by vendor.',
    actionsJson: ['Enter bill', 'Schedule payment', 'View AP aging', 'Run payment batch'],
    permissionsJson: ['ap.read', 'ap.create', 'ap.pay'],
  },

  // ─── Accounts Receivable ────────────────────────────────────────
  {
    route: '/accounting/receivables',
    moduleKey: 'ar',
    pageTitle: 'Accounts Receivable',
    description: 'Manage customer invoices, receipts, and AR aging.',
    helpText: 'Create invoices, record payments, and track what customers owe you. The aging report shows overdue balances by customer.',
    actionsJson: ['Create invoice', 'Record receipt', 'View AR aging', 'Send statement'],
    permissionsJson: ['ar.read', 'ar.create', 'ar.receipt'],
  },

  // ─── Expenses ───────────────────────────────────────────────────
  {
    route: '/accounting/expenses',
    moduleKey: 'expenses',
    pageTitle: 'Expenses',
    description: 'Track and categorize business expenses. Submit, approve, and post expense reports.',
    helpText: 'Submit expenses with receipts for approval. Approved expenses are automatically posted to the GL. Use categories to track spending by department or project.',
    actionsJson: ['Submit expense', 'Approve expense', 'Reject expense', 'Export expenses'],
    permissionsJson: ['expenses.submit', 'expenses.approve'],
  },

  // ─── Settings ───────────────────────────────────────────────────
  {
    route: '/settings/general',
    moduleKey: 'settings',
    pageTitle: 'General Settings',
    description: 'Business profile, branding, timezone, currency, and core configuration.',
    helpText: 'Update your business name, address, logo, timezone, and default currency. These settings affect receipts, reports, and system behavior.',
    permissionsJson: ['settings.manage'],
  },
  {
    route: '/settings/merchant-services',
    moduleKey: 'settings',
    pageTitle: 'Merchant Services',
    description: 'Configure payment processor integration — gateway credentials, supported tender types, and processing rules.',
    helpText: 'Connect your payment processor (Stripe, Square, etc.) by entering API credentials. Configure which payment methods to accept and set processing rules.',
    permissionsJson: ['settings.merchant_services'],
    warningsJson: ['Changes to payment processing affect all locations immediately'],
  },
  {
    route: '/settings/permissions',
    moduleKey: 'settings',
    pageTitle: 'Permissions & Roles',
    description: 'Manage user roles and permissions. Assign permissions by module and action.',
    helpText: 'OppsEra has 6 built-in roles: Owner, Manager, Supervisor, Cashier, Server, and Staff. Each role has default permissions that can be customized. Permissions follow the pattern module.action (e.g., orders.create).',
    actionsJson: ['View roles', 'Edit role permissions', 'Assign role to user'],
    permissionsJson: ['settings.permissions'],
  },
  {
    route: '/settings/data-imports',
    moduleKey: 'settings',
    pageTitle: 'Data Imports',
    description: 'Import data from CSV files — customers, catalog items, inventory counts, and more.',
    helpText: 'Download a template CSV, fill in your data, and upload. The system validates the data before importing. You can preview and fix errors before committing.',
    actionsJson: ['Download template', 'Upload CSV', 'Preview import', 'Commit import'],
    permissionsJson: ['settings.imports'],
  },
];

/**
 * Seed route manifests into ai_support_route_manifests.
 *
 * Idempotent — uses upsert on the unique route constraint.
 * All manifests are global (tenantId = null).
 */
export async function seedRouteManifests(): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const m of MANIFESTS) {
    const values = {
      id: generateUlid(),
      tenantId: null,
      route: m.route,
      moduleKey: m.moduleKey,
      pageTitle: m.pageTitle,
      description: m.description,
      helpText: m.helpText ?? null,
      tabsJson: m.tabsJson ?? null,
      actionsJson: m.actionsJson ?? null,
      permissionsJson: m.permissionsJson ?? null,
      warningsJson: m.warningsJson ?? null,
    };

    const result = await db
      .insert(aiSupportRouteManifests)
      .values(values)
      .onConflictDoUpdate({
        target: aiSupportRouteManifests.route,
        set: {
          pageTitle: m.pageTitle,
          description: m.description,
          helpText: m.helpText ?? null,
          tabsJson: m.tabsJson ?? null,
          actionsJson: m.actionsJson ?? null,
          permissionsJson: m.permissionsJson ?? null,
          warningsJson: m.warningsJson ?? null,
          updatedAt: new Date(),
        },
      });

    // Drizzle returns rowCount — if the id changed it was an insert, otherwise update
    const rowCount = (result as unknown as { rowCount: number }).rowCount ?? 1;
    if (rowCount > 0) {
      // We can't distinguish insert vs update easily, so count all as processed
      inserted++;
    }
  }

  // Check how many were truly new vs updated
  updated = 0; // Approximate — all treated as upserts
  return { inserted, updated };
}
