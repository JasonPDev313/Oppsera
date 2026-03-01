import { db, guardedQuery } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── Schema Catalog ───────────────────────────────────────────────
// Builds a compact text representation of tenant-scoped DB tables
// from information_schema. Used by the SQL generator to give the
// LLM full knowledge of the database structure.
//
// Cached in memory with 1-hour TTL (schema rarely changes).

// ── Types ────────────────────────────────────────────────────────

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

export interface TableInfo {
  name: string;
  description: string;
  columns: ColumnInfo[];
}

export interface SchemaCatalog {
  tables: TableInfo[];
  /** Compact text for LLM prompt (full columns) */
  fullText: string;
  /** Shorter summary for intent routing (table names + descriptions only) */
  summaryText: string;
  /** Set of table names for whitelist validation */
  tableNames: Set<string>;
  builtAt: number;
}

// ── Constants ────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000;       // 1 hour: serve from cache
const SWR_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours: serve stale, refresh in background

// Tables to exclude from the schema catalog
const EXCLUDED_TABLES = new Set([
  // System / migration tables
  'drizzle_migrations',
  '__drizzle_migrations',
  'schema_migrations',
  // Event infrastructure (internal)
  'event_outbox',
  'processed_events',
  'event_dead_letters',
  // Platform admin tables (not tenant-scoped, no RLS)
  'platform_admins',
  'platform_admin_roles',
  'platform_admin_role_permissions',
  'platform_admin_role_assignments',
  'platform_admin_audit_log',
  // Background job internals
  'background_jobs',
  'background_job_attempts',
  'scheduled_jobs',
]);

// Human-readable descriptions for tables (heuristic mapping)
const TABLE_DESCRIPTIONS: Record<string, string> = {
  // Core — IMPORTANT: "users" = staff/employees, NOT customers. See "customers" table for CRM.
  users: 'Staff/employee user accounts (NOT customers — see customers table for CRM records). Fields: name, email, status, primaryRoleId, posPin',
  tenants: 'Tenant organizations',
  locations: 'Business locations (sites and venues)',
  entitlements: 'Module access entitlements per tenant',
  audit_log: 'Audit trail of user actions',
  role_assignments: 'User role assignments (tenant/location scoped)',

  // Catalog
  catalog_items: 'Product catalog items (retail, F&B, service, package)',
  catalog_categories: 'Item categories (department → sub-department → category hierarchy)',
  catalog_modifier_groups: 'Modifier groups for F&B items',
  catalog_modifiers: 'Individual modifiers within groups',
  catalog_item_modifier_groups: 'Links items to modifier groups',
  catalog_option_sets: 'Option sets for retail items (size, color, etc.)',
  catalog_option_values: 'Individual options within option sets',
  catalog_item_option_sets: 'Links items to option sets',
  catalog_tax_categories: 'Tax category definitions',
  catalog_tax_rates: 'Tax rate percentages per category',
  catalog_tax_groups: 'Tax group definitions for multi-rate taxation',
  catalog_tax_group_rates: 'Links tax groups to tax rates',
  catalog_item_change_logs: 'Append-only change log for catalog item edits',

  // Orders
  orders: 'Order transactions (amounts in cents)',
  order_lines: 'Line items within orders (amounts in cents)',
  order_line_taxes: 'Tax breakdown per order line',
  order_number_counters: 'Sequential order number generation',
  idempotency_keys: 'Idempotency tracking for write operations',
  receipt_snapshots: 'Frozen receipt data at time of order placement',

  // Payments
  tenders: 'Payment tenders (amounts in cents)',
  tender_reversals: 'Tender reversal records',
  payment_journal_entries: 'Legacy GL journal entries from payments',

  // Inventory
  inventory_items: 'Inventory items per location (cost tracking)',
  inventory_movements: 'Append-only stock movement ledger',

  // Receiving
  vendors: 'Vendor/supplier records',
  receiving_receipts: 'Receiving receipt headers',
  receiving_receipt_lines: 'Receiving receipt line items',
  item_vendors: 'Vendor-item relationships and pricing',
  item_identifiers: 'Barcodes and alternate identifiers',
  uoms: 'Units of measure',
  item_uom_conversions: 'UOM conversion factors',

  // Purchase Orders
  purchase_orders: 'Purchase order headers',
  purchase_order_lines: 'Purchase order line items',
  purchase_order_revisions: 'PO revision history snapshots',

  // Customers
  customers: 'Customer/member CRM records — people who BUY from the business (NOT staff — see users table). Fields: first_name, last_name, email, phone, customer_type (person/organization), display_name',
  customer_relationships: 'Customer-to-customer relationships',
  customer_identifiers: 'Customer ID cards and wristbands',
  customer_activity_log: 'Customer CRM activity timeline',
  membership_plans: 'Membership plan definitions',
  memberships: 'Active memberships linking customers to plans',
  billing_accounts: 'House/billing accounts for credit customers',
  billing_account_members: 'Members authorized on billing accounts',
  ar_transactions: 'Operational AR transactions (append-only)',
  ar_allocations: 'AR payment allocation records (FIFO)',
  statements: 'Customer billing statements',

  // Reporting read models
  rm_daily_sales: 'Daily sales aggregates (CQRS read model, amounts in dollars)',
  rm_item_sales: 'Item sales aggregates (CQRS read model, amounts in dollars)',
  rm_inventory_on_hand: 'DO NOT USE — may be empty. Use inventory_movements + inventory_items + catalog_items instead (SUM(quantity_delta) = on-hand)',
  rm_customer_activity: 'Customer activity aggregates (CQRS read model)',

  // Accounting
  gl_accounts: 'General ledger chart of accounts',
  gl_classifications: 'GL account classifications (asset, liability, equity, revenue, expense)',
  gl_journal_entries: 'GL journal entry headers',
  gl_journal_lines: 'GL journal entry line items (amounts in dollars)',
  accounting_settings: 'Tenant accounting configuration',
  gl_unmapped_events: 'Events that could not be mapped to GL accounts',
  accounting_close_periods: 'Accounting period close status',
  financial_statement_layouts: 'Custom financial statement layouts',
  sub_department_gl_defaults: 'Sub-department to GL account mappings',
  payment_type_gl_defaults: 'Payment type to GL account mappings',
  tax_group_gl_defaults: 'Tax group to GL account mappings',
  bank_accounts: 'Bank account records',
  gl_transaction_types: 'GL transaction type registry',
  tenant_tender_types: 'Custom tender/payment method definitions',

  // AP
  ap_bills: 'Accounts payable bills (amounts in dollars)',
  ap_bill_lines: 'AP bill line items',
  ap_payments: 'AP payments to vendors',
  ap_payment_allocations: 'AP payment-to-bill allocations',
  ap_payment_terms: 'Payment terms definitions (Net 30, etc.)',

  // AR
  ar_invoices: 'Accounts receivable invoices (amounts in dollars)',
  ar_invoice_lines: 'AR invoice line items',
  ar_receipts: 'AR receipt/payment records',
  ar_receipt_allocations: 'AR receipt-to-invoice allocations',

  // Room Layouts
  floor_plan_rooms: 'Floor plan room definitions',
  floor_plan_versions: 'Floor plan version history with snapshots',
  floor_plan_templates_v2: 'Floor plan templates',

  // Terminals / Profit Centers
  terminal_locations: 'Profit centers (named terminal_locations in DB)',
  terminals: 'POS terminal devices',

  // F&B
  fnb_tables: 'Restaurant table tracking',
  fnb_tabs: 'Open F&B tabs (checks)',
  fnb_tab_items: 'Items on F&B tabs',
  fnb_kitchen_tickets: 'Kitchen display tickets',
  fnb_stations: 'KDS station definitions',

  // Golf reporting
  rm_fnb_server_performance: 'F&B server performance metrics (CQRS)',
  rm_fnb_table_turns: 'Table turn time metrics (CQRS)',
  rm_fnb_kitchen_performance: 'Kitchen performance metrics (CQRS)',
  rm_fnb_daypart_sales: 'Sales by daypart (CQRS)',
  rm_fnb_menu_mix: 'Menu mix analysis (CQRS)',

  // PMS (Property Management)
  pms_properties: 'Hotel properties or resort locations (name, timezone, tax rate, check-in/out times)',
  pms_room_types: 'Room type definitions (standard, deluxe, suite — max occupancy, beds, amenities)',
  pms_rooms: 'Individual room inventory (room number, floor, status, view type, accessibility)',
  pms_rate_plans: 'Rate plan definitions (rack rate, corporate, package rates)',
  pms_rate_plan_prices: 'Rate plan prices by room type and date range (nightly_base_cents)',
  pms_guests: 'Guest CRM records (name, email, phone, VIP status, stay history)',
  pms_reservations: 'Guest reservations and stays (check-in/out dates, status, room assignment, rates in cents)',
  pms_room_blocks: 'Room block assignments linking reservations to rooms by date',
  pms_folios: 'Guest folios (billing records for a stay)',
  pms_folio_entries: 'Folio line items (room charges, taxes, fees, payments)',
  pms_housekeepers: 'Housekeeper staff records',
  pms_housekeeping_assignments: 'Room cleaning assignments per housekeeper',
  pms_work_orders: 'Maintenance work orders',
  pms_groups: 'Group bookings (conferences, weddings, corporate events)',
  pms_group_room_blocks: 'Group room block allocations',
  pms_corporate_accounts: 'Corporate account agreements',
  pms_channels: 'OTA/channel manager integrations (Booking.com, Expedia, etc.)',
  pms_loyalty_programs: 'Loyalty program definitions (tiers, earn/burn rates)',
  pms_loyalty_members: 'Loyalty program member records (points balance, tier)',
  pms_loyalty_transactions: 'Loyalty point transactions (earn, redeem, adjust, expire)',

  // PMS read models (CQRS)
  rm_pms_calendar_segments: 'Calendar segments — one row per reservation per night (for calendar grid rendering)',
  rm_pms_daily_occupancy: 'Daily occupancy snapshot per property (rooms occupied/available, arrivals, departures, ADR/RevPAR in cents)',
  rm_pms_revenue_by_room_type: 'Room revenue aggregates by room type per day (amounts in cents)',
  rm_pms_housekeeping_productivity: 'Housekeeping metrics per housekeeper per day (rooms cleaned, time)',

  // Customer Tags
  tags: 'Tag definitions (VIP, At Risk, Birthday This Month, etc.) — tag_group categorizes: value_tier, engagement, lifecycle, behavioral, membership, service_flag',
  customer_tags: 'Customer-to-tag assignments — active when removed_at IS NULL. JOIN with tags table for tag name/color/group. Source: manual, smart, predictive, api',
  smart_tag_rules: 'Automated tag rules — conditions evaluate customer metrics (spend, visits, recency) to auto-apply tags',
  tag_audit_log: 'Append-only audit trail for tag apply/remove/expire events',
  tag_actions: 'Configurable actions triggered on tag lifecycle events (on_apply, on_remove, on_expire)',
  tag_action_executions: 'Append-only execution log for tag actions (success/failed/skipped)',

  // Semantic
  semantic_metrics: 'Registered semantic layer metrics',
  semantic_dimensions: 'Registered semantic layer dimensions',
  semantic_lenses: 'AI insight lenses (system + custom)',

  // Operations
  drawer_sessions: 'Cash drawer sessions',
  drawer_session_events: 'Drawer events (paid-in, paid-out, cash drop)',
  retail_close_batches: 'Retail end-of-day close batches',
  payment_settlements: 'Card settlement records',
  tip_payouts: 'Tip payout records',
  deposit_slips: 'Cash deposit slips',
  comp_events: 'Comp/void audit events',
};

// Column-level descriptions for key tables where the LLM needs semantic
// context (e.g., which amounts are cents vs dollars, what status values mean).
// Only annotate columns that cause confusion — not every column needs a description.
const COLUMN_DESCRIPTIONS: Record<string, Record<string, string>> = {
  orders: {
    subtotal_cents: 'order subtotal in CENTS (divide by 100 for dollars)',
    tax_cents: 'tax amount in CENTS',
    discount_cents: 'discount amount in CENTS',
    total_cents: 'grand total in CENTS (divide by 100 for dollars)',
    service_charge_cents: 'service charge in CENTS',
    business_date: 'business date YYYY-MM-DD (use for date filtering, NOT created_at)',
    status: 'open|placed|paid|voided — active orders are placed or paid',
    order_number: 'human-readable sequential order number',
  },
  order_lines: {
    qty: 'quantity (numeric, can be fractional for F&B e.g. 0.5)',
    unit_price_cents: 'per-unit price in CENTS',
    extended_price_cents: 'qty * unit_price in CENTS',
    subtotal_cents: 'line subtotal in CENTS',
  },
  tenders: {
    amount_cents: 'payment amount in CENTS (divide by 100 for dollars)',
    amount_given_cents: 'amount given by customer in CENTS (for cash, may exceed amount)',
    change_given_cents: 'change returned in CENTS',
    tip_amount_cents: 'tip amount in CENTS (separate from order total)',
    tender_type: 'cash|card|house_account|gift_card|etc',
    status: 'captured|reversed — active tenders have status=captured',
  },
  catalog_items: {
    price: 'unit price in DOLLARS (NUMERIC 12,2)',
    cost: 'unit cost in DOLLARS (NUMERIC 12,2)',
    item_type: 'retail|fnb|service|package|green_fee|rental',
    archived_at: 'NULL = active, non-NULL = archived (no is_active column)',
  },
  rm_daily_sales: {
    net_sales: 'net sales in DOLLARS (pre-aggregated from orders)',
    gross_sales: 'gross sales in DOLLARS',
    order_count: 'completed orders count',
    void_count: 'voided orders count',
    void_total: 'voided amount in DOLLARS',
    discount_total: 'discount amount in DOLLARS',
    tax_total: 'tax collected in DOLLARS',
    tender_cash: 'cash payments in DOLLARS',
    tender_card: 'card payments in DOLLARS',
    business_date: 'aggregation date (one row per location per date)',
  },
  rm_item_sales: {
    quantity_sold: 'units sold',
    quantity_voided: 'units voided',
    gross_revenue: 'item revenue in DOLLARS',
    catalog_item_name: 'item name at time of sale',
    category_name: 'category/department name',
    business_date: 'aggregation date',
  },
  rm_inventory_on_hand: {
    on_hand: 'DO NOT USE — may be empty. Use SUM(inventory_movements.quantity_delta) instead',
    reorder_point: 'DO NOT USE — query inventory_items.reorder_point instead',
    is_below_threshold: 'DO NOT USE — compare SUM(quantity_delta) to inventory_items.reorder_point instead',
    item_name: 'DO NOT USE — query catalog_items.name instead',
  },
  rm_customer_activity: {
    total_visits: 'lifetime visit count (RUNNING TOTAL, not per-date)',
    total_spend: 'lifetime spend in DOLLARS (RUNNING TOTAL)',
    customer_name: 'customer display name',
  },
  customers: {
    first_name: 'customer first name',
    last_name: 'customer last name',
    display_name: 'formatted display name',
    customer_type: 'person|organization',
  },
  users: {
    name: 'staff member full name (NOT customers — see customers table)',
    email: 'staff email',
    status: 'active|suspended|etc',
    primary_role_id: 'FK to role — this is STAFF not customers',
  },
  inventory_movements: {
    quantity_delta: 'positive=in, negative=out (append-only ledger)',
    movement_type: 'receive|sale_deduction|adjustment|transfer_in|transfer_out|shrink|void_reversal',
  },
  gl_journal_lines: {
    debit_amount: 'debit in DOLLARS (NUMERIC 12,2)',
    credit_amount: 'credit in DOLLARS (NUMERIC 12,2)',
  },
  ap_bills: {
    total_amount: 'bill total in DOLLARS',
    balance_due: 'remaining balance in DOLLARS',
    status: 'draft|posted|partial|paid|voided',
  },
  ar_invoices: {
    total_amount: 'invoice total in DOLLARS',
    balance_due: 'remaining balance in DOLLARS',
    status: 'draft|posted|partial|paid|voided',
  },
  pms_reservations: {
    check_in_date: 'guest arrival date (DATE type, YYYY-MM-DD) — use for "arriving on" or "reservations for" queries',
    check_out_date: 'guest departure date (DATE type, YYYY-MM-DD) — use for "departing on" queries',
    status: 'CONFIRMED|CHECKED_IN|CHECKED_OUT|CANCELLED|NO_SHOW|HOLD — active reservations are CONFIRMED or CHECKED_IN',
    nightly_rate_cents: 'per-night room rate in CENTS (divide by 100 for dollars)',
    subtotal_cents: 'room charges subtotal in CENTS',
    tax_cents: 'room tax in CENTS',
    total_cents: 'grand total in CENTS (room + tax + fees)',
    fee_cents: 'resort/other fees in CENTS',
    nights: 'number of nights in stay (integer)',
    adults: 'number of adults in party',
    children: 'number of children in party',
    source_type: 'DIRECT|OTA|CORPORATE|GROUP — booking source channel',
    room_id: 'FK to pms_rooms — NULL if room not yet assigned',
    guest_id: 'FK to pms_guests — NULL for walk-ins',
    primary_guest_json: 'JSONB with firstName, lastName, email, phone',
  },
  pms_rooms: {
    room_number: 'room number as displayed to guests (e.g., "101", "201A")',
    status: 'clean|occupied|dirty|cleaning|inspected — current room status',
    floor: 'floor number (integer)',
    is_out_of_order: 'true if room is out of order/service',
    view_type: 'room view (ocean, garden, pool, city, etc.)',
  },
  pms_guests: {
    is_vip: 'true if guest is VIP',
    total_stays: 'lifetime stay count',
    last_stay_date: 'date of most recent stay',
  },
  rm_pms_daily_occupancy: {
    business_date: 'aggregation date YYYY-MM-DD (one row per property per date)',
    total_rooms: 'total room count at property',
    rooms_occupied: 'rooms occupied on this date',
    rooms_available: 'sellable rooms (total - occupied - out of order)',
    rooms_ooo: 'rooms out of order',
    arrivals: 'guest check-ins on this date',
    departures: 'guest check-outs on this date',
    occupancy_pct: 'occupancy percentage (NUMERIC 5,2)',
    adr_cents: 'average daily rate in CENTS (divide by 100 for dollars)',
    revpar_cents: 'revenue per available room in CENTS (divide by 100 for dollars)',
  },
  rm_pms_revenue_by_room_type: {
    business_date: 'aggregation date YYYY-MM-DD',
    rooms_sold: 'room nights sold for this room type',
    room_revenue_cents: 'room revenue in CENTS (divide by 100 for dollars)',
    tax_revenue_cents: 'room tax in CENTS (divide by 100 for dollars)',
    adr_cents: 'average daily rate for this room type in CENTS',
  },
  tags: {
    name: 'human-readable tag name like VIP, At Risk, Birthday This Month, Whale',
    tag_type: 'manual|smart — manual tags are user-assigned, smart tags are rule-based',
    tag_group: 'category: value_tier|engagement|lifecycle|behavioral|membership|service_flag',
    category: 'optional sub-category for grouping in UI',
    priority: 'display priority (lower = higher priority, 0 = most important)',
    customer_count: 'denormalized count of customers with this tag',
    is_active: 'false if tag is disabled (still exists for history)',
    color: 'hex color code for chip display',
  },
  customer_tags: {
    customer_id: 'FK to customers — the customer who has this tag',
    tag_id: 'FK to tags — which tag is applied',
    source: 'manual|smart|predictive|api — how the tag was applied',
    source_rule_id: 'FK to smart_tag_rules if source is smart (NULL for manual)',
    evidence: 'JSONB — conditions matched and actual values when smart tag was applied',
    applied_at: 'when the tag was applied (timestamp)',
    removed_at: 'NULL if active, non-NULL if removed (soft-delete)',
    expires_at: 'NULL if permanent, non-NULL for auto-expiring tags',
    confidence: 'prediction confidence 0-1 (for predictive tags)',
  },
  tag_audit_log: {
    action: 'applied|removed|expired — what happened to the tag',
    source: 'manual|smart|predictive|api — how the action was triggered',
    evidence: 'JSONB — conditions snapshot at time of action',
    occurred_at: 'when the action happened',
  },
  rm_pms_calendar_segments: {
    business_date: 'the calendar day this segment covers (DATE)',
    reservation_id: 'FK to pms_reservations',
    guest_name: 'guest display name for calendar rendering',
    status: 'reservation status on this day',
    check_in_date: 'original reservation check-in date',
    check_out_date: 'original reservation check-out date',
  },
};

// Uses the shared @oppsera/db pool — no separate connection needed.

// ── Cache ────────────────────────────────────────────────────────

let _cache: SchemaCatalog | null = null;
let _refreshInFlight = false;
let _loadPromise: Promise<SchemaCatalog> | null = null;

// ── Builder ──────────────────────────────────────────────────────

function mapPgType(dataType: string): string {
  // Compact type names for prompt efficiency
  switch (dataType) {
    case 'character varying': return 'varchar';
    case 'timestamp with time zone': return 'timestamptz';
    case 'timestamp without time zone': return 'timestamp';
    case 'boolean': return 'bool';
    case 'integer': return 'int';
    case 'bigint': return 'bigint';
    case 'numeric': return 'numeric';
    case 'text': return 'text';
    case 'jsonb': return 'jsonb';
    case 'json': return 'json';
    case 'uuid': return 'uuid';
    case 'date': return 'date';
    case 'real': return 'real';
    case 'double precision': return 'float8';
    case 'USER-DEFINED': return 'enum';
    default: return dataType;
  }
}

export async function buildSchemaCatalog(): Promise<SchemaCatalog> {
  // SWR cache strategy: serve stale data while refreshing in background
  if (_cache) {
    const age = Date.now() - _cache.builtAt;

    // Fresh — return immediately
    if (age < CACHE_TTL_MS) return _cache;

    // Stale but within SWR window — return stale, kick off background refresh
    if (age < SWR_WINDOW_MS) {
      if (!_refreshInFlight) {
        _refreshInFlight = true;
        _loadSchemaCatalog()
          .then((fresh) => { _cache = fresh; })
          .catch((err) => {
            console.error('[semantic:schema-catalog] Background refresh failed:', err instanceof Error ? err.message : String(err));
          })
          .finally(() => { _refreshInFlight = false; });
      }
      return _cache;
    }
  }

  // No cache or expired beyond SWR window — deduplicate concurrent loads
  if (!_loadPromise) {
    _loadPromise = _loadSchemaCatalog().finally(() => { _loadPromise = null; });
  }
  _cache = await _loadPromise;
  return _cache;
}

async function _loadSchemaCatalog(): Promise<SchemaCatalog> {
  // Step 1: Find all tables that have a tenant_id column (tenant-scoped)
  const tenantTables = await guardedQuery('semantic:schemaCatalog:tables', () =>
    db.execute(sql`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'tenant_id'
      ORDER BY table_name
    `),
  );

  const tenantTableNames = new Set(
    Array.from(tenantTables as Iterable<{ table_name: string }>)
      .map((r) => r.table_name)
      .filter((name) => !EXCLUDED_TABLES.has(name)),
  );

  // Step 2: Fetch columns for all tenant-scoped tables
  const tableNameArray = Array.from(tenantTableNames);
  const columns = await guardedQuery('semantic:schemaCatalog:columns', () =>
    db.execute(sql`
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END AS is_pk
      FROM information_schema.columns c
      LEFT JOIN information_schema.table_constraints tc
        ON tc.table_name = c.table_name
        AND tc.table_schema = c.table_schema
        AND tc.constraint_type = 'PRIMARY KEY'
      LEFT JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
      AND kcu.column_name = c.column_name
    WHERE c.table_schema = 'public'
      AND c.table_name = ANY(${tableNameArray})
    ORDER BY c.table_name, c.ordinal_position
  `),
  );

  // Step 3: Group columns by table
  const tableMap = new Map<string, ColumnInfo[]>();
  for (const row of columns as Iterable<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    is_pk: boolean;
  }>) {
    if (!tenantTableNames.has(row.table_name)) continue;
    if (!tableMap.has(row.table_name)) {
      tableMap.set(row.table_name, []);
    }
    tableMap.get(row.table_name)!.push({
      name: row.column_name,
      dataType: mapPgType(row.data_type),
      isNullable: row.is_nullable === 'YES',
      isPrimaryKey: row.is_pk,
    });
  }

  // Step 4: Build TableInfo array
  const tables: TableInfo[] = [];
  for (const [tableName, cols] of tableMap) {
    tables.push({
      name: tableName,
      description: TABLE_DESCRIPTIONS[tableName] ?? tableName.replace(/_/g, ' '),
      columns: cols,
    });
  }

  // Sort tables alphabetically for consistent prompts
  tables.sort((a, b) => a.name.localeCompare(b.name));

  // Step 5: Build text representations
  const fullText = buildFullText(tables);
  const summaryText = buildSummaryText(tables);
  const tableNames = new Set(tables.map((t) => t.name));

  return { tables, fullText, summaryText, tableNames, builtAt: Date.now() };
}

function buildFullText(tables: TableInfo[]): string {
  const lines: string[] = [];
  for (const table of tables) {
    const tableColDescs = COLUMN_DESCRIPTIONS[table.name];
    const colDefs = table.columns.map((c) => {
      let def = `${c.name} ${c.dataType}`;
      if (c.isPrimaryKey) def += ' PK';
      if (!c.isNullable && !c.isPrimaryKey) def += ' NOT NULL';
      const desc = tableColDescs?.[c.name];
      if (desc) def += ` -- ${desc}`;
      return def;
    });
    lines.push(`## ${table.name} — ${table.description}`);
    lines.push(colDefs.join(', '));
    lines.push('');
  }
  return lines.join('\n');
}

function buildSummaryText(tables: TableInfo[]): string {
  return tables
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');
}

// ── Cache management ─────────────────────────────────────────────

export function invalidateSchemaCatalogCache(): void {
  _cache = null;
}

export function getSchemaCatalogCacheAge(): number | null {
  return _cache ? Date.now() - _cache.builtAt : null;
}
