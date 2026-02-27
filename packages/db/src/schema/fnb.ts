import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  index,
  uniqueIndex,
  jsonb,
  date,
  time,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { tenants, locations } from './core';
import { floorPlanRooms } from './room-layouts';

// ═══════════════════════════════════════════════════════════════════
// SESSION 1 — Table Management & Floor Plan Extension
// ═══════════════════════════════════════════════════════════════════

// ── F&B Tables (first-class entities from floor plan) ─────────────
export const fnbTables = pgTable(
  'fnb_tables',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    roomId: text('room_id')
      .notNull()
      .references(() => floorPlanRooms.id),
    sectionId: text('section_id'), // FK stub — populated in Session 2
    floorPlanObjectId: text('floor_plan_object_id'), // links to snapshot_json object
    tableNumber: integer('table_number').notNull(),
    displayLabel: text('display_label').notNull(),
    capacityMin: integer('capacity_min').notNull().default(1),
    capacityMax: integer('capacity_max').notNull(),
    tableType: text('table_type').notNull().default('standard'),
    shape: text('shape').notNull().default('square'),
    positionX: numeric('position_x', { precision: 10, scale: 2 }).notNull().default('0'),
    positionY: numeric('position_y', { precision: 10, scale: 2 }).notNull().default('0'),
    width: numeric('width', { precision: 10, scale: 2 }).notNull().default('0'),
    height: numeric('height', { precision: 10, scale: 2 }).notNull().default('0'),
    rotation: numeric('rotation', { precision: 6, scale: 2 }).notNull().default('0'),
    isCombinable: boolean('is_combinable').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('uq_fnb_tables_tenant_room_number').on(
      table.tenantId,
      table.roomId,
      table.tableNumber,
    ),
    index('idx_fnb_tables_tenant_room_active').on(
      table.tenantId,
      table.roomId,
      table.isActive,
    ),
    index('idx_fnb_tables_tenant_location').on(
      table.tenantId,
      table.locationId,
    ),
    index('idx_fnb_tables_section')
      .on(table.sectionId)
      .where(sql`section_id IS NOT NULL`),
  ],
);

// ── F&B Table Live Status ─────────────────────────────────────────
export const fnbTableLiveStatus = pgTable(
  'fnb_table_live_status',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tableId: text('table_id')
      .notNull()
      .references(() => fnbTables.id),
    status: text('status').notNull().default('available'),
    currentTabId: text('current_tab_id'), // FK stub — populated in Session 3
    currentServerUserId: text('current_server_user_id'),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    partySize: integer('party_size'),
    estimatedTurnTimeMinutes: integer('estimated_turn_time_minutes'),
    guestNames: text('guest_names'), // comma-separated for host stand
    waitlistEntryId: text('waitlist_entry_id'), // FK stub for waitlist
    combineGroupId: text('combine_group_id'), // FK to fnb_table_combine_groups
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_table_live_status_table').on(
      table.tenantId,
      table.tableId,
    ),
    index('idx_fnb_table_live_status_tenant_status').on(
      table.tenantId,
      table.status,
    ),
    index('idx_fnb_table_live_status_server')
      .on(table.tenantId, table.currentServerUserId)
      .where(sql`current_server_user_id IS NOT NULL`),
    index('idx_fnb_table_live_status_tab')
      .on(table.currentTabId)
      .where(sql`current_tab_id IS NOT NULL`),
  ],
);

// ── F&B Table Status History ──────────────────────────────────────
export const fnbTableStatusHistory = pgTable(
  'fnb_table_status_history',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tableId: text('table_id')
      .notNull()
      .references(() => fnbTables.id),
    oldStatus: text('old_status'),
    newStatus: text('new_status').notNull(),
    changedBy: text('changed_by'),
    partySize: integer('party_size'),
    serverUserId: text('server_user_id'),
    tabId: text('tab_id'),
    metadata: jsonb('metadata'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_table_status_history_table_changed').on(
      table.tenantId,
      table.tableId,
      table.changedAt,
    ),
    index('idx_fnb_table_status_history_tenant_changed').on(
      table.tenantId,
      table.changedAt,
    ),
  ],
);

// ── F&B Table Combine Groups ──────────────────────────────────────
export const fnbTableCombineGroups = pgTable(
  'fnb_table_combine_groups',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    status: text('status').notNull().default('active'),
    primaryTableId: text('primary_table_id')
      .notNull()
      .references(() => fnbTables.id),
    combinedCapacity: integer('combined_capacity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_fnb_combine_groups_tenant_location_status').on(
      table.tenantId,
      table.locationId,
      table.status,
    ),
  ],
);

// ── F&B Table Combine Members ─────────────────────────────────────
export const fnbTableCombineMembers = pgTable(
  'fnb_table_combine_members',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    combineGroupId: text('combine_group_id')
      .notNull()
      .references(() => fnbTableCombineGroups.id),
    tableId: text('table_id')
      .notNull()
      .references(() => fnbTables.id),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_combine_members_group_table').on(
      table.combineGroupId,
      table.tableId,
    ),
    index('idx_fnb_combine_members_table').on(table.tableId),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 2 — Server Sections & Shift Model
// ═══════════════════════════════════════════════════════════════════

// ── F&B Sections ──────────────────────────────────────────────────
export const fnbSections = pgTable(
  'fnb_sections',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    roomId: text('room_id')
      .notNull()
      .references(() => floorPlanRooms.id),
    name: text('name').notNull(),
    color: text('color'), // hex color for floor plan display
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('uq_fnb_sections_tenant_room_name').on(
      table.tenantId,
      table.roomId,
      table.name,
    ),
    index('idx_fnb_sections_tenant_location_active').on(
      table.tenantId,
      table.locationId,
      table.isActive,
    ),
  ],
);

// ── F&B Server Assignments ────────────────────────────────────────
export const fnbServerAssignments = pgTable(
  'fnb_server_assignments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    sectionId: text('section_id')
      .notNull()
      .references(() => fnbSections.id),
    serverUserId: text('server_user_id').notNull(),
    businessDate: date('business_date').notNull(),
    status: text('status').notNull().default('active'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    cutAt: timestamp('cut_at', { withTimezone: true }),
    cutBy: text('cut_by'),
    pickedUpBy: text('picked_up_by'), // user who took over
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_server_assignments_tenant_date_status').on(
      table.tenantId,
      table.businessDate,
      table.status,
    ),
    index('idx_fnb_server_assignments_server_date').on(
      table.tenantId,
      table.serverUserId,
      table.businessDate,
    ),
    index('idx_fnb_server_assignments_section_date').on(
      table.sectionId,
      table.businessDate,
    ),
  ],
);

// ── F&B My Section Tables ─────────────────────────────────────────
// Lightweight per-server, per-day table claims. Queries always filter by
// business_date so old rows are automatically invisible (no cleanup needed).
export const fnbMySectionTables = pgTable(
  'fnb_my_section_tables',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    roomId: text('room_id')
      .notNull()
      .references(() => floorPlanRooms.id),
    serverUserId: text('server_user_id').notNull(),
    tableId: text('table_id')
      .notNull()
      .references(() => fnbTables.id),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_my_section_tenant_table_date').on(
      table.tenantId,
      table.tableId,
      table.businessDate,
    ),
    index('idx_fnb_my_section_server_date').on(
      table.tenantId,
      table.serverUserId,
      table.businessDate,
    ),
    index('idx_fnb_my_section_room_date').on(
      table.tenantId,
      table.roomId,
      table.businessDate,
    ),
  ],
);

// ── F&B Shift Extensions ─────────────────────────────────────────
export const fnbShiftExtensions = pgTable(
  'fnb_shift_extensions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    employeeTimeEntryId: text('employee_time_entry_id').notNull(), // FK to employee_time_entries
    serverUserId: text('server_user_id').notNull(),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: date('business_date').notNull(),
    shiftStatus: text('shift_status').notNull().default('serving'),
    coversServed: integer('covers_served').notNull().default(0),
    totalSalesCents: integer('total_sales_cents').notNull().default(0),
    totalTipsCents: integer('total_tips_cents').notNull().default(0),
    openTabCount: integer('open_tab_count').notNull().default(0),
    cashOwedCents: integer('cash_owed_cents').notNull().default(0),
    cashDroppedCents: integer('cash_dropped_cents').notNull().default(0),
    checkoutCompletedAt: timestamp('checkout_completed_at', { withTimezone: true }),
    checkoutCompletedBy: text('checkout_completed_by'),
    sideworkChecklist: jsonb('sidework_checklist'), // V2 stub
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_shift_ext_time_entry').on(
      table.tenantId,
      table.employeeTimeEntryId,
    ),
    index('idx_fnb_shift_ext_server_date').on(
      table.tenantId,
      table.serverUserId,
      table.businessDate,
    ),
    index('idx_fnb_shift_ext_location_date_status').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.shiftStatus,
    ),
  ],
);

// ── F&B Rotation Tracker ──────────────────────────────────────────
export const fnbRotationTracker = pgTable(
  'fnb_rotation_tracker',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: date('business_date').notNull(),
    nextServerUserId: text('next_server_user_id').notNull(),
    rotationOrder: jsonb('rotation_order').notNull(), // string[] of user IDs
    lastSeatedAt: timestamp('last_seated_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_rotation_tracker_location_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 3 — Tabs, Checks & Seat Lifecycle
// ═══════════════════════════════════════════════════════════════════

// ── F&B Tabs ──────────────────────────────────────────────────────
export const fnbTabs = pgTable(
  'fnb_tabs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    tabNumber: integer('tab_number').notNull(),
    tabType: text('tab_type').notNull().default('dine_in'),
    status: text('status').notNull().default('open'),
    tableId: text('table_id').references(() => fnbTables.id),
    serverUserId: text('server_user_id').notNull(),
    openedBy: text('opened_by').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    partySize: integer('party_size'),
    guestName: text('guest_name'), // bar tab guest name
    primaryOrderId: text('primary_order_id'), // FK to orders — main order for this tab
    serviceType: text('service_type').notNull().default('dine_in'),
    currentCourseNumber: integer('current_course_number').notNull().default(1),
    businessDate: date('business_date').notNull(),
    customerId: text('customer_id'), // FK stub
    splitFromTabId: text('split_from_tab_id'), // if this was split from another tab
    splitStrategy: text('split_strategy'), // by_seat | by_item | equal_split | custom_amount
    transferredFromTabId: text('transferred_from_tab_id'),
    transferredFromServerUserId: text('transferred_from_server_user_id'),
    version: integer('version').notNull().default(1),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_tabs_location_date_number').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.tabNumber,
    ),
    index('idx_fnb_tabs_server_status').on(
      table.tenantId,
      table.serverUserId,
      table.status,
    ),
    index('idx_fnb_tabs_table')
      .on(table.tenantId, table.tableId)
      .where(sql`table_id IS NOT NULL`),
    index('idx_fnb_tabs_tenant_location_status').on(
      table.tenantId,
      table.locationId,
      table.status,
    ),
    index('idx_fnb_tabs_business_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
    index('idx_fnb_tabs_primary_order')
      .on(table.primaryOrderId)
      .where(sql`primary_order_id IS NOT NULL`),
  ],
);

// ── F&B Tab Number Counters ───────────────────────────────────────
export const fnbTabCounters = pgTable(
  'fnb_tab_counters',
  {
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (table) => [
    uniqueIndex('uq_fnb_tab_counters_pk').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

// ── F&B Tab Courses ───────────────────────────────────────────────
export const fnbTabCourses = pgTable(
  'fnb_tab_courses',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id')
      .notNull()
      .references(() => fnbTabs.id),
    courseNumber: integer('course_number').notNull(),
    courseName: text('course_name').notNull(),
    courseStatus: text('course_status').notNull().default('unsent'),
    firedAt: timestamp('fired_at', { withTimezone: true }),
    firedBy: text('fired_by'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_tab_courses_tab_number').on(
      table.tabId,
      table.courseNumber,
    ),
    index('idx_fnb_tab_courses_tab_status').on(
      table.tabId,
      table.courseStatus,
    ),
  ],
);

// ── F&B Tab Items (Line Items) ──────────────────────────────────
export const fnbTabItems = pgTable(
  'fnb_tab_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id')
      .notNull()
      .references(() => fnbTabs.id),
    catalogItemId: text('catalog_item_id').notNull(),
    catalogItemName: text('catalog_item_name').notNull(),
    seatNumber: integer('seat_number').notNull().default(1),
    courseNumber: integer('course_number').notNull().default(1),
    qty: numeric('quantity', { precision: 10, scale: 4 }).notNull().default('1'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    extendedPriceCents: integer('extended_price_cents').notNull(),
    modifiers: jsonb('modifiers').notNull().default([]),
    subDepartmentId: text('sub_department_id'),
    specialInstructions: text('special_instructions'),
    status: text('status').notNull().default('draft'), // draft | sent | fired | served | voided
    sentAt: timestamp('sent_at', { withTimezone: true }),
    firedAt: timestamp('fired_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_fnb_tab_items_tab_course').on(table.tabId, table.courseNumber),
    index('idx_fnb_tab_items_tab_seat').on(table.tabId, table.seatNumber),
    index('idx_fnb_tab_items_tenant_tab').on(table.tenantId, table.tabId),
    index('idx_fnb_tab_items_status').on(table.tabId, table.status),
  ],
);

// ── F&B Tab Transfers (Audit) ─────────────────────────────────────
export const fnbTabTransfers = pgTable(
  'fnb_tab_transfers',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id')
      .notNull()
      .references(() => fnbTabs.id),
    transferType: text('transfer_type').notNull(), // server | table | item_move
    fromServerUserId: text('from_server_user_id'),
    toServerUserId: text('to_server_user_id'),
    fromTableId: text('from_table_id'),
    toTableId: text('to_table_id'),
    orderLineIds: jsonb('order_line_ids'), // for item_move transfers
    reason: text('reason'),
    transferredBy: text('transferred_by').notNull(),
    transferredAt: timestamp('transferred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_tab_transfers_tab').on(table.tabId),
    index('idx_fnb_tab_transfers_tenant_transferred').on(
      table.tenantId,
      table.transferredAt,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 4 — Course Pacing, Hold/Fire & Kitchen Tickets
// ═══════════════════════════════════════════════════════════════════

// ── F&B Kitchen Tickets ───────────────────────────────────────────
export const fnbKitchenTickets = pgTable(
  'fnb_kitchen_tickets',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    tabId: text('tab_id')
      .notNull()
      .references(() => fnbTabs.id),
    orderId: text('order_id').notNull(), // FK to orders
    ticketNumber: integer('ticket_number').notNull(),
    courseNumber: integer('course_number'),
    status: text('status').notNull().default('pending'),
    businessDate: date('business_date').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    sentBy: text('sent_by').notNull(),
    tableNumber: integer('table_number'), // denormalized
    serverName: text('server_name'), // denormalized
    // KDS comprehensive settings (migration 0209)
    priorityLevel: integer('priority_level').notNull().default(0),
    isHeld: boolean('is_held').notNull().default(false),
    heldAt: timestamp('held_at', { withTimezone: true }),
    firedAt: timestamp('fired_at', { withTimezone: true }),
    firedBy: text('fired_by'),
    orderType: text('order_type'), // dine_in | takeout | delivery | bar
    channel: text('channel'), // pos | online | kiosk | third_party
    customerName: text('customer_name'),
    estimatedPickupAt: timestamp('estimated_pickup_at', { withTimezone: true }),
    bumpedAt: timestamp('bumped_at', { withTimezone: true }),
    bumpedBy: text('bumped_by'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_kitchen_tickets_location_date_number').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.ticketNumber,
    ),
    index('idx_fnb_kitchen_tickets_tab').on(table.tabId),
    index('idx_fnb_kitchen_tickets_status').on(
      table.tenantId,
      table.locationId,
      table.status,
    ),
    index('idx_fnb_kitchen_tickets_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

// ── F&B Kitchen Ticket Number Counters ────────────────────────────
export const fnbKitchenTicketCounters = pgTable(
  'fnb_kitchen_ticket_counters',
  {
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (table) => [
    uniqueIndex('uq_fnb_kitchen_ticket_counters_pk').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

// ── F&B Kitchen Ticket Items ──────────────────────────────────────
export const fnbKitchenTicketItems = pgTable(
  'fnb_kitchen_ticket_items',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => fnbKitchenTickets.id),
    orderLineId: text('order_line_id').notNull(), // FK to order_lines
    itemStatus: text('item_status').notNull().default('pending'),
    stationId: text('station_id'), // FK to fnb_kitchen_stations (Session 5)
    itemName: text('item_name').notNull(), // denormalized
    modifierSummary: text('modifier_summary'), // denormalized
    specialInstructions: text('special_instructions'),
    seatNumber: integer('seat_number'),
    courseName: text('course_name'),
    quantity: numeric('quantity', { precision: 10, scale: 4 }).notNull().default('1'),
    isRush: boolean('is_rush').notNull().default(false),
    isAllergy: boolean('is_allergy').notNull().default(false),
    isVip: boolean('is_vip').notNull().default(false),
    // KDS comprehensive settings (migration 0209)
    routingRuleId: text('routing_rule_id'),
    kitchenLabel: text('kitchen_label'),
    itemColor: text('item_color'),
    priorityLevel: integer('priority_level').notNull().default(0),
    estimatedPrepSeconds: integer('estimated_prep_seconds'),
    bumpedBy: text('bumped_by'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_ticket_items_ticket').on(table.ticketId),
    index('idx_fnb_ticket_items_station_status')
      .on(table.stationId, table.itemStatus)
      .where(sql`station_id IS NOT NULL`),
    index('idx_fnb_ticket_items_order_line').on(table.orderLineId),
  ],
);

// ── F&B Kitchen Routing Rules ─────────────────────────────────────
export const fnbKitchenRoutingRules = pgTable(
  'fnb_kitchen_routing_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    ruleType: text('rule_type').notNull().default('item'), // item | modifier | department
    catalogItemId: text('catalog_item_id'),
    modifierId: text('modifier_id'),
    departmentId: text('department_id'),
    subDepartmentId: text('sub_department_id'),
    stationId: text('station_id').notNull(), // FK to fnb_kitchen_stations
    priority: integer('priority').notNull().default(0),
    // KDS comprehensive settings (migration 0209)
    ruleName: text('rule_name'),
    categoryId: text('category_id'),
    orderTypeCondition: text('order_type_condition'),
    channelCondition: text('channel_condition'),
    timeConditionStart: text('time_condition_start'),
    timeConditionEnd: text('time_condition_end'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_routing_rules_item')
      .on(table.tenantId, table.locationId, table.catalogItemId)
      .where(sql`catalog_item_id IS NOT NULL`),
    index('idx_fnb_routing_rules_dept')
      .on(table.tenantId, table.locationId, table.departmentId)
      .where(sql`department_id IS NOT NULL`),
    index('idx_fnb_routing_rules_category')
      .on(table.tenantId, table.locationId, table.categoryId)
      .where(sql`category_id IS NOT NULL`),
    index('idx_fnb_routing_rules_station').on(table.stationId),
  ],
);

// ── F&B Kitchen Delta Chits ───────────────────────────────────────
export const fnbKitchenDeltaChits = pgTable(
  'fnb_kitchen_delta_chits',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => fnbKitchenTickets.id),
    deltaType: text('delta_type').notNull(), // add | void | modify | rush
    orderLineId: text('order_line_id').notNull(),
    itemName: text('item_name').notNull(),
    modifierSummary: text('modifier_summary'),
    seatNumber: integer('seat_number'),
    quantity: numeric('quantity', { precision: 10, scale: 4 }),
    reason: text('reason'),
    stationId: text('station_id'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_delta_chits_ticket').on(table.ticketId),
    index('idx_fnb_delta_chits_tenant_created').on(
      table.tenantId,
      table.createdAt,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 5 — KDS Stations & Expo
// ═══════════════════════════════════════════════════════════════════

// ── F&B Kitchen Stations ──────────────────────────────────────────
export const fnbKitchenStations = pgTable(
  'fnb_kitchen_stations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    stationType: text('station_type').notNull().default('prep'), // prep | expo | bar
    color: text('color'), // hex color for KDS display
    sortOrder: integer('sort_order').notNull().default(0),
    fallbackStationId: text('fallback_station_id'), // self-ref FK
    backupPrinterId: text('backup_printer_id'), // FK to printers
    terminalLocationId: text('terminal_location_id'), // FK to terminal_locations
    warningThresholdSeconds: integer('warning_threshold_seconds').notNull().default(480),
    criticalThresholdSeconds: integer('critical_threshold_seconds').notNull().default(720),
    // KDS comprehensive settings (migration 0209)
    infoThresholdSeconds: integer('info_threshold_seconds').notNull().default(300),
    autoBumpOnAllReady: boolean('auto_bump_on_all_ready').notNull().default(false),
    screenCommunicationMode: text('screen_communication_mode').notNull().default('independent'),
    assemblyLineOrder: integer('assembly_line_order'),
    pauseReceiving: boolean('pause_receiving').notNull().default(false),
    supervisedByExpoId: text('supervised_by_expo_id'),
    showOtherStationItems: boolean('show_other_station_items').notNull().default(false),
    allowedOrderTypes: text('allowed_order_types').array().notNull().default(sql`'{}'`),
    allowedChannels: text('allowed_channels').array().notNull().default(sql`'{}'`),
    estimatedPrepSeconds: integer('estimated_prep_seconds'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_kitchen_stations_tenant_location_name').on(
      table.tenantId,
      table.locationId,
      table.name,
    ),
    index('idx_fnb_kitchen_stations_tenant_location_active').on(
      table.tenantId,
      table.locationId,
      table.isActive,
    ),
  ],
);

// ── F&B Station Display Configs ───────────────────────────────────
export const fnbStationDisplayConfigs = pgTable(
  'fnb_station_display_configs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    stationId: text('station_id')
      .notNull()
      .references(() => fnbKitchenStations.id),
    displayDeviceId: text('display_device_id'), // tablet/screen identifier
    displayMode: text('display_mode').notNull().default('standard'), // standard | compact | expo
    columnsPerRow: integer('columns_per_row').notNull().default(4),
    sortBy: text('sort_by').notNull().default('time'), // time | priority | course
    showModifiers: boolean('show_modifiers').notNull().default(true),
    showSeatNumbers: boolean('show_seat_numbers').notNull().default(true),
    showCourseHeaders: boolean('show_course_headers').notNull().default(true),
    autoScrollEnabled: boolean('auto_scroll_enabled').notNull().default(false),
    soundAlertEnabled: boolean('sound_alert_enabled').notNull().default(true),
    // KDS comprehensive settings (migration 0209)
    viewMode: text('view_mode').notNull().default('ticket'),
    theme: text('theme').notNull().default('dark'),
    fontSize: text('font_size').notNull().default('medium'),
    ticketSize: text('ticket_size').notNull().default('medium'),
    showServerName: boolean('show_server_name').notNull().default(true),
    showDiningOption: boolean('show_dining_option').notNull().default(true),
    showOrderSource: boolean('show_order_source').notNull().default(false),
    showSpecialInstructions: boolean('show_special_instructions').notNull().default(true),
    showAllergenWarnings: boolean('show_allergen_warnings').notNull().default(true),
    showItemColors: boolean('show_item_colors').notNull().default(true),
    consolidateIdenticalItems: boolean('consolidate_identical_items').notNull().default(false),
    showPaymentStatus: boolean('show_payment_status').notNull().default(false),
    modifierDisplayMode: text('modifier_display_mode').notNull().default('vertical'),
    orientation: text('orientation').notNull().default('landscape'),
    allDaySummaryEnabled: boolean('all_day_summary_enabled').notNull().default(false),
    allDayMaxItems: integer('all_day_max_items').notNull().default(30),
    showPrepTimeEstimate: boolean('show_prep_time_estimate').notNull().default(true),
    showCourseStatus: boolean('show_course_status').notNull().default(true),
    flashOnNewTicket: boolean('flash_on_new_ticket').notNull().default(true),
    flashOnModification: boolean('flash_on_modification').notNull().default(true),
    autoBumpOnPayment: boolean('auto_bump_on_payment').notNull().default(false),
    inputMode: text('input_mode').notNull().default('touch'),
    bumpBarProfileId: text('bump_bar_profile_id'),
    alertProfileId: text('alert_profile_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_station_display_configs_station').on(table.stationId),
  ],
);

// ── F&B Station Metrics Snapshot ──────────────────────────────────
export const fnbStationMetricsSnapshot = pgTable(
  'fnb_station_metrics_snapshot',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    stationId: text('station_id')
      .notNull()
      .references(() => fnbKitchenStations.id),
    businessDate: date('business_date').notNull(),
    ticketsProcessed: integer('tickets_processed').notNull().default(0),
    avgTicketTimeSeconds: integer('avg_ticket_time_seconds'),
    itemsBumped: integer('items_bumped').notNull().default(0),
    itemsVoided: integer('items_voided').notNull().default(0),
    ticketsPastThreshold: integer('tickets_past_threshold').notNull().default(0),
    peakHour: integer('peak_hour'), // 0-23
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_station_metrics_station_date').on(
      table.stationId,
      table.businessDate,
    ),
    index('idx_fnb_station_metrics_tenant_date').on(
      table.tenantId,
      table.businessDate,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// KDS Comprehensive Settings (Migration 0209)
// ═══════════════════════════════════════════════════════════════════

// ── F&B KDS Bump Bar Profiles ─────────────────────────────────────
export const fnbKdsBumpBarProfiles = pgTable(
  'fnb_kds_bump_bar_profiles',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .references(() => locations.id),
    profileName: text('profile_name').notNull(),
    buttonCount: integer('button_count').notNull().default(10),
    keyMappings: jsonb('key_mappings').notNull().default(sql`'[]'`), // BumpBarKeyMapping[]
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_bump_bar_profiles_tenant').on(table.tenantId, table.isActive),
    uniqueIndex('uq_fnb_bump_bar_profiles_tenant_name').on(table.tenantId, table.profileName),
  ],
);

// ── F&B KDS Alert Profiles ───────────────────────────────────────
export const fnbKdsAlertProfiles = pgTable(
  'fnb_kds_alert_profiles',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .references(() => locations.id),
    profileName: text('profile_name').notNull(),
    newTicketAlert: jsonb('new_ticket_alert'), // { tone, volume, flash }
    warningAlert: jsonb('warning_alert'),
    criticalAlert: jsonb('critical_alert'),
    rushAlert: jsonb('rush_alert'),
    allergyAlert: jsonb('allergy_alert'),
    modificationAlert: jsonb('modification_alert'),
    completeAlert: jsonb('complete_alert'),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_alert_profiles_tenant').on(table.tenantId, table.isActive),
    uniqueIndex('uq_fnb_alert_profiles_tenant_name').on(table.tenantId, table.profileName),
  ],
);

// ── F&B KDS Performance Targets ──────────────────────────────────
export const fnbKdsPerformanceTargets = pgTable(
  'fnb_kds_performance_targets',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .references(() => locations.id),
    stationId: text('station_id')
      .references(() => fnbKitchenStations.id),
    orderType: text('order_type'), // dine_in | takeout | delivery | bar | null (all)
    targetPrepSeconds: integer('target_prep_seconds').notNull(),
    warningPrepSeconds: integer('warning_prep_seconds').notNull(),
    criticalPrepSeconds: integer('critical_prep_seconds').notNull(),
    speedOfServiceGoalSeconds: integer('speed_of_service_goal_seconds'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_perf_targets_station').on(table.tenantId, table.stationId),
  ],
);

// ── F&B KDS Item Prep Times ──────────────────────────────────────
export const fnbKdsItemPrepTimes = pgTable(
  'fnb_kds_item_prep_times',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    catalogItemId: text('catalog_item_id').notNull(),
    stationId: text('station_id')
      .references(() => fnbKitchenStations.id),
    estimatedPrepSeconds: integer('estimated_prep_seconds').notNull().default(300),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_item_prep_times_item').on(table.tenantId, table.catalogItemId),
    index('idx_fnb_item_prep_times_station').on(table.tenantId, table.stationId),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 6 — Modifiers, 86 Board & Menu Availability
// ═══════════════════════════════════════════════════════════════════

// ── F&B 86 Log ────────────────────────────────────────────────────
export const fnbEightySixLog = pgTable(
  'fnb_eighty_six_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    entityType: text('entity_type').notNull(), // item | modifier
    entityId: text('entity_id').notNull(), // catalog_item_id or modifier_id
    stationId: text('station_id'), // per-station 86 (null = global)
    reason: text('reason'),
    eightySixedAt: timestamp('eighty_sixed_at', { withTimezone: true }).notNull().defaultNow(),
    eightySixedBy: text('eighty_sixed_by').notNull(),
    restoredAt: timestamp('restored_at', { withTimezone: true }),
    restoredBy: text('restored_by'),
    autoRestoreAtDayEnd: boolean('auto_restore_at_day_end').notNull().default(true),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_86_log_active').on(
      table.tenantId,
      table.locationId,
      table.entityType,
      table.entityId,
    ),
    index('idx_fnb_86_log_tenant_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

// ── F&B Menu Periods ──────────────────────────────────────────────
export const fnbMenuPeriods = pgTable(
  'fnb_menu_periods',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    name: text('name').notNull(), // Breakfast, Lunch, Dinner, Late Night
    startTime: text('start_time').notNull(), // HH:MM (24h)
    endTime: text('end_time').notNull(), // HH:MM (24h)
    daysOfWeek: jsonb('days_of_week').notNull(), // number[] (0=Sun, 6=Sat)
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_menu_periods_location_name').on(
      table.tenantId,
      table.locationId,
      table.name,
    ),
    index('idx_fnb_menu_periods_location_active').on(
      table.tenantId,
      table.locationId,
      table.isActive,
    ),
  ],
);

// ── F&B Menu Availability Windows ─────────────────────────────────
export const fnbMenuAvailabilityWindows = pgTable(
  'fnb_menu_availability_windows',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    entityType: text('entity_type').notNull(), // item | category
    entityId: text('entity_id').notNull(),
    menuPeriodId: text('menu_period_id')
      .references(() => fnbMenuPeriods.id),
    startDate: date('start_date'), // seasonal — null means always
    endDate: date('end_date'),
    hideWhenUnavailable: boolean('hide_when_unavailable').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_availability_entity').on(
      table.tenantId,
      table.locationId,
      table.entityType,
      table.entityId,
    ),
    index('idx_fnb_availability_period')
      .on(table.menuPeriodId)
      .where(sql`menu_period_id IS NOT NULL`),
  ],
);

// ── F&B Allergen Definitions ──────────────────────────────────────
export const fnbAllergenDefinitions = pgTable(
  'fnb_allergen_definitions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
    icon: text('icon'), // allergen icon identifier
    severity: text('severity').notNull().default('standard'), // standard | severe
    isSystem: boolean('is_system').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_allergen_definitions_tenant_name').on(
      table.tenantId,
      table.name,
    ),
  ],
);

// ── F&B Item Allergens ────────────────────────────────────────────
export const fnbItemAllergens = pgTable(
  'fnb_item_allergens',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    catalogItemId: text('catalog_item_id').notNull(),
    allergenId: text('allergen_id')
      .notNull()
      .references(() => fnbAllergenDefinitions.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_item_allergens_item_allergen').on(
      table.catalogItemId,
      table.allergenId,
    ),
    index('idx_fnb_item_allergens_item').on(table.tenantId, table.catalogItemId),
  ],
);

// ── F&B Prep Note Presets ─────────────────────────────────────────
export const fnbPrepNotePresets = pgTable(
  'fnb_prep_note_presets',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .references(() => locations.id), // null = global for tenant
    catalogItemId: text('catalog_item_id'), // null = global preset
    noteText: text('note_text').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_prep_note_presets_tenant_location').on(
      table.tenantId,
      table.locationId,
    ),
    index('idx_fnb_prep_note_presets_item')
      .on(table.tenantId, table.catalogItemId)
      .where(sql`catalog_item_id IS NOT NULL`),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 7 — Split Checks, Merged Tabs & Payment Flows
// ═══════════════════════════════════════════════════════════════════

// ── F&B Auto Gratuity Rules ───────────────────────────────────────
export const fnbAutoGratuityRules = pgTable(
  'fnb_auto_gratuity_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .references(() => locations.id), // null = tenant-wide
    name: text('name').notNull(),
    partySizeThreshold: integer('party_size_threshold').notNull(),
    gratuityPercentage: numeric('gratuity_percentage', { precision: 5, scale: 2 }).notNull(),
    isTaxable: boolean('is_taxable').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_auto_gratuity_tenant_location').on(
      table.tenantId,
      table.locationId,
    ),
  ],
);

// ── F&B Payment Sessions ──────────────────────────────────────────
export const fnbPaymentSessions = pgTable(
  'fnb_payment_sessions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id')
      .notNull()
      .references(() => fnbTabs.id),
    orderId: text('order_id').notNull(), // FK to orders
    status: text('status').notNull().default('pending'), // pending | in_progress | completed | failed
    checkPresentedAt: timestamp('check_presented_at', { withTimezone: true }),
    checkPresentedBy: text('check_presented_by'),
    splitStrategy: text('split_strategy'), // by_seat | by_item | equal_split | custom_amount | null (no split)
    splitDetails: jsonb('split_details'), // split-specific config
    totalAmountCents: integer('total_amount_cents').notNull(),
    paidAmountCents: integer('paid_amount_cents').notNull().default(0),
    remainingAmountCents: integer('remaining_amount_cents').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_payment_sessions_tab').on(table.tabId),
    index('idx_fnb_payment_sessions_order').on(table.orderId),
    index('idx_fnb_payment_sessions_status').on(
      table.tenantId,
      table.status,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 8 — Pre-Auth Bar Tabs & Card-on-File
// ═══════════════════════════════════════════════════════════════════

// ── F&B Tab Pre-Auths ─────────────────────────────────────────────
export const fnbTabPreauths = pgTable(
  'fnb_tab_preauths',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id')
      .notNull()
      .references(() => fnbTabs.id),
    status: text('status').notNull().default('authorized'), // authorized | captured | adjusted | finalized | voided | expired
    authAmountCents: integer('auth_amount_cents').notNull(),
    capturedAmountCents: integer('captured_amount_cents'),
    tipAmountCents: integer('tip_amount_cents'),
    finalAmountCents: integer('final_amount_cents'),
    cardToken: text('card_token').notNull(), // encrypted reference from payment processor
    cardLast4: text('card_last4').notNull(),
    cardBrand: text('card_brand'),
    providerRef: text('provider_ref'), // payment processor reference
    authorizedAt: timestamp('authorized_at', { withTimezone: true }).notNull().defaultNow(),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    adjustedAt: timestamp('adjusted_at', { withTimezone: true }),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isWalkout: boolean('is_walkout').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_tab_preauths_tab').on(table.tabId),
    index('idx_fnb_tab_preauths_status').on(
      table.tenantId,
      table.status,
    ),
  ],
);

// ── F&B Tip Adjustments ───────────────────────────────────────────
export const fnbTipAdjustments = pgTable(
  'fnb_tip_adjustments',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id')
      .notNull()
      .references(() => fnbTabs.id),
    preauthId: text('preauth_id')
      .references(() => fnbTabPreauths.id),
    tenderId: text('tender_id'), // FK to tenders
    originalTipCents: integer('original_tip_cents').notNull().default(0),
    adjustedTipCents: integer('adjusted_tip_cents').notNull(),
    adjustmentReason: text('adjustment_reason'),
    adjustedBy: text('adjusted_by').notNull(),
    adjustedAt: timestamp('adjusted_at', { withTimezone: true }).notNull().defaultNow(),
    isFinal: boolean('is_final').notNull().default(false),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_tip_adjustments_tab').on(table.tabId),
    index('idx_fnb_tip_adjustments_tenant_adjusted').on(
      table.tenantId,
      table.adjustedAt,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 9 — Tips, Tip Pooling & Gratuity Rules
// ═══════════════════════════════════════════════════════════════════

// ── F&B Tip Pools ─────────────────────────────────────────────────
export const fnbTipPools = pgTable(
  'fnb_tip_pools',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    name: text('name').notNull(),
    poolType: text('pool_type').notNull(), // full | percentage | points
    poolScope: text('pool_scope').notNull().default('daily'), // shift | daily | location
    percentageToPool: numeric('percentage_to_pool', { precision: 5, scale: 2 }),
    distributionMethod: text('distribution_method').notNull().default('hours'), // hours | points | equal
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_tip_pools_tenant_location').on(
      table.tenantId,
      table.locationId,
    ),
  ],
);

// ── F&B Tip Pool Participants ─────────────────────────────────────
export const fnbTipPoolParticipants = pgTable(
  'fnb_tip_pool_participants',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    poolId: text('pool_id')
      .notNull()
      .references(() => fnbTipPools.id),
    roleId: text('role_id').notNull(), // FK to roles
    pointsValue: integer('points_value').notNull().default(10),
    isContributor: boolean('is_contributor').notNull().default(true),
    isRecipient: boolean('is_recipient').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_tip_pool_participants_pool_role').on(
      table.poolId,
      table.roleId,
    ),
  ],
);

// ── F&B Tip Pool Distributions ────────────────────────────────────
export const fnbTipPoolDistributions = pgTable(
  'fnb_tip_pool_distributions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    poolId: text('pool_id')
      .notNull()
      .references(() => fnbTipPools.id),
    businessDate: date('business_date').notNull(),
    totalPoolAmountCents: integer('total_pool_amount_cents').notNull(),
    distributionDetails: jsonb('distribution_details').notNull(), // { employeeId, hoursWorked, points, amountCents }[]
    distributedAt: timestamp('distributed_at', { withTimezone: true }).notNull().defaultNow(),
    distributedBy: text('distributed_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_tip_pool_distributions_pool_date').on(
      table.poolId,
      table.businessDate,
    ),
    index('idx_fnb_tip_pool_distributions_tenant_date').on(
      table.tenantId,
      table.businessDate,
    ),
  ],
);

// ── F&B Tip Declarations ──────────────────────────────────────────
export const fnbTipDeclarations = pgTable(
  'fnb_tip_declarations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    serverUserId: text('server_user_id').notNull(),
    businessDate: date('business_date').notNull(),
    cashTipsDeclaredCents: integer('cash_tips_declared_cents').notNull(),
    cashSalesCents: integer('cash_sales_cents').notNull().default(0),
    declarationPercentage: numeric('declaration_percentage', { precision: 5, scale: 2 }),
    meetsMinimumThreshold: boolean('meets_minimum_threshold').notNull().default(true),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_tip_declarations_server_date').on(
      table.tenantId,
      table.serverUserId,
      table.businessDate,
    ),
    index('idx_fnb_tip_declarations_tenant_date').on(
      table.tenantId,
      table.businessDate,
    ),
  ],
);

// ── F&B Tip Out Entries ───────────────────────────────────────────
export const fnbTipOutEntries = pgTable(
  'fnb_tip_out_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    fromServerUserId: text('from_server_user_id').notNull(),
    toEmployeeId: text('to_employee_id').notNull(),
    toRoleName: text('to_role_name'), // denormalized for reporting
    businessDate: date('business_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    calculationMethod: text('calculation_method').notNull(), // fixed | percentage_of_tips | percentage_of_sales
    calculationBasis: text('calculation_basis'), // the base amount description
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_tip_out_from_server_date').on(
      table.tenantId,
      table.fromServerUserId,
      table.businessDate,
    ),
    index('idx_fnb_tip_out_to_employee_date').on(
      table.tenantId,
      table.toEmployeeId,
      table.businessDate,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 10 — Close Batch, Z-Report & Cash Control
// ═══════════════════════════════════════════════════════════════════

// ── F&B Close Batches ─────────────────────────────────────────────
export const fnbCloseBatches = pgTable(
  'fnb_close_batches',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    businessDate: date('business_date').notNull(),
    status: text('status').notNull().default('open'), // open | in_progress | reconciled | posted | locked
    startedAt: timestamp('started_at', { withTimezone: true }),
    startedBy: text('started_by'),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    reconciledBy: text('reconciled_by'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: text('posted_by'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    glJournalEntryId: text('gl_journal_entry_id'), // FK to gl_journal_entries
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_close_batches_location_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
    index('idx_fnb_close_batches_status').on(
      table.tenantId,
      table.status,
    ),
  ],
);

// ── F&B Close Batch Summaries ─────────────────────────────────────
export const fnbCloseBatchSummaries = pgTable(
  'fnb_close_batch_summaries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    closeBatchId: text('close_batch_id')
      .notNull()
      .references(() => fnbCloseBatches.id),
    // Z-Report data
    grossSalesCents: integer('gross_sales_cents').notNull().default(0),
    netSalesCents: integer('net_sales_cents').notNull().default(0),
    taxCollectedCents: integer('tax_collected_cents').notNull().default(0),
    tipsCreditCents: integer('tips_credit_cents').notNull().default(0),
    tipsCashDeclaredCents: integer('tips_cash_declared_cents').notNull().default(0),
    serviceChargesCents: integer('service_charges_cents').notNull().default(0),
    discountsCents: integer('discounts_cents').notNull().default(0),
    compsCents: integer('comps_cents').notNull().default(0),
    voidsCents: integer('voids_cents').notNull().default(0),
    voidsCount: integer('voids_count').notNull().default(0),
    discountsCount: integer('discounts_count').notNull().default(0),
    compsCount: integer('comps_count').notNull().default(0),
    coversCount: integer('covers_count').notNull().default(0),
    avgCheckCents: integer('avg_check_cents').notNull().default(0),
    // Payment breakdown
    tenderBreakdown: jsonb('tender_breakdown').notNull(), // { tenderType, count, totalCents }[]
    salesByDepartment: jsonb('sales_by_department'), // { departmentId, name, totalCents }[]
    taxByGroup: jsonb('tax_by_group'), // { taxGroupId, name, totalCents }[]
    // Cash accountability
    cashStartingFloatCents: integer('cash_starting_float_cents').notNull().default(0),
    cashSalesCents: integer('cash_sales_cents').notNull().default(0),
    cashTipsCents: integer('cash_tips_cents').notNull().default(0),
    cashDropsCents: integer('cash_drops_cents').notNull().default(0),
    cashPaidOutsCents: integer('cash_paid_outs_cents').notNull().default(0),
    cashExpectedCents: integer('cash_expected_cents').notNull().default(0),
    cashCountedCents: integer('cash_counted_cents'),
    cashOverShortCents: integer('cash_over_short_cents'),
    salesBySubDepartment: jsonb('sales_by_sub_department'),
    categoryVersion: integer('category_version').default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_close_batch_summaries_batch').on(table.closeBatchId),
  ],
);

// ── F&B Server Checkouts ──────────────────────────────────────────
export const fnbServerCheckouts = pgTable(
  'fnb_server_checkouts',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    closeBatchId: text('close_batch_id')
      .notNull()
      .references(() => fnbCloseBatches.id),
    serverUserId: text('server_user_id').notNull(),
    businessDate: date('business_date').notNull(),
    status: text('status').notNull().default('pending'), // pending | completed
    totalSalesCents: integer('total_sales_cents').notNull().default(0),
    cashCollectedCents: integer('cash_collected_cents').notNull().default(0),
    creditTipsCents: integer('credit_tips_cents').notNull().default(0),
    cashTipsDeclaredCents: integer('cash_tips_declared_cents').notNull().default(0),
    tipOutPaidCents: integer('tip_out_paid_cents').notNull().default(0),
    cashOwedToHouseCents: integer('cash_owed_to_house_cents').notNull().default(0),
    openTabCount: integer('open_tab_count').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: text('completed_by'),
    signature: text('signature'), // base64 signature image
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_server_checkouts_batch_server').on(
      table.closeBatchId,
      table.serverUserId,
    ),
    index('idx_fnb_server_checkouts_tenant_date').on(
      table.tenantId,
      table.businessDate,
    ),
  ],
);

// ── F&B Cash Drops ────────────────────────────────────────────────
export const fnbCashDrops = pgTable(
  'fnb_cash_drops',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    closeBatchId: text('close_batch_id')
      .references(() => fnbCloseBatches.id),
    amountCents: integer('amount_cents').notNull(),
    employeeId: text('employee_id').notNull(),
    terminalId: text('terminal_id'),
    businessDate: date('business_date').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_cash_drops_batch')
      .on(table.closeBatchId)
      .where(sql`close_batch_id IS NOT NULL`),
    index('idx_fnb_cash_drops_tenant_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

// ── F&B Cash Paid Outs ────────────────────────────────────────────
export const fnbCashPaidOuts = pgTable(
  'fnb_cash_paid_outs',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    closeBatchId: text('close_batch_id')
      .references(() => fnbCloseBatches.id),
    amountCents: integer('amount_cents').notNull(),
    reason: text('reason').notNull(),
    vendorName: text('vendor_name'),
    employeeId: text('employee_id').notNull(),
    approvedBy: text('approved_by'),
    businessDate: date('business_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_cash_paid_outs_batch')
      .on(table.closeBatchId)
      .where(sql`close_batch_id IS NOT NULL`),
    index('idx_fnb_cash_paid_outs_tenant_date').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

// ── F&B Deposit Slips ─────────────────────────────────────────────
export const fnbDepositSlips = pgTable(
  'fnb_deposit_slips',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    closeBatchId: text('close_batch_id')
      .notNull()
      .references(() => fnbCloseBatches.id),
    depositAmountCents: integer('deposit_amount_cents').notNull(),
    depositDate: date('deposit_date').notNull(),
    bankReference: text('bank_reference'),
    verifiedBy: text('verified_by'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_deposit_slips_batch').on(table.closeBatchId),
    index('idx_fnb_deposit_slips_tenant_date').on(
      table.tenantId,
      table.depositDate,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 44 — F&B GL Account Mappings
// ═══════════════════════════════════════════════════════════════════

export const fnbGlAccountMappings = pgTable(
  'fnb_gl_account_mappings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    entityType: text('entity_type').notNull(), // 'department', 'sub_department', 'discount', 'comp', 'cash_over_short', etc.
    entityId: text('entity_id').notNull(), // specific ID or 'default'
    revenueAccountId: text('revenue_account_id'),
    expenseAccountId: text('expense_account_id'),
    liabilityAccountId: text('liability_account_id'),
    assetAccountId: text('asset_account_id'),
    contraRevenueAccountId: text('contra_revenue_account_id'),
    memo: text('memo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_gl_mappings').on(
      table.tenantId,
      table.locationId,
      table.entityType,
      table.entityId,
    ),
    index('idx_fnb_gl_mappings_tenant_location').on(table.tenantId, table.locationId),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 13 — Real-Time Sync, Concurrency & Offline
// ═══════════════════════════════════════════════════════════════════

// ── F&B Soft Locks ────────────────────────────────────────────────
export const fnbSoftLocks = pgTable(
  'fnb_soft_locks',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    entityType: text('entity_type').notNull(), // tab | table | ticket
    entityId: text('entity_id').notNull(),
    lockedBy: text('locked_by').notNull(),
    terminalId: text('terminal_id'),
    lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_soft_locks_entity').on(
      table.tenantId,
      table.entityType,
      table.entityId,
    ),
    index('idx_fnb_soft_locks_expires').on(table.expiresAt),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 14 — Receipts, Printer Routing & Chit Design
// ═══════════════════════════════════════════════════════════════════

// ── F&B Print Routing Rules ───────────────────────────────────────
export const fnbPrintRoutingRules = pgTable(
  'fnb_print_routing_rules',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    stationId: text('station_id')
      .references(() => fnbKitchenStations.id),
    printerId: text('printer_id').notNull(), // FK to printers
    printJobType: text('print_job_type').notNull(), // kitchen_chit | bar_chit | delta_chit | expo_chit | guest_check | receipt
    priority: integer('priority').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_print_routing_station')
      .on(table.stationId)
      .where(sql`station_id IS NOT NULL`),
    index('idx_fnb_print_routing_location_type').on(
      table.tenantId,
      table.locationId,
      table.printJobType,
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// SESSION 15 — F&B Reporting Read Models
// ═══════════════════════════════════════════════════════════════════

// ── rm_fnb_server_performance ─────────────────────────────────────
export const rmFnbServerPerformance = pgTable(
  'rm_fnb_server_performance',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    serverUserId: text('server_user_id').notNull(),
    businessDate: date('business_date').notNull(),
    covers: integer('covers').notNull().default(0),
    totalSales: numeric('total_sales', { precision: 19, scale: 4 }).notNull().default('0'),
    avgCheck: numeric('avg_check', { precision: 19, scale: 4 }).notNull().default('0'),
    tipTotal: numeric('tip_total', { precision: 19, scale: 4 }).notNull().default('0'),
    tipPercentage: numeric('tip_percentage', { precision: 5, scale: 2 }),
    tablesTurned: integer('tables_turned').notNull().default(0),
    avgTurnTimeMinutes: integer('avg_turn_time_minutes'),
    comps: numeric('comps', { precision: 19, scale: 4 }).notNull().default('0'),
    voids: numeric('voids', { precision: 19, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_fnb_server_perf').on(
      table.tenantId,
      table.locationId,
      table.serverUserId,
      table.businessDate,
    ),
    index('idx_rm_fnb_server_perf_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_fnb_table_turns ────────────────────────────────────────────
export const rmFnbTableTurns = pgTable(
  'rm_fnb_table_turns',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    tableId: text('table_id').notNull(),
    businessDate: date('business_date').notNull(),
    turnsCount: integer('turns_count').notNull().default(0),
    avgPartySize: numeric('avg_party_size', { precision: 5, scale: 2 }),
    avgTurnTimeMinutes: integer('avg_turn_time_minutes'),
    avgCheckCents: integer('avg_check_cents'),
    totalRevenueCents: integer('total_revenue_cents').notNull().default(0),
    peakHourTurns: jsonb('peak_hour_turns'), // { hour: number, turns: number }[]
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_fnb_table_turns').on(
      table.tenantId,
      table.locationId,
      table.tableId,
      table.businessDate,
    ),
    index('idx_rm_fnb_table_turns_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_fnb_kitchen_performance ────────────────────────────────────
export const rmFnbKitchenPerformance = pgTable(
  'rm_fnb_kitchen_performance',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    stationId: text('station_id').notNull(),
    businessDate: date('business_date').notNull(),
    ticketsProcessed: integer('tickets_processed').notNull().default(0),
    avgTicketTimeSeconds: integer('avg_ticket_time_seconds'),
    itemsBumped: integer('items_bumped').notNull().default(0),
    itemsVoided: integer('items_voided').notNull().default(0),
    ticketsPastThreshold: integer('tickets_past_threshold').notNull().default(0),
    peakHour: integer('peak_hour'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_fnb_kitchen_perf').on(
      table.tenantId,
      table.locationId,
      table.stationId,
      table.businessDate,
    ),
    index('idx_rm_fnb_kitchen_perf_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_fnb_daypart_sales ──────────────────────────────────────────
export const rmFnbDaypartSales = pgTable(
  'rm_fnb_daypart_sales',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    daypart: text('daypart').notNull(), // breakfast | lunch | dinner | late_night
    covers: integer('covers').notNull().default(0),
    orderCount: integer('order_count').notNull().default(0),
    grossSales: numeric('gross_sales', { precision: 19, scale: 4 }).notNull().default('0'),
    netSales: numeric('net_sales', { precision: 19, scale: 4 }).notNull().default('0'),
    avgCheck: numeric('avg_check', { precision: 19, scale: 4 }).notNull().default('0'),
    topItemsJson: jsonb('top_items_json'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_fnb_daypart_sales').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.daypart,
    ),
    index('idx_rm_fnb_daypart_sales_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_fnb_menu_mix ───────────────────────────────────────────────
export const rmFnbMenuMix = pgTable(
  'rm_fnb_menu_mix',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    catalogItemId: text('catalog_item_id').notNull(),
    catalogItemName: text('catalog_item_name').notNull(),
    categoryName: text('category_name'),
    departmentName: text('department_name'),
    quantitySold: numeric('quantity_sold', { precision: 10, scale: 4 }).notNull().default('0'),
    percentageOfTotalItems: numeric('percentage_of_total_items', { precision: 5, scale: 2 }),
    revenue: numeric('revenue', { precision: 19, scale: 4 }).notNull().default('0'),
    percentageOfTotalRevenue: numeric('percentage_of_total_revenue', { precision: 5, scale: 2 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_fnb_menu_mix').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.catalogItemId,
    ),
    index('idx_rm_fnb_menu_mix_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_fnb_discount_comp_analysis ─────────────────────────────────
export const rmFnbDiscountCompAnalysis = pgTable(
  'rm_fnb_discount_comp_analysis',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    totalDiscounts: numeric('total_discounts', { precision: 19, scale: 4 }).notNull().default('0'),
    discountByType: jsonb('discount_by_type'),
    totalComps: numeric('total_comps', { precision: 19, scale: 4 }).notNull().default('0'),
    compByReason: jsonb('comp_by_reason'),
    voidCount: integer('void_count').notNull().default(0),
    voidByReason: jsonb('void_by_reason'),
    discountAsPctOfSales: numeric('discount_as_pct_of_sales', { precision: 5, scale: 2 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_fnb_discount_comp').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
    ),
    index('idx_rm_fnb_discount_comp_date').on(table.tenantId, table.businessDate),
  ],
);

// ── rm_fnb_hourly_sales ───────────────────────────────────────────
export const rmFnbHourlySales = pgTable(
  'rm_fnb_hourly_sales',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull(),
    locationId: text('location_id').notNull(),
    businessDate: date('business_date').notNull(),
    hour: integer('hour').notNull(), // 0-23
    covers: integer('covers').notNull().default(0),
    orderCount: integer('order_count').notNull().default(0),
    salesCents: integer('sales_cents').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_rm_fnb_hourly_sales').on(
      table.tenantId,
      table.locationId,
      table.businessDate,
      table.hour,
    ),
    index('idx_rm_fnb_hourly_sales_date').on(table.tenantId, table.businessDate),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// TIER 3 PROVISIONING — Future Competitive Differentiators (Schema Only)
// ═══════════════════════════════════════════════════════════════════

// ── 9A: QR Code Pay-at-Table ────────────────────────────────────
export const fnbQrPaymentRequests = pgTable(
  'fnb_qr_payment_requests',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id').notNull(),
    sessionId: text('session_id').notNull(),
    qrToken: text('qr_token').notNull(),
    status: text('status').notNull().default('pending'), // pending | scanned | completed | expired
    amountCents: integer('amount_cents').notNull(),
    tipCents: integer('tip_cents').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_qr_token').on(table.qrToken),
    index('idx_fnb_qr_payment_tab').on(table.tenantId, table.tabId),
  ],
);

// ── 9B: Guest-Facing Tip Screen ──────────────────────────────────
export const fnbGuestTipSessions = pgTable(
  'fnb_guest_tip_sessions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id').notNull(),
    sessionId: text('session_id').notNull(),
    deviceToken: text('device_token').notNull(),
    selectedTipCents: integer('selected_tip_cents'),
    selectedTipPercentage: numeric('selected_tip_percentage', { precision: 5, scale: 2 }),
    status: text('status').notNull().default('waiting'), // waiting | selected | confirmed
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_guest_tip_tab').on(table.tenantId, table.tabId),
  ],
);

// ── 9C: Loyalty Point Redemption ─────────────────────────────────
export const fnbLoyaltyRedemptions = pgTable(
  'fnb_loyalty_redemptions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id').notNull(),
    tenderId: text('tender_id').notNull(),
    customerId: text('customer_id').notNull(),
    pointsRedeemed: integer('points_redeemed').notNull(),
    dollarValueCents: integer('dollar_value_cents').notNull(),
    balanceBefore: integer('balance_before').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_loyalty_tab').on(table.tenantId, table.tabId),
    index('idx_fnb_loyalty_customer').on(table.tenantId, table.customerId),
  ],
);

// ── 9D: NFC Tap-to-Pay on Server Device ──────────────────────────
export const fnbNfcPaymentIntents = pgTable(
  'fnb_nfc_payment_intents',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id').notNull(),
    sessionId: text('session_id').notNull(),
    terminalId: text('terminal_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull().default('initiated'), // initiated | tapped | processing | completed | failed
    nfcTransactionId: text('nfc_transaction_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_nfc_tab').on(table.tenantId, table.tabId),
  ],
);

// ── 9E: Automatic Round-Up Donation ──────────────────────────────
export const fnbDonationConfig = pgTable(
  'fnb_donation_config',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    charityName: text('charity_name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    roundUpEnabled: boolean('round_up_enabled').notNull().default(true),
    fixedAmountCents: integer('fixed_amount_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_donation_config_loc').on(table.tenantId, table.locationId),
  ],
);

export const fnbDonationEntries = pgTable(
  'fnb_donation_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tabId: text('tab_id').notNull(),
    tenderId: text('tender_id').notNull(),
    donationCents: integer('donation_cents').notNull(),
    charityName: text('charity_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_donation_tab').on(table.tenantId, table.tabId),
  ],
);

// ── 9G: Fractional Item Split ────────────────────────────────────
export const fnbSplitItemFractions = pgTable(
  'fnb_split_item_fractions',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    splitCheckId: text('split_check_id').notNull(),
    orderLineId: text('order_line_id').notNull(),
    fraction: numeric('fraction', { precision: 5, scale: 4 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_split_fractions_check').on(table.tenantId, table.splitCheckId),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// HOST STAND — Waitlist, Reservations & Settings
// ═══════════════════════════════════════════════════════════════════

// ── Waitlist Entries ────────────────────────────────────────────────
export const fnbWaitlistEntries = pgTable(
  'fnb_waitlist_entries',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    businessDate: date('business_date').notNull(),
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone'),
    guestEmail: text('guest_email'),
    partySize: integer('party_size').notNull().default(2),
    quotedWaitMinutes: integer('quoted_wait_minutes'),
    status: text('status').notNull().default('waiting'),
    priority: integer('priority').notNull().default(0),
    position: integer('position').notNull().default(0),
    seatingPreference: text('seating_preference'),
    specialRequests: text('special_requests'),
    isVip: boolean('is_vip').notNull().default(false),
    vipNote: text('vip_note'),
    customerId: text('customer_id'),
    customerVisitCount: integer('customer_visit_count').default(0),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),
    actualWaitMinutes: integer('actual_wait_minutes'),
    seatedTableId: text('seated_table_id'),
    seatedServerUserId: text('seated_server_user_id'),
    tabId: text('tab_id'),
    source: text('source').notNull().default('host_stand'),
    notes: text('notes'),
    notificationCount: integer('notification_count').notNull().default(0),
    lastNotificationMethod: text('last_notification_method'),
    confirmationStatus: text('confirmation_status'),
    estimatedArrivalAt: timestamp('estimated_arrival_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_waitlist_tenant_location_date_status').on(
      table.tenantId, table.locationId, table.businessDate, table.status,
    ),
    index('idx_fnb_waitlist_tenant_status_position').on(
      table.tenantId, table.locationId, table.status, table.position,
    ),
    index('idx_fnb_waitlist_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Reservations ──────────────────────────────────────────────────
export const fnbReservations = pgTable(
  'fnb_reservations',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    guestName: text('guest_name').notNull(),
    guestPhone: text('guest_phone'),
    guestEmail: text('guest_email'),
    partySize: integer('party_size').notNull().default(2),
    reservationDate: date('reservation_date').notNull(),
    reservationTime: time('reservation_time').notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(90),
    endTime: time('end_time'),
    status: text('status').notNull().default('confirmed'),
    seatingPreference: text('seating_preference'),
    specialRequests: text('special_requests'),
    occasion: text('occasion'),
    isVip: boolean('is_vip').notNull().default(false),
    vipNote: text('vip_note'),
    customerId: text('customer_id'),
    customerVisitCount: integer('customer_visit_count').default(0),
    assignedTableId: text('assigned_table_id'),
    assignedServerUserId: text('assigned_server_user_id'),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    tabId: text('tab_id'),
    waitlistEntryId: text('waitlist_entry_id'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),
    source: text('source').notNull().default('host_stand'),
    externalBookingId: text('external_booking_id'),
    channel: text('channel'),
    confirmationSentAt: timestamp('confirmation_sent_at', { withTimezone: true }),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    reminderCount: integer('reminder_count').notNull().default(0),
    depositAmountCents: integer('deposit_amount_cents'),
    depositStatus: text('deposit_status'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [
    index('idx_fnb_reservations_tenant_date_status').on(
      table.tenantId, table.locationId, table.reservationDate, table.status,
    ),
    index('idx_fnb_reservations_tenant_date_time').on(
      table.tenantId, table.locationId, table.reservationDate, table.reservationTime,
    ),
    index('idx_fnb_reservations_customer').on(table.tenantId, table.customerId),
  ],
);

// ── Host Stand Settings ─────────────────────────────────────────────
export const fnbHostSettings = pgTable(
  'fnb_host_settings',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    defaultTurnTimeMinutes: integer('default_turn_time_minutes').notNull().default(60),
    waitTimeMethod: text('wait_time_method').notNull().default('historical'),
    waitTimeBufferMinutes: integer('wait_time_buffer_minutes').notNull().default(5),
    autoAssignServer: boolean('auto_assign_server').notNull().default(true),
    rotationMode: text('rotation_mode').notNull().default('round_robin'),
    maxWaitMinutes: integer('max_wait_minutes').notNull().default(120),
    autoNoShowMinutes: integer('auto_no_show_minutes').notNull().default(15),
    reservationSlotIntervalMinutes: integer('reservation_slot_interval_minutes').notNull().default(15),
    maxPartySize: integer('max_party_size').notNull().default(20),
    minAdvanceHours: integer('min_advance_hours').notNull().default(1),
    maxAdvanceDays: integer('max_advance_days').notNull().default(60),
    defaultReservationDurationMinutes: integer('default_reservation_duration_minutes').notNull().default(90),
    allowOnlineReservations: boolean('allow_online_reservations').notNull().default(false),
    allowOnlineWaitlist: boolean('allow_online_waitlist').notNull().default(false),
    requirePhoneForWaitlist: boolean('require_phone_for_waitlist').notNull().default(false),
    requirePhoneForReservation: boolean('require_phone_for_reservation').notNull().default(true),
    overbookingPercentage: integer('overbooking_percentage').notNull().default(0),
    pacingMaxCoversPerSlot: integer('pacing_max_covers_per_slot'),
    smsWaitlistAddedTemplate: text('sms_waitlist_added_template'),
    smsTableReadyTemplate: text('sms_table_ready_template'),
    smsReservationConfirmationTemplate: text('sms_reservation_confirmation_template'),
    smsReservationReminderTemplate: text('sms_reservation_reminder_template'),
    showWaitTimesToGuests: boolean('show_wait_times_to_guests').notNull().default(true),
    showQueuePosition: boolean('show_queue_position').notNull().default(false),
    floorPlanDefaultView: text('floor_plan_default_view').notNull().default('layout'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_fnb_host_settings_tenant_location').on(table.tenantId, table.locationId),
  ],
);

// ── Wait Time History ─────────────────────────────────────────────
export const fnbWaitTimeHistory = pgTable(
  'fnb_wait_time_history',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    businessDate: date('business_date').notNull(),
    partySize: integer('party_size').notNull(),
    quotedWaitMinutes: integer('quoted_wait_minutes'),
    actualWaitMinutes: integer('actual_wait_minutes').notNull(),
    seatingPreference: text('seating_preference'),
    dayOfWeek: integer('day_of_week').notNull(),
    hourOfDay: integer('hour_of_day').notNull(),
    wasReservation: boolean('was_reservation').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_wait_time_history_estimation').on(
      table.tenantId, table.locationId, table.dayOfWeek, table.hourOfDay, table.partySize,
    ),
    index('idx_fnb_wait_time_history_date').on(table.tenantId, table.locationId, table.businessDate),
  ],
);

// ═══════════════════════════════════════════════════════════════════
// HOST MODULE V2 — Table Turn Log & Guest Notifications
// ═══════════════════════════════════════════════════════════════════

// ── Table Turn Log (analytics for wait-time estimation) ──────────
export const fnbTableTurnLog = pgTable(
  'fnb_table_turn_log',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    tableId: text('table_id').notNull(),
    partySize: integer('party_size').notNull(),
    mealPeriod: text('meal_period').notNull(),
    seatedAt: timestamp('seated_at', { withTimezone: true }).notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    turnTimeMinutes: integer('turn_time_minutes'),
    dayOfWeek: integer('day_of_week').notNull(),
    wasReservation: boolean('was_reservation').notNull().default(false),
    reservationId: text('reservation_id'),
    waitlistEntryId: text('waitlist_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_turn_log_tenant').on(table.tenantId),
    index('idx_fnb_turn_log_analytics').on(table.tenantId, table.locationId, table.mealPeriod, table.dayOfWeek),
    index('idx_fnb_turn_log_table_open').on(table.tenantId, table.tableId),
  ],
);

// ── Guest Notifications (SMS/email/push audit trail) ─────────────
export const fnbGuestNotifications = pgTable(
  'fnb_guest_notifications',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    referenceType: text('reference_type').notNull(),
    referenceId: text('reference_id').notNull(),
    notificationType: text('notification_type').notNull(),
    channel: text('channel').notNull(),
    recipientPhone: text('recipient_phone'),
    recipientEmail: text('recipient_email'),
    messageBody: text('message_body').notNull(),
    status: text('status').notNull().default('pending'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_fnb_notifications_ref').on(table.tenantId, table.referenceType, table.referenceId),
  ],
);
