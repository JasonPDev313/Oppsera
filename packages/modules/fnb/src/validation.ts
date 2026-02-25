import { z } from 'zod';

// ── Enums ───────────────────────────────────────────────────────

export const TABLE_TYPES = [
  'standard',
  'bar_seat',
  'communal',
  'booth',
  'high_top',
  'patio',
] as const;

export const TABLE_SHAPES = [
  'round',
  'square',
  'rectangle',
  'oval',
  'custom',
] as const;

export const TABLE_STATUSES = [
  'available',
  'reserved',
  'seated',
  'ordered',
  'entrees_fired',
  'dessert',
  'check_presented',
  'paid',
  'dirty',
  'blocked',
] as const;

export type FnbTableType = (typeof TABLE_TYPES)[number];
export type FnbTableShape = (typeof TABLE_SHAPES)[number];
export type FnbTableStatus = (typeof TABLE_STATUSES)[number];

// ── Idempotency mixin ───────────────────────────────────────────

const idempotencyMixin = {
  clientRequestId: z.string().min(1).max(128).optional(),
};

// ── Session 1: Table Management ─────────────────────────────────

export const syncTablesFromFloorPlanSchema = z.object({
  ...idempotencyMixin,
  roomId: z.string().min(1),
});

export type SyncTablesFromFloorPlanInput = z.input<typeof syncTablesFromFloorPlanSchema>;

export const createTableSchema = z.object({
  ...idempotencyMixin,
  roomId: z.string().min(1),
  tableNumber: z.number().int().min(1),
  displayLabel: z.string().min(1).max(50),
  capacityMin: z.number().int().min(1).optional().default(1),
  capacityMax: z.number().int().min(1),
  tableType: z.enum(TABLE_TYPES).optional().default('standard'),
  shape: z.enum(TABLE_SHAPES).optional().default('square'),
  positionX: z.number().optional().default(0),
  positionY: z.number().optional().default(0),
  width: z.number().optional().default(0),
  height: z.number().optional().default(0),
  rotation: z.number().optional().default(0),
  isCombinable: z.boolean().optional().default(true),
  floorPlanObjectId: z.string().optional(),
  sectionId: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export type CreateTableInput = z.input<typeof createTableSchema>;

export const updateTableSchema = z.object({
  ...idempotencyMixin,
  displayLabel: z.string().min(1).max(50).optional(),
  capacityMin: z.number().int().min(1).optional(),
  capacityMax: z.number().int().min(1).optional(),
  tableType: z.enum(TABLE_TYPES).optional(),
  shape: z.enum(TABLE_SHAPES).optional(),
  isCombinable: z.boolean().optional(),
  sectionId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateTableInput = z.input<typeof updateTableSchema>;

export const updateTableStatusSchema = z.object({
  ...idempotencyMixin,
  status: z.enum(TABLE_STATUSES),
  partySize: z.number().int().min(1).optional(),
  serverUserId: z.string().optional(),
  guestNames: z.string().optional(),
  waitlistEntryId: z.string().optional(),
  expectedVersion: z.number().int().optional(),
});

export type UpdateTableStatusInput = z.input<typeof updateTableStatusSchema>;

export const seatTableSchema = z.object({
  ...idempotencyMixin,
  partySize: z.number().int().min(1),
  serverUserId: z.string().optional(),
  guestNames: z.string().optional(),
  waitlistEntryId: z.string().optional(),
  expectedVersion: z.number().int().optional(),
});

export type SeatTableInput = z.input<typeof seatTableSchema>;

export const combineTablesSchema = z.object({
  ...idempotencyMixin,
  tableIds: z.array(z.string().min(1)).min(2).max(8),
  primaryTableId: z.string().min(1),
});

export type CombineTablesInput = z.input<typeof combineTablesSchema>;

export const uncombineTablesSchema = z.object({
  ...idempotencyMixin,
  combineGroupId: z.string().min(1),
});

export type UncombineTablesInput = z.input<typeof uncombineTablesSchema>;

// ── Query Filters ───────────────────────────────────────────────

export const listTablesFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
  roomId: z.string().optional(),
  sectionId: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

export type ListTablesFilterInput = z.input<typeof listTablesFilterSchema>;

export const getFloorPlanWithStatusFilterSchema = z.object({
  tenantId: z.string().min(1),
  roomId: z.string().min(1),
});

export type GetFloorPlanWithStatusFilterInput = z.input<typeof getFloorPlanWithStatusFilterSchema>;

export const listTableStatusHistorySchema = z.object({
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export type ListTableStatusHistoryInput = z.input<typeof listTableStatusHistorySchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 2: Server Sections & Shift Model
// ═══════════════════════════════════════════════════════════════════

export const ASSIGNMENT_STATUSES = [
  'active',
  'cut',
  'picked_up',
  'closed',
] as const;

export const SHIFT_STATUSES = [
  'serving',
  'cut',
  'closing',
  'checked_out',
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

// ── Section CRUD ────────────────────────────────────────────────

export const createSectionSchema = z.object({
  ...idempotencyMixin,
  roomId: z.string().min(1),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().optional().default(0),
});

export type CreateSectionInput = z.input<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSectionInput = z.input<typeof updateSectionSchema>;

// ── Server Assignment ───────────────────────────────────────────

export const assignServerToSectionSchema = z.object({
  ...idempotencyMixin,
  sectionId: z.string().min(1),
  serverUserId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type AssignServerToSectionInput = z.input<typeof assignServerToSectionSchema>;

export const cutServerSchema = z.object({
  ...idempotencyMixin,
  assignmentId: z.string().min(1),
});

export type CutServerInput = z.input<typeof cutServerSchema>;

export const pickupSectionSchema = z.object({
  ...idempotencyMixin,
  assignmentId: z.string().min(1),
  newServerUserId: z.string().min(1),
});

export type PickupSectionInput = z.input<typeof pickupSectionSchema>;

// ── Shift Extensions ────────────────────────────────────────────

export const createShiftExtensionSchema = z.object({
  ...idempotencyMixin,
  employeeTimeEntryId: z.string().min(1),
  serverUserId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreateShiftExtensionInput = z.input<typeof createShiftExtensionSchema>;

export const updateShiftStatusSchema = z.object({
  ...idempotencyMixin,
  shiftStatus: z.enum(SHIFT_STATUSES),
});

export type UpdateShiftStatusInput = z.input<typeof updateShiftStatusSchema>;

export const completeServerCheckoutSchema = z.object({
  ...idempotencyMixin,
  shiftExtensionId: z.string().min(1),
});

export type CompleteServerCheckoutInput = z.input<typeof completeServerCheckoutSchema>;

// ── Rotation ────────────────────────────────────────────────────

export const advanceRotationSchema = z.object({
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type AdvanceRotationInput = z.input<typeof advanceRotationSchema>;

// ── Session 2 Query Filters ─────────────────────────────────────

export const listSectionsFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
  roomId: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export type ListSectionsFilterInput = z.input<typeof listSectionsFilterSchema>;

export const listServerAssignmentsFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  serverUserId: z.string().optional(),
});

export type ListServerAssignmentsFilterInput = z.input<typeof listServerAssignmentsFilterSchema>;

export const getHostStandViewSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetHostStandViewInput = z.input<typeof getHostStandViewSchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 3: Tabs, Checks & Seat Lifecycle
// ═══════════════════════════════════════════════════════════════════

export const TAB_TYPES = ['dine_in', 'bar', 'takeout', 'quick_service'] as const;

export const TAB_STATUSES = [
  'open', 'ordering', 'sent_to_kitchen', 'in_progress',
  'check_requested', 'split', 'paying', 'closed', 'voided', 'transferred',
] as const;

export const SERVICE_TYPES = ['dine_in', 'takeout', 'to_go'] as const;

export const COURSE_STATUSES = ['unsent', 'sent', 'fired', 'served'] as const;

export const SPLIT_STRATEGIES = ['by_seat', 'by_item', 'equal_split', 'custom_amount'] as const;

export type FnbTabType = (typeof TAB_TYPES)[number];
export type FnbTabStatus = (typeof TAB_STATUSES)[number];
export type FnbServiceType = (typeof SERVICE_TYPES)[number];
export type FnbCourseStatus = (typeof COURSE_STATUSES)[number];
export type FnbSplitStrategy = (typeof SPLIT_STRATEGIES)[number];

export const openTabSchema = z.object({
  ...idempotencyMixin,
  tabType: z.enum(TAB_TYPES).optional().default('dine_in'),
  tableId: z.string().optional(),
  serverUserId: z.string().min(1),
  partySize: z.number().int().min(1).optional(),
  guestName: z.string().optional(),
  serviceType: z.enum(SERVICE_TYPES).optional().default('dine_in'),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerId: z.string().optional(),
});

export type OpenTabInput = z.input<typeof openTabSchema>;

export const updateTabSchema = z.object({
  ...idempotencyMixin,
  partySize: z.number().int().min(1).optional(),
  guestName: z.string().nullable().optional(),
  serviceType: z.enum(SERVICE_TYPES).optional(),
  currentCourseNumber: z.number().int().min(1).optional(),
  customerId: z.string().nullable().optional(),
  expectedVersion: z.number().int(),
});

export type UpdateTabInput = z.input<typeof updateTabSchema>;

export const closeTabSchema = z.object({
  ...idempotencyMixin,
  expectedVersion: z.number().int(),
});

export type CloseTabInput = z.input<typeof closeTabSchema>;

export const voidTabSchema = z.object({
  ...idempotencyMixin,
  reason: z.string().min(1).max(500),
  expectedVersion: z.number().int(),
});

export type VoidTabInput = z.input<typeof voidTabSchema>;

export const transferTabSchema = z.object({
  ...idempotencyMixin,
  toServerUserId: z.string().optional(),
  toTableId: z.string().optional(),
  reason: z.string().optional(),
  expectedVersion: z.number().int(),
});

export type TransferTabInput = z.input<typeof transferTabSchema>;

export const reopenTabSchema = z.object({
  ...idempotencyMixin,
  expectedVersion: z.number().int(),
});

export type ReopenTabInput = z.input<typeof reopenTabSchema>;

export const fireCourseSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  courseNumber: z.number().int().min(1),
});

export type FireCourseInput = z.input<typeof fireCourseSchema>;

export const sendCourseSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  courseNumber: z.number().int().min(1),
});

export type SendCourseInput = z.input<typeof sendCourseSchema>;

export const addTabItemsSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  items: z.array(z.object({
    catalogItemId: z.string().min(1),
    catalogItemName: z.string().min(1),
    unitPriceCents: z.number().int(),
    qty: z.number().min(0.01),
    seatNumber: z.number().int().min(1),
    courseNumber: z.number().int().min(1),
    modifiers: z.array(z.object({
      modifierId: z.string(),
      name: z.string(),
      priceAdjustment: z.number().int(),
    })).default([]),
    specialInstructions: z.string().nullable().default(null),
  })).min(1),
});

export type AddTabItemsInput = z.input<typeof addTabItemsSchema>;

export const splitTabSchema = z.object({
  ...idempotencyMixin,
  strategy: z.enum(SPLIT_STRATEGIES),
  details: z.record(z.unknown()).optional(),
  expectedVersion: z.number().int(),
});

export type SplitTabInput = z.input<typeof splitTabSchema>;

export const listTabsFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  serverUserId: z.string().optional(),
  tableId: z.string().optional(),
  status: z.enum(TAB_STATUSES).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export type ListTabsFilterInput = z.input<typeof listTabsFilterSchema>;

export const getTabDetailSchema = z.object({
  tenantId: z.string().min(1),
  tabId: z.string().min(1),
});

export type GetTabDetailInput = z.input<typeof getTabDetailSchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 4: Course Pacing, Hold/Fire & Kitchen Tickets
// ═══════════════════════════════════════════════════════════════════

export const TICKET_STATUSES = [
  'pending', 'in_progress', 'ready', 'served', 'voided',
] as const;

export const TICKET_ITEM_STATUSES = [
  'pending', 'cooking', 'ready', 'served', 'voided',
] as const;

export const DELTA_TYPES = ['add', 'void', 'modify', 'rush'] as const;

export const ROUTING_RULE_TYPES = ['item', 'modifier', 'department'] as const;

export type FnbTicketStatus = (typeof TICKET_STATUSES)[number];
export type FnbTicketItemStatus = (typeof TICKET_ITEM_STATUSES)[number];
export type FnbDeltaType = (typeof DELTA_TYPES)[number];
export type FnbRoutingRuleType = (typeof ROUTING_RULE_TYPES)[number];

export const createKitchenTicketSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  orderId: z.string().min(1),
  courseNumber: z.number().int().min(1).optional(),
  items: z.array(z.object({
    orderLineId: z.string().min(1),
    itemName: z.string().min(1),
    modifierSummary: z.string().optional(),
    specialInstructions: z.string().optional(),
    seatNumber: z.number().int().min(1).optional(),
    courseName: z.string().optional(),
    quantity: z.number().min(0).optional().default(1),
    isRush: z.boolean().optional().default(false),
    isAllergy: z.boolean().optional().default(false),
    isVip: z.boolean().optional().default(false),
    stationId: z.string().optional(),
  })).min(1),
});

export type CreateKitchenTicketInput = z.input<typeof createKitchenTicketSchema>;

export const updateTicketItemStatusSchema = z.object({
  ...idempotencyMixin,
  itemStatus: z.enum(TICKET_ITEM_STATUSES),
});

export type UpdateTicketItemStatusInput = z.input<typeof updateTicketItemStatusSchema>;

export const updateTicketStatusSchema = z.object({
  ...idempotencyMixin,
  status: z.enum(TICKET_STATUSES),
  expectedVersion: z.number().int().optional(),
});

export type UpdateTicketStatusInput = z.input<typeof updateTicketStatusSchema>;

export const createDeltaChitSchema = z.object({
  ...idempotencyMixin,
  ticketId: z.string().min(1),
  deltaType: z.enum(DELTA_TYPES),
  orderLineId: z.string().min(1),
  itemName: z.string().min(1),
  modifierSummary: z.string().optional(),
  seatNumber: z.number().int().min(1).optional(),
  quantity: z.number().min(0).optional(),
  reason: z.string().optional(),
  stationId: z.string().optional(),
});

export type CreateDeltaChitInput = z.input<typeof createDeltaChitSchema>;

export const voidTicketSchema = z.object({
  ...idempotencyMixin,
  expectedVersion: z.number().int().optional(),
});

export type VoidTicketInput = z.input<typeof voidTicketSchema>;

export const createRoutingRuleSchema = z.object({
  ...idempotencyMixin,
  ruleType: z.enum(ROUTING_RULE_TYPES).optional().default('item'),
  catalogItemId: z.string().optional(),
  modifierId: z.string().optional(),
  departmentId: z.string().optional(),
  subDepartmentId: z.string().optional(),
  stationId: z.string().min(1),
  priority: z.number().int().optional().default(0),
});

export type CreateRoutingRuleInput = z.input<typeof createRoutingRuleSchema>;

export const updateRoutingRuleSchema = z.object({
  ...idempotencyMixin,
  stationId: z.string().min(1).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateRoutingRuleInput = z.input<typeof updateRoutingRuleSchema>;

// ── Session 4 Query Filters ─────────────────────────────────────

export const listKitchenTicketsFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(TICKET_STATUSES).optional(),
  tabId: z.string().optional(),
  stationId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

export type ListKitchenTicketsFilterInput = z.input<typeof listKitchenTicketsFilterSchema>;

export const getKitchenTicketDetailSchema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
});

export type GetKitchenTicketDetailInput = z.input<typeof getKitchenTicketDetailSchema>;

export const listRoutingRulesFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  stationId: z.string().optional(),
  ruleType: z.enum(ROUTING_RULE_TYPES).optional(),
  isActive: z.boolean().optional().default(true),
});

export type ListRoutingRulesFilterInput = z.input<typeof listRoutingRulesFilterSchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 5: KDS Stations & Expo
// ═══════════════════════════════════════════════════════════════════

export const STATION_TYPES = ['prep', 'expo', 'bar'] as const;

export const DISPLAY_MODES = ['standard', 'compact', 'expo'] as const;

export const SORT_BY_OPTIONS = ['time', 'priority', 'course'] as const;

export type FnbStationType = (typeof STATION_TYPES)[number];
export type FnbDisplayMode = (typeof DISPLAY_MODES)[number];
export type FnbSortBy = (typeof SORT_BY_OPTIONS)[number];

export const createStationSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(50),
  displayName: z.string().min(1).max(100),
  stationType: z.enum(STATION_TYPES).optional().default('prep'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().optional().default(0),
  fallbackStationId: z.string().optional(),
  backupPrinterId: z.string().optional(),
  terminalLocationId: z.string().optional(),
  warningThresholdSeconds: z.number().int().min(0).optional().default(480),
  criticalThresholdSeconds: z.number().int().min(0).optional().default(720),
});

export type CreateStationInput = z.input<typeof createStationSchema>;

export const updateStationSchema = z.object({
  ...idempotencyMixin,
  displayName: z.string().min(1).max(100).optional(),
  stationType: z.enum(STATION_TYPES).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  sortOrder: z.number().int().optional(),
  fallbackStationId: z.string().nullable().optional(),
  backupPrinterId: z.string().nullable().optional(),
  terminalLocationId: z.string().nullable().optional(),
  warningThresholdSeconds: z.number().int().min(0).optional(),
  criticalThresholdSeconds: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateStationInput = z.input<typeof updateStationSchema>;

export const upsertDisplayConfigSchema = z.object({
  ...idempotencyMixin,
  stationId: z.string().min(1),
  displayDeviceId: z.string().optional(),
  displayMode: z.enum(DISPLAY_MODES).optional().default('standard'),
  columnsPerRow: z.number().int().min(1).max(8).optional().default(4),
  sortBy: z.enum(SORT_BY_OPTIONS).optional().default('time'),
  showModifiers: z.boolean().optional().default(true),
  showSeatNumbers: z.boolean().optional().default(true),
  showCourseHeaders: z.boolean().optional().default(true),
  autoScrollEnabled: z.boolean().optional().default(false),
  soundAlertEnabled: z.boolean().optional().default(true),
});

export type UpsertDisplayConfigInput = z.input<typeof upsertDisplayConfigSchema>;

export const bumpItemSchema = z.object({
  ...idempotencyMixin,
  ticketItemId: z.string().min(1),
  stationId: z.string().min(1),
});

export type BumpItemInput = z.input<typeof bumpItemSchema>;

export const recallItemSchema = z.object({
  ...idempotencyMixin,
  ticketItemId: z.string().min(1),
  stationId: z.string().min(1),
});

export type RecallItemInput = z.input<typeof recallItemSchema>;

export const bumpTicketSchema = z.object({
  ...idempotencyMixin,
  ticketId: z.string().min(1),
});

export type BumpTicketInput = z.input<typeof bumpTicketSchema>;

export const callBackToStationSchema = z.object({
  ...idempotencyMixin,
  ticketItemId: z.string().min(1),
  stationId: z.string().min(1),
  reason: z.string().optional(),
});

export type CallBackToStationInput = z.input<typeof callBackToStationSchema>;

// ── Session 5 Query Filters ─────────────────────────────────────

export const listStationsFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  stationType: z.enum(STATION_TYPES).optional(),
  isActive: z.boolean().optional().default(true),
});

export type ListStationsFilterInput = z.input<typeof listStationsFilterSchema>;

export const getStationDetailSchema = z.object({
  tenantId: z.string().min(1),
  stationId: z.string().min(1),
});

export type GetStationDetailInput = z.input<typeof getStationDetailSchema>;

export const getKdsViewSchema = z.object({
  tenantId: z.string().min(1),
  stationId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetKdsViewInput = z.input<typeof getKdsViewSchema>;

export const getExpoViewSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetExpoViewInput = z.input<typeof getExpoViewSchema>;

export const getStationMetricsSchema = z.object({
  tenantId: z.string().min(1),
  stationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetStationMetricsInput = z.input<typeof getStationMetricsSchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 6: Modifiers, 86 Board & Menu Availability
// ═══════════════════════════════════════════════════════════════════

export const ENTITY_86_TYPES = ['item', 'modifier'] as const;
export const ALLERGEN_SEVERITIES = ['standard', 'severe'] as const;
export const AVAILABILITY_ENTITY_TYPES = ['item', 'category'] as const;

export type Entity86Type = (typeof ENTITY_86_TYPES)[number];
export type AllergenSeverity = (typeof ALLERGEN_SEVERITIES)[number];
export type AvailabilityEntityType = (typeof AVAILABILITY_ENTITY_TYPES)[number];

export const eightySixItemSchema = z.object({
  ...idempotencyMixin,
  entityType: z.enum(ENTITY_86_TYPES).optional().default('item'),
  entityId: z.string().min(1),
  stationId: z.string().optional(),
  reason: z.string().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  autoRestoreAtDayEnd: z.boolean().optional().default(true),
});

export type EightySixItemInput = z.input<typeof eightySixItemSchema>;

export const restoreItemSchema = z.object({
  ...idempotencyMixin,
  eightySixLogId: z.string().min(1),
});

export type RestoreItemInput = z.input<typeof restoreItemSchema>;

export const createMenuPeriodSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  sortOrder: z.number().int().optional().default(0),
});

export type CreateMenuPeriodInput = z.input<typeof createMenuPeriodSchema>;

export const updateMenuPeriodSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(100).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateMenuPeriodInput = z.input<typeof updateMenuPeriodSchema>;

export const createAvailabilityWindowSchema = z.object({
  ...idempotencyMixin,
  entityType: z.enum(AVAILABILITY_ENTITY_TYPES),
  entityId: z.string().min(1),
  menuPeriodId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hideWhenUnavailable: z.boolean().optional().default(false),
});

export type CreateAvailabilityWindowInput = z.input<typeof createAvailabilityWindowSchema>;

export const updateAvailabilityWindowSchema = z.object({
  ...idempotencyMixin,
  menuPeriodId: z.string().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  hideWhenUnavailable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateAvailabilityWindowInput = z.input<typeof updateAvailabilityWindowSchema>;

export const createAllergenSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(100),
  icon: z.string().optional(),
  severity: z.enum(ALLERGEN_SEVERITIES).optional().default('standard'),
  sortOrder: z.number().int().optional().default(0),
});

export type CreateAllergenInput = z.input<typeof createAllergenSchema>;

export const tagItemAllergenSchema = z.object({
  ...idempotencyMixin,
  catalogItemId: z.string().min(1),
  allergenId: z.string().min(1),
  notes: z.string().optional(),
});

export type TagItemAllergenInput = z.input<typeof tagItemAllergenSchema>;

export const removeItemAllergenSchema = z.object({
  ...idempotencyMixin,
  catalogItemId: z.string().min(1),
  allergenId: z.string().min(1),
});

export type RemoveItemAllergenInput = z.input<typeof removeItemAllergenSchema>;

export const createPrepNotePresetSchema = z.object({
  ...idempotencyMixin,
  catalogItemId: z.string().optional(),
  noteText: z.string().min(1).max(200),
  sortOrder: z.number().int().optional().default(0),
});

export type CreatePrepNotePresetInput = z.input<typeof createPrepNotePresetSchema>;

// ── Session 6 Query Filters ─────────────────────────────────────

export const listEightySixedSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entityType: z.enum(ENTITY_86_TYPES).optional(),
  activeOnly: z.boolean().optional().default(true),
});

export type ListEightySixedInput = z.input<typeof listEightySixedSchema>;

export const listMenuPeriodsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  isActive: z.boolean().optional().default(true),
});

export type ListMenuPeriodsInput = z.input<typeof listMenuPeriodsSchema>;

export const getAvailableMenuSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetAvailableMenuInput = z.input<typeof getAvailableMenuSchema>;

export const listAllergensSchema = z.object({
  tenantId: z.string().min(1),
});

export type ListAllergensInput = z.input<typeof listAllergensSchema>;

export const getItemAllergensSchema = z.object({
  tenantId: z.string().min(1),
  catalogItemId: z.string().min(1),
});

export type GetItemAllergensInput = z.input<typeof getItemAllergensSchema>;

export const listPrepNotePresetsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
  catalogItemId: z.string().optional(),
});

export type ListPrepNotePresetsInput = z.input<typeof listPrepNotePresetsSchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 7: Split Checks, Merged Tabs & Payment Flows
// ═══════════════════════════════════════════════════════════════════

export const PAYMENT_SESSION_STATUSES = ['pending', 'in_progress', 'completed', 'failed'] as const;
export const CHECK_SPLIT_STRATEGIES = ['by_seat', 'by_item', 'equal_split', 'custom_amount'] as const;

export type PaymentSessionStatus = (typeof PAYMENT_SESSION_STATUSES)[number];
export type CheckSplitStrategy = (typeof CHECK_SPLIT_STRATEGIES)[number];

// ── Auto Gratuity Rules ─────────────────────────────────────────

export const createAutoGratuityRuleSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(100),
  partySizeThreshold: z.number().int().min(1),
  gratuityPercentage: z.string().regex(/^\d+(\.\d{1,2})?$/), // NUMERIC as string
  isTaxable: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export type CreateAutoGratuityRuleInput = z.input<typeof createAutoGratuityRuleSchema>;

export const updateAutoGratuityRuleSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(100).optional(),
  partySizeThreshold: z.number().int().min(1).optional(),
  gratuityPercentage: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  isTaxable: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateAutoGratuityRuleInput = z.input<typeof updateAutoGratuityRuleSchema>;

// ── Payment Sessions ────────────────────────────────────────────

export const presentCheckSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  orderId: z.string().min(1),
  perSeat: z.boolean().optional().default(false),
});

export type PresentCheckInput = z.input<typeof presentCheckSchema>;

export const startPaymentSessionSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  orderId: z.string().min(1),
  totalAmountCents: z.number().int().min(0),
});

export type StartPaymentSessionInput = z.input<typeof startPaymentSessionSchema>;

export const completePaymentSessionSchema = z.object({
  ...idempotencyMixin,
  sessionId: z.string().min(1),
  changeCents: z.number().int().min(0).optional().default(0),
});

export type CompletePaymentSessionInput = z.input<typeof completePaymentSessionSchema>;

export const failPaymentSessionSchema = z.object({
  ...idempotencyMixin,
  sessionId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export type FailPaymentSessionInput = z.input<typeof failPaymentSessionSchema>;

// ── Split Checks ────────────────────────────────────────────────

export const applySplitStrategySchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  orderId: z.string().min(1),
  strategy: z.enum(CHECK_SPLIT_STRATEGIES),
  splitCount: z.number().int().min(2).max(20).optional(), // for equal_split
  seatAssignments: z.record(z.array(z.number().int().min(1))).optional(), // for by_seat: checkId → seatNumbers
  itemAssignments: z.record(z.array(z.string().min(1))).optional(), // for by_item: checkId → lineIds
  customAmounts: z.array(z.object({
    label: z.string().optional(),
    amountCents: z.number().int().min(0),
  })).optional(), // for custom_amount
  expectedVersion: z.number().int(),
});

export type ApplySplitStrategyInput = z.input<typeof applySplitStrategySchema>;

export const rejoinChecksSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  expectedVersion: z.number().int(),
});

export type RejoinChecksInput = z.input<typeof rejoinChecksSchema>;

// ── Comp & Discount ─────────────────────────────────────────────

export const compItemSchema = z.object({
  ...idempotencyMixin,
  orderId: z.string().min(1),
  orderLineId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export type CompItemInput = z.input<typeof compItemSchema>;

export const discountCheckSchema = z.object({
  ...idempotencyMixin,
  orderId: z.string().min(1),
  discountType: z.enum(['percentage', 'fixed']),
  value: z.number().min(0), // percentage (0-100) or fixed cents
  reason: z.string().optional(),
});

export type DiscountCheckInput = z.input<typeof discountCheckSchema>;

// ── Void & Refund ───────────────────────────────────────────────

export const voidCheckSchema = z.object({
  ...idempotencyMixin,
  orderId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export type VoidCheckInput = z.input<typeof voidCheckSchema>;

export const refundCheckSchema = z.object({
  ...idempotencyMixin,
  tenderId: z.string().min(1),
  amountCents: z.number().int().min(1),
  reason: z.string().min(1).max(500),
  refundMethod: z.enum(['original', 'cash', 'store_credit']).optional().default('original'),
});

export type RefundCheckInput = z.input<typeof refundCheckSchema>;

// ── Session 7 Query Filters ────────────────────────────────────

export const listAutoGratuityRulesSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export type ListAutoGratuityRulesInput = z.input<typeof listAutoGratuityRulesSchema>;

export const getPaymentSessionSchema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
});

export type GetPaymentSessionInput = z.input<typeof getPaymentSessionSchema>;

export const listPaymentSessionsSchema = z.object({
  tenantId: z.string().min(1),
  tabId: z.string().min(1),
  status: z.enum(PAYMENT_SESSION_STATUSES).optional(),
});

export type ListPaymentSessionsInput = z.input<typeof listPaymentSessionsSchema>;

export const getCheckSummarySchema = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
});

export type GetCheckSummaryInput = z.input<typeof getCheckSummarySchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 8: Pre-Auth Bar Tabs & Card-on-File
// ═══════════════════════════════════════════════════════════════════

export const PREAUTH_STATUSES = ['authorized', 'captured', 'adjusted', 'finalized', 'voided', 'expired'] as const;
export type PreauthStatus = (typeof PREAUTH_STATUSES)[number];

// ── Pre-Auth Commands ──────────────────────────────────────────

export const createPreauthSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  authAmountCents: z.number().int().min(1).max(20000), // max $200
  cardToken: z.string().min(1),
  cardLast4: z.string().regex(/^\d{4}$/),
  cardBrand: z.string().optional(),
  providerRef: z.string().optional(),
  expiresInHours: z.number().min(1).max(168).optional().default(24), // 1h to 7 days
});

export type CreatePreauthInput = z.input<typeof createPreauthSchema>;

export const capturePreauthSchema = z.object({
  ...idempotencyMixin,
  preauthId: z.string().min(1),
  captureAmountCents: z.number().int().min(0),
  tipAmountCents: z.number().int().min(0).optional().default(0),
  overrideThreshold: z.boolean().optional().default(false), // manager override for exceeding preauth
});

export type CapturePreauthInput = z.input<typeof capturePreauthSchema>;

export const voidPreauthSchema = z.object({
  ...idempotencyMixin,
  preauthId: z.string().min(1),
  reason: z.string().min(1).max(500).optional(),
});

export type VoidPreauthInput = z.input<typeof voidPreauthSchema>;

export const adjustTipSchema = z.object({
  ...idempotencyMixin,
  preauthId: z.string().optional(),
  tenderId: z.string().optional(),
  tabId: z.string().min(1),
  originalTipCents: z.number().int().min(0).optional().default(0),
  adjustedTipCents: z.number().int().min(0),
  adjustmentReason: z.string().max(500).optional(),
});

export type AdjustTipInput = z.input<typeof adjustTipSchema>;

export const finalizeTipSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
});

export type FinalizeTipInput = z.input<typeof finalizeTipSchema>;

export const markTabWalkoutSchema = z.object({
  ...idempotencyMixin,
  tabId: z.string().min(1),
  autoGratuityPercentage: z.number().min(0).max(100).optional(),
  reason: z.string().max(500).optional(),
});

export type MarkTabWalkoutInput = z.input<typeof markTabWalkoutSchema>;

// ── Session 8 Query Filters ──────────────────────────────────

export const getTabPreauthsSchema = z.object({
  tenantId: z.string().min(1),
  tabId: z.string().min(1),
});

export type GetTabPreauthsInput = z.input<typeof getTabPreauthsSchema>;

export const listTipAdjustmentsSchema = z.object({
  tenantId: z.string().min(1),
  tabId: z.string().min(1),
  isFinal: z.boolean().optional(),
});

export type ListTipAdjustmentsInput = z.input<typeof listTipAdjustmentsSchema>;

export const listOpenPreauthsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
  status: z.enum(PREAUTH_STATUSES).optional().default('authorized'),
});

export type ListOpenPreauthsInput = z.input<typeof listOpenPreauthsSchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 9: Tips, Tip Pooling & Gratuity Rules
// ═══════════════════════════════════════════════════════════════════

export const TIP_POOL_TYPES = ['full', 'percentage', 'points'] as const;
export const TIP_POOL_SCOPES = ['shift', 'daily', 'location'] as const;
export const TIP_DISTRIBUTION_METHODS = ['hours', 'points', 'equal'] as const;
export const TIP_OUT_CALC_METHODS = ['fixed', 'percentage_of_tips', 'percentage_of_sales'] as const;

export type TipPoolType = (typeof TIP_POOL_TYPES)[number];
export type TipPoolScope = (typeof TIP_POOL_SCOPES)[number];
export type TipDistributionMethod = (typeof TIP_DISTRIBUTION_METHODS)[number];
export type TipOutCalcMethod = (typeof TIP_OUT_CALC_METHODS)[number];

// ── Tip Pool Commands ──────────────────────────────────────────

export const createTipPoolSchema = z.object({
  ...idempotencyMixin,
  locationId: z.string().min(1),
  name: z.string().min(1).max(100),
  poolType: z.enum(TIP_POOL_TYPES),
  poolScope: z.enum(TIP_POOL_SCOPES).optional().default('daily'),
  percentageToPool: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), // NUMERIC as string
  distributionMethod: z.enum(TIP_DISTRIBUTION_METHODS).optional().default('hours'),
  isActive: z.boolean().optional().default(true),
});

export type CreateTipPoolInput = z.input<typeof createTipPoolSchema>;

export const updateTipPoolSchema = z.object({
  ...idempotencyMixin,
  name: z.string().min(1).max(100).optional(),
  poolType: z.enum(TIP_POOL_TYPES).optional(),
  poolScope: z.enum(TIP_POOL_SCOPES).optional(),
  percentageToPool: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  distributionMethod: z.enum(TIP_DISTRIBUTION_METHODS).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateTipPoolInput = z.input<typeof updateTipPoolSchema>;

export const addPoolParticipantSchema = z.object({
  ...idempotencyMixin,
  poolId: z.string().min(1),
  roleId: z.string().min(1),
  pointsValue: z.number().int().min(1).max(100).optional().default(10),
  isContributor: z.boolean().optional().default(true),
  isRecipient: z.boolean().optional().default(true),
});

export type AddPoolParticipantInput = z.input<typeof addPoolParticipantSchema>;

export const removePoolParticipantSchema = z.object({
  poolId: z.string().min(1),
  roleId: z.string().min(1),
});

export type RemovePoolParticipantInput = z.input<typeof removePoolParticipantSchema>;

export const distributeTipPoolSchema = z.object({
  ...idempotencyMixin,
  poolId: z.string().min(1),
  businessDate: z.string().min(1), // YYYY-MM-DD
  participants: z.array(z.object({
    employeeId: z.string().min(1),
    roleId: z.string().min(1),
    hoursWorked: z.number().min(0).optional().default(0),
  })).min(1),
});

export type DistributeTipPoolInput = z.input<typeof distributeTipPoolSchema>;

// ── Cash Tip Declaration ───────────────────────────────────────

export const declareCashTipsSchema = z.object({
  ...idempotencyMixin,
  serverUserId: z.string().min(1),
  businessDate: z.string().min(1), // YYYY-MM-DD
  cashTipsDeclaredCents: z.number().int().min(0),
  cashSalesCents: z.number().int().min(0).optional().default(0),
});

export type DeclareCashTipsInput = z.input<typeof declareCashTipsSchema>;

// ── Tip Out ────────────────────────────────────────────────────

export const recordTipOutSchema = z.object({
  ...idempotencyMixin,
  fromServerUserId: z.string().min(1),
  toEmployeeId: z.string().min(1),
  toRoleName: z.string().optional(),
  businessDate: z.string().min(1), // YYYY-MM-DD
  amountCents: z.number().int().min(1),
  calculationMethod: z.enum(TIP_OUT_CALC_METHODS),
  calculationBasis: z.string().optional(),
});

export type RecordTipOutInput = z.input<typeof recordTipOutSchema>;

// ── Session 9 Query Filters ──────────────────────────────────

export const listTipPoolsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  isActive: z.boolean().optional().default(true),
});

export type ListTipPoolsInput = z.input<typeof listTipPoolsSchema>;

export const getTipPoolDetailSchema = z.object({
  tenantId: z.string().min(1),
  poolId: z.string().min(1),
});

export type GetTipPoolDetailInput = z.input<typeof getTipPoolDetailSchema>;

export const listTipDeclarationsSchema = z.object({
  tenantId: z.string().min(1),
  businessDate: z.string().min(1),
  serverUserId: z.string().optional(),
});

export type ListTipDeclarationsInput = z.input<typeof listTipDeclarationsSchema>;

export const listTipOutEntriesSchema = z.object({
  tenantId: z.string().min(1),
  businessDate: z.string().min(1),
  serverUserId: z.string().optional(),
});

export type ListTipOutEntriesInput = z.input<typeof listTipOutEntriesSchema>;

export const getTipPoolDistributionsSchema = z.object({
  tenantId: z.string().min(1),
  poolId: z.string().min(1),
  businessDate: z.string().min(1),
});

export type GetTipPoolDistributionsInput = z.input<typeof getTipPoolDistributionsSchema>;

// ═══════════════════════════════════════════════════════════════════
// SESSION 10 — Close Batch, Z-Report & Cash Control
// ═══════════════════════════════════════════════════════════════════

export const CLOSE_BATCH_STATUSES = [
  'open',
  'in_progress',
  'reconciled',
  'posted',
  'locked',
] as const;

export type CloseBatchStatus = (typeof CLOSE_BATCH_STATUSES)[number];

export const SERVER_CHECKOUT_STATUSES = ['pending', 'completed'] as const;

export type ServerCheckoutStatus = (typeof SERVER_CHECKOUT_STATUSES)[number];

// ── Commands ──────────────────────────────────────────────────────

export const startCloseBatchSchema = z.object({
  locationId: z.string().min(1),
  businessDate: z.string().min(1),
  startingFloatCents: z.number().int().min(0).default(0),
  clientRequestId: z.string().min(1).max(128).optional(),
});

export type StartCloseBatchInput = z.input<typeof startCloseBatchSchema>;

export const beginServerCheckoutSchema = z.object({
  closeBatchId: z.string().min(1),
  serverUserId: z.string().min(1),
});

export type BeginServerCheckoutInput = z.input<typeof beginServerCheckoutSchema>;

export const completeServerCheckoutSchemaS10 = z.object({
  checkoutId: z.string().min(1),
  cashTipsDeclaredCents: z.number().int().min(0).default(0),
  cashOwedToHouseCents: z.number().int().min(0).default(0),
  signature: z.string().optional(),
});

export type CompleteServerCheckoutS10Input = z.input<typeof completeServerCheckoutSchemaS10>;

export const recordCashDropSchema = z.object({
  locationId: z.string().min(1),
  amountCents: z.number().int().min(1),
  employeeId: z.string().min(1),
  businessDate: z.string().min(1),
  closeBatchId: z.string().optional(),
  terminalId: z.string().optional(),
  notes: z.string().optional(),
});

export type RecordCashDropInput = z.input<typeof recordCashDropSchema>;

export const recordCashPaidOutSchema = z.object({
  locationId: z.string().min(1),
  amountCents: z.number().int().min(1),
  reason: z.string().min(1),
  employeeId: z.string().min(1),
  businessDate: z.string().min(1),
  closeBatchId: z.string().optional(),
  vendorName: z.string().optional(),
  approvedBy: z.string().optional(),
});

export type RecordCashPaidOutInput = z.input<typeof recordCashPaidOutSchema>;

export const recordCashCountSchema = z.object({
  closeBatchId: z.string().min(1),
  cashCountedCents: z.number().int().min(0),
});

export type RecordCashCountInput = z.input<typeof recordCashCountSchema>;

export const reconcileCloseBatchSchema = z.object({
  closeBatchId: z.string().min(1),
  notes: z.string().optional(),
});

export type ReconcileCloseBatchInput = z.input<typeof reconcileCloseBatchSchema>;

export const postCloseBatchSchema = z.object({
  closeBatchId: z.string().min(1),
  glJournalEntryId: z.string().optional(),
});

export type PostCloseBatchInput = z.input<typeof postCloseBatchSchema>;

export const lockCloseBatchSchema = z.object({
  closeBatchId: z.string().min(1),
});

export type LockCloseBatchInput = z.input<typeof lockCloseBatchSchema>;

export const recordDepositSchema = z.object({
  closeBatchId: z.string().min(1),
  locationId: z.string().min(1),
  depositAmountCents: z.number().int().min(1),
  depositDate: z.string().min(1),
  bankReference: z.string().optional(),
  notes: z.string().optional(),
});

export type RecordDepositInput = z.input<typeof recordDepositSchema>;

// ── Query Filters ─────────────────────────────────────────────────

export const getCloseBatchSchema = z.object({
  tenantId: z.string().min(1),
  closeBatchId: z.string().min(1),
});

export type GetCloseBatchInput = z.input<typeof getCloseBatchSchema>;

export const getZReportSchema = z.object({
  tenantId: z.string().min(1),
  closeBatchId: z.string().min(1),
});

export type GetZReportInput = z.input<typeof getZReportSchema>;

export const listServerCheckoutsSchema = z.object({
  tenantId: z.string().min(1),
  closeBatchId: z.string().min(1),
  status: z.enum(SERVER_CHECKOUT_STATUSES).optional(),
});

export type ListServerCheckoutsInput = z.input<typeof listServerCheckoutsSchema>;

export const listCashDropsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().min(1),
});

export type ListCashDropsInput = z.input<typeof listCashDropsSchema>;

export const listCashPaidOutsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().min(1),
});

export type ListCashPaidOutsInput = z.input<typeof listCashPaidOutsSchema>;

export const getDepositSlipSchema = z.object({
  tenantId: z.string().min(1),
  closeBatchId: z.string().min(1),
});

export type GetDepositSlipInput = z.input<typeof getDepositSlipSchema>;

// ═══════════════════════════════════════════════════════════════════
// SESSION 11 — GL Posting & Accounting Wiring
// ═══════════════════════════════════════════════════════════════════

export const FNB_GL_MAPPING_ENTITY_TYPES = [
  'department',
  'sub_department',
  'tax_group',
  'payment_type',
  'service_charge',
  'comp',
  'discount',
  'cash_over_short',
  'tip',
  'gift_card',
] as const;

export type FnbGlMappingEntityType = (typeof FNB_GL_MAPPING_ENTITY_TYPES)[number];

export const FNB_POSTING_STATUSES = [
  'pending',
  'posted',
  'failed',
  'reversed',
] as const;

export type FnbPostingStatus = (typeof FNB_POSTING_STATUSES)[number];

export const FNB_POSTING_MODES = ['realtime', 'batch'] as const;

export type FnbPostingMode = (typeof FNB_POSTING_MODES)[number];

// ── Commands ──────────────────────────────────────────────────────

export const configureFnbGlMappingSchema = z.object({
  locationId: z.string().min(1),
  entityType: z.enum(FNB_GL_MAPPING_ENTITY_TYPES),
  entityId: z.string().min(1),
  revenueAccountId: z.string().optional(),
  expenseAccountId: z.string().optional(),
  liabilityAccountId: z.string().optional(),
  assetAccountId: z.string().optional(),
  contraRevenueAccountId: z.string().optional(),
  memo: z.string().optional(),
});

export type ConfigureFnbGlMappingInput = z.input<typeof configureFnbGlMappingSchema>;

export const updateFnbPostingConfigSchema = z.object({
  locationId: z.string().min(1),
  postingMode: z.enum(FNB_POSTING_MODES),
  enableAutoPosting: z.boolean().default(false),
  discountTreatment: z.enum(['contra_revenue', 'expense']).default('contra_revenue'),
  compTreatment: z.enum(['expense', 'contra_revenue']).default('expense'),
  serviceChargeTreatment: z.enum(['revenue', 'liability']).default('revenue'),
});

export type UpdateFnbPostingConfigInput = z.input<typeof updateFnbPostingConfigSchema>;

export const postBatchToGlSchema = z.object({
  closeBatchId: z.string().min(1),
});

export type PostBatchToGlInput = z.input<typeof postBatchToGlSchema>;

export const reverseBatchPostingSchema = z.object({
  closeBatchId: z.string().min(1),
  reason: z.string().min(1),
});

export type ReverseBatchPostingInput = z.input<typeof reverseBatchPostingSchema>;

export const retryBatchPostingSchema = z.object({
  closeBatchId: z.string().min(1),
});

export type RetryBatchPostingInput = z.input<typeof retryBatchPostingSchema>;

// ── Query Filters ─────────────────────────────────────────────────

export const listFnbGlMappingsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  entityType: z.enum(FNB_GL_MAPPING_ENTITY_TYPES).optional(),
});

export type ListFnbGlMappingsInput = z.input<typeof listFnbGlMappingsSchema>;

export const listUnpostedBatchesSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
});

export type ListUnpostedBatchesInput = z.input<typeof listUnpostedBatchesSchema>;

export const getBatchPostingStatusSchema = z.object({
  tenantId: z.string().min(1),
  closeBatchId: z.string().min(1),
});

export type GetBatchPostingStatusInput = z.input<typeof getBatchPostingStatusSchema>;

export const getPostingReconciliationSchema = z.object({
  tenantId: z.string().min(1),
  businessDate: z.string().min(1),
  locationId: z.string().optional(),
});

export type GetPostingReconciliationInput = z.input<typeof getPostingReconciliationSchema>;

// ═══════════════════════════════════════════════════════════════════
// SESSION 12 — F&B POS Settings Module
// ═══════════════════════════════════════════════════════════════════

export const FNB_SETTINGS_MODULE_KEYS = [
  'fnb_general',
  'fnb_floor',
  'fnb_ordering',
  'fnb_kitchen',
  'fnb_payment',
  'fnb_tips',
  'fnb_accounting',
  'fnb_receipts',
  'fnb_hardware',
] as const;

export type FnbSettingsModuleKey = (typeof FNB_SETTINGS_MODULE_KEYS)[number];

// ── Per-Module Schemas ───────────────────────────────────────────

export const fnbGeneralSettingsSchema = z.object({
  business_day_cutoff_time: z.string().regex(/^\d{2}:\d{2}$/).default('03:00'),
  default_service_type: z.enum(['dine_in', 'takeout', 'quick_service']).default('dine_in'),
  rounding_rule: z.enum(['none', 'nearest_5', 'nearest_10']).default('none'),
  covers_tracking_enabled: z.boolean().default(true),
  require_table_for_dine_in: z.boolean().default(true),
  require_customer_for_tab: z.boolean().default(false),
  auto_print_check_on_close: z.boolean().default(true),
  currency_code: z.string().length(3).default('USD'),
});

export const fnbFloorSettingsSchema = z.object({
  table_turn_time_defaults: z.record(z.string(), z.number().int().min(1).max(999))
    .default({ '2-top': 45, '4-top': 60, '6-top': 75, '8-top': 90 }),
  dirty_table_auto_reset_minutes: z.number().int().min(1).max(120).default(5),
  auto_assign_server_by_section: z.boolean().default(true),
  show_elapsed_time_on_tables: z.boolean().default(true),
  table_status_colors: z.record(z.string(), z.string().regex(/^#[0-9A-Fa-f]{6}$/))
    .default({
      available: '#4CAF50', seated: '#2196F3', ordered: '#FF9800',
      check_presented: '#9C27B0', paid: '#607D8B', dirty: '#BDBDBD', blocked: '#F44336',
    }),
});

export const fnbOrderingSettingsSchema = z.object({
  default_courses: z.array(z.string().min(1).max(50)).min(1).max(10)
    .default(['Apps', 'Entrees', 'Desserts']),
  auto_fire_single_course: z.boolean().default(true),
  require_seat_number: z.boolean().default(false),
  allow_open_price_items: z.boolean().default(false),
  comp_reasons: z.array(z.string().min(1).max(100)).min(1).max(20)
    .default(['Manager Comp', 'Quality Issue', 'Long Wait', 'VIP']),
  void_reasons: z.array(z.string().min(1).max(100)).min(1).max(20)
    .default(['Wrong Item', 'Quality', 'Customer Changed Mind', 'Duplicate']),
  item_note_presets: z.array(z.string().min(1).max(100)).min(1).max(30)
    .default(['Extra Sauce', 'On The Side', 'No Onions', 'Gluten Free', 'Split Plate']),
});

export const fnbKitchenSettingsSchema = z.object({
  kds_warning_threshold_seconds: z.number().int().min(60).max(3600).default(480),
  kds_critical_threshold_seconds: z.number().int().min(60).max(3600).default(720),
  kds_bump_behavior: z.enum(['remove', 'move_to_done']).default('remove'),
  expo_mode_enabled: z.boolean().default(true),
  auto_print_on_kds_failure: z.boolean().default(true),
  delta_chit_enabled: z.boolean().default(true),
  course_pacing_auto_fire: z.boolean().default(false),
});

export const fnbPaymentSettingsSchema = z.object({
  tip_suggestions: z.array(z.number().min(0).max(100)).min(1).max(10)
    .default([15, 18, 20, 25]),
  tip_suggestion_type: z.enum(['percentage', 'amount']).default('percentage'),
  tip_adjustment_window_hours: z.number().int().min(1).max(168).default(48),
  auto_gratuity_party_size_threshold: z.number().int().min(1).max(50).default(6),
  auto_gratuity_percentage: z.number().min(0).max(100).default(20.0),
  preauth_default_amount_cents: z.number().int().min(500).max(100000).default(5000),
  preauth_max_amount_cents: z.number().int().min(500).max(500000).default(20000),
  preauth_overage_alert_percentage: z.number().min(0).max(100).default(20.0),
  walkout_auto_close_hours: z.number().int().min(1).max(24).default(4),
  walkout_auto_gratuity_percentage: z.number().min(0).max(100).default(20.0),
  allow_no_sale_drawer_open: z.boolean().default(false),
  require_reason_for_void: z.boolean().default(true),
  require_manager_for_void_after_send: z.boolean().default(true),
});

export const fnbTipsSettingsSchema = z.object({
  tip_pool_type: z.enum(['none', 'full', 'percentage', 'points']).default('none'),
  tip_pool_percentage_to_pool: z.number().min(0).max(100).default(0),
  tip_pool_distribution_method: z.enum(['hours', 'points', 'equal']).default('hours'),
  minimum_cash_tip_declaration_percentage: z.number().min(0).max(100).default(8.0),
  tip_out_presets: z.array(z.object({
    role: z.string().min(1).max(50),
    percentage: z.number().min(0).max(100),
  })).max(20).default([
    { role: 'busser', percentage: 3 },
    { role: 'bartender', percentage: 5 },
  ]),
});

export const fnbAccountingSettingsSchema = z.object({
  posting_timing: z.enum(['realtime', 'batch']).default('batch'),
  default_revenue_gl_account: z.string().nullable().default(null),
  default_tax_liability_gl_account: z.string().nullable().default(null),
  default_tips_payable_gl_account: z.string().nullable().default(null),
  default_cash_gl_account: z.string().nullable().default(null),
  default_card_clearing_gl_account: z.string().nullable().default(null),
  discount_gl_treatment: z.enum(['contra_revenue', 'expense']).default('contra_revenue'),
  comp_gl_account: z.string().nullable().default(null),
  over_short_gl_account: z.string().nullable().default(null),
  service_charge_gl_treatment: z.enum(['revenue', 'liability']).default('revenue'),
});

export const fnbReceiptsSettingsSchema = z.object({
  receipt_header_lines: z.array(z.string().min(1).max(255)).max(10).default([]),
  receipt_footer_lines: z.array(z.string().min(1).max(255)).max(10).default([]),
  show_item_modifiers_on_receipt: z.boolean().default(true),
  show_server_name_on_receipt: z.boolean().default(true),
  show_table_number_on_receipt: z.boolean().default(true),
  default_receipt_delivery: z.enum(['print', 'email', 'sms', 'none']).default('print'),
  merchant_copy_auto_print: z.boolean().default(true),
});

export const fnbHardwareSettingsSchema = z.object({
  device_heartbeat_interval_seconds: z.number().int().min(10).max(300).default(30),
  offline_mode_enabled: z.boolean().default(false),
  offline_max_queued_orders: z.number().int().min(10).max(500).default(50),
  offline_payment_allowed: z.boolean().default(false),
});

/** Map of module key → schema for validation dispatch */
export const FNB_SETTINGS_SCHEMAS = {
  fnb_general: fnbGeneralSettingsSchema,
  fnb_floor: fnbFloorSettingsSchema,
  fnb_ordering: fnbOrderingSettingsSchema,
  fnb_kitchen: fnbKitchenSettingsSchema,
  fnb_payment: fnbPaymentSettingsSchema,
  fnb_tips: fnbTipsSettingsSchema,
  fnb_accounting: fnbAccountingSettingsSchema,
  fnb_receipts: fnbReceiptsSettingsSchema,
  fnb_hardware: fnbHardwareSettingsSchema,
} as const;

// ── Commands ──────────────────────────────────────────────────────

export const getFnbSettingsSchema = z.object({
  tenantId: z.string().min(1),
  moduleKey: z.enum(FNB_SETTINGS_MODULE_KEYS),
  locationId: z.string().optional(),
});

export type GetFnbSettingsInput = z.input<typeof getFnbSettingsSchema>;

export const updateFnbSettingsSchema = z.object({
  moduleKey: z.enum(FNB_SETTINGS_MODULE_KEYS),
  locationId: z.string().optional(),
  settings: z.record(z.string(), z.unknown()),
});

export type UpdateFnbSettingsInput = z.input<typeof updateFnbSettingsSchema>;

export const updateFnbSettingSchema = z.object({
  moduleKey: z.enum(FNB_SETTINGS_MODULE_KEYS),
  settingKey: z.string().min(1),
  value: z.unknown(),
  locationId: z.string().optional(),
});

export type UpdateFnbSettingInput = z.input<typeof updateFnbSettingSchema>;

export const getFnbSettingSchema = z.object({
  tenantId: z.string().min(1),
  moduleKey: z.enum(FNB_SETTINGS_MODULE_KEYS),
  settingKey: z.string().min(1),
  locationId: z.string().optional(),
});

export type GetFnbSettingInput = z.input<typeof getFnbSettingSchema>;

export const getFnbSettingsDefaultsSchema = z.object({
  moduleKey: z.enum(FNB_SETTINGS_MODULE_KEYS),
});

export type GetFnbSettingsDefaultsInput = z.input<typeof getFnbSettingsDefaultsSchema>;

export const validateFnbSettingsSchema = z.object({
  moduleKey: z.enum(FNB_SETTINGS_MODULE_KEYS),
  settings: z.record(z.string(), z.unknown()),
});

export type ValidateFnbSettingsInput = z.input<typeof validateFnbSettingsSchema>;

// ═══════════════════════════════════════════════════════════════════
// SESSION 13 — Real-Time Sync, Concurrency & Offline
// ═══════════════════════════════════════════════════════════════════

export const SOFT_LOCK_ENTITY_TYPES = ['tab', 'table', 'ticket'] as const;

export type SoftLockEntityType = (typeof SOFT_LOCK_ENTITY_TYPES)[number];

export const CHANNEL_TYPES = ['location', 'terminal', 'station', 'floor', 'tab'] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const OFFLINE_QUEUE_STATUSES = ['pending', 'syncing', 'synced', 'conflict', 'rejected'] as const;

export type OfflineQueueStatus = (typeof OFFLINE_QUEUE_STATUSES)[number];

// ── Soft Lock Commands ───────────────────────────────────────────

export const acquireSoftLockSchema = z.object({
  entityType: z.enum(SOFT_LOCK_ENTITY_TYPES),
  entityId: z.string().min(1),
  terminalId: z.string().optional(),
  ttlSeconds: z.number().int().min(5).max(300).default(30),
});

export type AcquireSoftLockInput = z.input<typeof acquireSoftLockSchema>;

export const renewSoftLockSchema = z.object({
  lockId: z.string().min(1),
  ttlSeconds: z.number().int().min(5).max(300).default(30),
});

export type RenewSoftLockInput = z.input<typeof renewSoftLockSchema>;

export const releaseSoftLockSchema = z.object({
  lockId: z.string().min(1),
});

export type ReleaseSoftLockInput = z.input<typeof releaseSoftLockSchema>;

export const forceReleaseSoftLockSchema = z.object({
  entityType: z.enum(SOFT_LOCK_ENTITY_TYPES),
  entityId: z.string().min(1),
});

export type ForceReleaseSoftLockInput = z.input<typeof forceReleaseSoftLockSchema>;

export const cleanExpiredLocksSchema = z.object({
  tenantId: z.string().min(1),
});

export type CleanExpiredLocksInput = z.input<typeof cleanExpiredLocksSchema>;

// ── Terminal Session Commands ─────────────────────────────────────

export const createTerminalSessionSchema = z.object({
  terminalId: z.string().min(1),
  locationId: z.string().min(1),
});

export type CreateTerminalSessionInput = z.input<typeof createTerminalSessionSchema>;

export const heartbeatTerminalSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export type HeartbeatTerminalSessionInput = z.input<typeof heartbeatTerminalSessionSchema>;

export const disconnectTerminalSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export type DisconnectTerminalSessionInput = z.input<typeof disconnectTerminalSessionSchema>;

// ── Soft Lock Queries ────────────────────────────────────────────

export const getActiveLockSchema = z.object({
  tenantId: z.string().min(1),
  entityType: z.enum(SOFT_LOCK_ENTITY_TYPES),
  entityId: z.string().min(1),
});

export type GetActiveLockInput = z.input<typeof getActiveLockSchema>;

export const listActiveLocksSchema = z.object({
  tenantId: z.string().min(1),
  entityType: z.enum(SOFT_LOCK_ENTITY_TYPES).optional(),
  locationId: z.string().optional(),
});

export type ListActiveLocksInput = z.input<typeof listActiveLocksSchema>;

export const listTerminalLocksSchema = z.object({
  tenantId: z.string().min(1),
  terminalId: z.string().min(1),
});

export type ListTerminalLocksInput = z.input<typeof listTerminalLocksSchema>;

// ═══════════════════════════════════════════════════════════════════
// SESSION 14 — Receipts, Printer Routing & Chit Design
// ═══════════════════════════════════════════════════════════════════

export const PRINT_JOB_TYPES = [
  'guest_check', 'kitchen_chit', 'bar_chit', 'delta_chit',
  'expo_chit', 'receipt', 'cash_drop_receipt', 'close_batch_report',
] as const;

export type PrintJobType = (typeof PRINT_JOB_TYPES)[number];

export const PRINT_JOB_STATUSES = ['queued', 'pending', 'printing', 'completed', 'failed'] as const;

export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

export const RECEIPT_COPY_TYPES = ['merchant', 'customer'] as const;

export type ReceiptCopyType = (typeof RECEIPT_COPY_TYPES)[number];

// ── Routing Rule Commands ────────────────────────────────────────

export const createRoutingRuleS14Schema = z.object({
  locationId: z.string().min(1),
  stationId: z.string().optional(),
  printerId: z.string().min(1),
  printJobType: z.enum(PRINT_JOB_TYPES),
  priority: z.number().int().min(0).max(100).default(0),
});

export type CreateRoutingRuleS14Input = z.input<typeof createRoutingRuleS14Schema>;

export const updateRoutingRuleS14Schema = z.object({
  ruleId: z.string().min(1),
  printerId: z.string().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateRoutingRuleS14Input = z.input<typeof updateRoutingRuleS14Schema>;

export const deleteRoutingRuleS14Schema = z.object({
  ruleId: z.string().min(1),
});

export type DeleteRoutingRuleS14Input = z.input<typeof deleteRoutingRuleS14Schema>;

// ── Print Job Commands ───────────────────────────────────────────

export const createPrintJobSchema = z.object({
  locationId: z.string().min(1),
  printJobType: z.enum(PRINT_JOB_TYPES),
  ticketId: z.string().optional(),
  tabId: z.string().optional(),
  orderId: z.string().optional(),
  closeBatchId: z.string().optional(),
  stationId: z.string().optional(),
  terminalId: z.string().optional(),
  printerId: z.string().optional(),
  receiptCopy: z.enum(RECEIPT_COPY_TYPES).optional(),
  formattedContent: z.string().optional(),
});

export type CreatePrintJobInput = z.input<typeof createPrintJobSchema>;

export const reprintJobSchema = z.object({
  jobId: z.string().min(1),
  reason: z.string().max(200).optional(),
});

export type ReprintJobInput = z.input<typeof reprintJobSchema>;

export const updatePrintJobStatusSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(PRINT_JOB_STATUSES),
  errorReason: z.string().max(500).optional(),
});

export type UpdatePrintJobStatusInput = z.input<typeof updatePrintJobStatusSchema>;

// ── Print Job Queries ────────────────────────────────────────────

export const listPrintJobsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  printerId: z.string().optional(),
  status: z.enum(PRINT_JOB_STATUSES).optional(),
  printJobType: z.enum(PRINT_JOB_TYPES).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export type ListPrintJobsInput = z.input<typeof listPrintJobsSchema>;

export const getPrintJobSchema = z.object({
  tenantId: z.string().min(1),
  jobId: z.string().min(1),
});

export type GetPrintJobInput = z.input<typeof getPrintJobSchema>;

export const listRoutingRulesS14Schema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  stationId: z.string().optional(),
  printJobType: z.enum(PRINT_JOB_TYPES).optional(),
});

export type ListRoutingRulesS14Input = z.input<typeof listRoutingRulesS14Schema>;

// ── Receipt / Chit Rendering ─────────────────────────────────────

export const renderGuestCheckSchema = z.object({
  tenantId: z.string().min(1),
  tabId: z.string().min(1),
  orderId: z.string().min(1),
  bySeat: z.boolean().default(false),
});

export type RenderGuestCheckInput = z.input<typeof renderGuestCheckSchema>;

export const renderReceiptSchema = z.object({
  tenantId: z.string().min(1),
  tabId: z.string().min(1),
  orderId: z.string().min(1),
  paymentSessionId: z.string().min(1),
  copy: z.enum(RECEIPT_COPY_TYPES).default('customer'),
});

export type RenderReceiptInput = z.input<typeof renderReceiptSchema>;

export const renderKitchenChitSchema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
});

export type RenderKitchenChitInput = z.input<typeof renderKitchenChitSchema>;

export const renderDeltaChitSchema = z.object({
  tenantId: z.string().min(1),
  deltaChitId: z.string().min(1),
});

export type RenderDeltaChitInput = z.input<typeof renderDeltaChitSchema>;

export const renderExpoChitSchema = z.object({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
});

export type RenderExpoChitInput = z.input<typeof renderExpoChitSchema>;

export const renderZReportSchema = z.object({
  tenantId: z.string().min(1),
  closeBatchId: z.string().min(1),
});

export type RenderZReportInput = z.input<typeof renderZReportSchema>;

// ═══════════════════════════════════════════════════════════════════
// Session 15 — F&B Reporting Read Models
// ═══════════════════════════════════════════════════════════════════

export const FNB_DAYPARTS = ['breakfast', 'lunch', 'dinner', 'late_night'] as const;
export type FnbDaypart = (typeof FNB_DAYPARTS)[number];

// ── Query Schemas ────────────────────────────────────────────────

export const getServerPerformanceSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  serverUserId: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export type GetServerPerformanceInput = z.input<typeof getServerPerformanceSchema>;

export const getTableTurnsSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  tableId: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export type GetTableTurnsInput = z.input<typeof getTableTurnsSchema>;

export const getKitchenPerformanceSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  stationId: z.string().optional(),
});

export type GetKitchenPerformanceInput = z.input<typeof getKitchenPerformanceSchema>;

export const getDaypartSalesSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  daypart: z.enum(FNB_DAYPARTS).optional(),
});

export type GetDaypartSalesInput = z.input<typeof getDaypartSalesSchema>;

export const getMenuMixSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  topN: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['quantity_sold', 'revenue']).default('revenue'),
});

export type GetMenuMixInput = z.input<typeof getMenuMixSchema>;

export const getDiscountCompAnalysisSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export type GetDiscountCompAnalysisInput = z.input<typeof getDiscountCompAnalysisSchema>;

export const getHourlySalesSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export type GetHourlySalesInput = z.input<typeof getHourlySalesSchema>;

// ═══════════════════════════════════════════════════════════════════
// Guest Pay — Pay at the Table via QR Code
// ═══════════════════════════════════════════════════════════════════

export const GUEST_PAY_SESSION_STATUSES = [
  'active', 'paid', 'expired', 'invalidated', 'superseded',
] as const;

export type GuestPaySessionStatus = (typeof GUEST_PAY_SESSION_STATUSES)[number];

export const GUEST_PAY_ATTEMPT_STATUSES = [
  'pending', 'succeeded', 'failed', 'simulated',
] as const;

export type GuestPayAttemptStatus = (typeof GUEST_PAY_ATTEMPT_STATUSES)[number];

// ── Command Schemas ──────────────────────────────────────────────

export const createGuestPaySessionSchema = z.object({
  tabId: z.string().min(1),
  orderId: z.string().min(1),
  clientRequestId: z.string().optional(),
});

export type CreateGuestPaySessionInput = z.input<typeof createGuestPaySessionSchema>;

export const selectGuestPayTipSchema = z.object({
  tipAmountCents: z.number().int().min(0),
  tipPresetPercent: z.number().optional(),
});

export type SelectGuestPayTipInput = z.input<typeof selectGuestPayTipSchema>;

export const simulateGuestPaymentSchema = z.object({
  tipAmountCents: z.number().int().min(0),
});

export type SimulateGuestPaymentInput = z.input<typeof simulateGuestPaymentSchema>;

export const invalidateGuestPaySessionSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().optional(),
});

export type InvalidateGuestPaySessionInput = z.input<typeof invalidateGuestPaySessionSchema>;

export const updateGuestPayTipSettingsSchema = z.object({
  locationId: z.string().min(1),
  isActive: z.boolean().optional(),
  tipType: z.enum(['percentage', 'amount']).optional(),
  tipPresets: z.array(z.number()).min(1).max(5).optional(),
  allowCustomTip: z.boolean().optional(),
  allowNoTip: z.boolean().optional(),
  defaultTipIndex: z.number().int().min(0).max(4).nullable().optional(),
  tipCalculationBase: z.enum(['subtotal_pre_tax', 'total_with_tax']).optional(),
  roundingMode: z.enum(['none', 'nearest_cent', 'nearest_5_cents']).optional(),
  maxTipPercent: z.number().int().min(1).max(100).optional(),
  maxTipAmountCents: z.number().int().min(100).max(1_000_000).optional(),
  sessionExpiryMinutes: z.number().int().min(5).max(1440).optional(),
});

export type UpdateGuestPayTipSettingsInput = z.input<typeof updateGuestPayTipSettingsSchema>;

// ── Guest Pay Member Charge ─────────────────────────────────────

// Path B Step 1: member enters credentials
export const guestPayMemberAuthSchema = z.object({
  memberNumber: z.string().min(1).max(50).trim(),
  phoneLast4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
});

export type GuestPayMemberAuthInput = z.input<typeof guestPayMemberAuthSchema>;

// Path B Step 2: member enters email verification code
export const guestPayMemberVerifySchema = z.object({
  verificationId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Must be exactly 6 digits'),
});

export type GuestPayMemberVerifyInput = z.input<typeof guestPayMemberVerifySchema>;

// Charge to member account (both paths)
export const chargeMemberAccountSchema = z.object({
  tipAmountCents: z.number().int().min(0),
  verificationId: z.string().min(1).optional(), // Required for Path B, absent for Path A
});

export type ChargeMemberAccountInput = z.input<typeof chargeMemberAccountSchema>;

export const getFnbDashboardSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().min(1),
});

export type GetFnbDashboardInput = z.input<typeof getFnbDashboardSchema>;

// ── My Section ────────────────────────────────────────────────────

export const saveMySectionSchema = z.object({
  roomId: z.string().min(1),
  tableIds: z.array(z.string().min(1)).max(100),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type SaveMySectionInput = z.input<typeof saveMySectionSchema>;

export const getMySectionFilterSchema = z.object({
  tenantId: z.string().min(1),
  serverUserId: z.string().min(1),
  roomId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetMySectionFilterInput = z.input<typeof getMySectionFilterSchema>;

export const getRoomSectionAssignmentsFilterSchema = z.object({
  tenantId: z.string().min(1),
  roomId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type GetRoomSectionAssignmentsFilterInput = z.input<typeof getRoomSectionAssignmentsFilterSchema>;

// ── Host Stand: Waitlist ──────────────────────────────────────────

export const WAITLIST_STATUSES = [
  'waiting', 'notified', 'seated', 'no_show', 'canceled',
] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const SEATING_PREFERENCES = [
  'any', 'indoor', 'outdoor', 'bar', 'patio', 'window', 'booth', 'quiet', 'high_top',
] as const;
export type SeatingPreference = (typeof SEATING_PREFERENCES)[number];

export const WAITLIST_SOURCES = [
  'host_stand', 'online', 'phone', 'reservation_walkin',
] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

export const OCCASIONS = [
  'birthday', 'anniversary', 'business', 'date_night', 'celebration', 'other',
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const addToWaitlistSchema = z.object({
  ...idempotencyMixin,
  guestName: z.string().min(1).max(100),
  guestPhone: z.string().max(20).optional(),
  guestEmail: z.string().email().optional(),
  partySize: z.number().int().min(1).max(100),
  seatingPreference: z.enum(SEATING_PREFERENCES).optional(),
  specialRequests: z.string().max(500).optional(),
  isVip: z.boolean().optional(),
  vipNote: z.string().max(200).optional(),
  customerId: z.string().optional(),
  source: z.enum(WAITLIST_SOURCES).optional(),
  notes: z.string().max(500).optional(),
  quotedWaitMinutes: z.number().int().min(0).optional(),
  estimatedArrivalAt: z.string().datetime().optional(),
});
export type AddToWaitlistInput = z.input<typeof addToWaitlistSchema>;

export const updateWaitlistEntrySchema = z.object({
  guestName: z.string().min(1).max(100).optional(),
  guestPhone: z.string().max(20).nullable().optional(),
  guestEmail: z.string().email().nullable().optional(),
  partySize: z.number().int().min(1).max(100).optional(),
  seatingPreference: z.enum(SEATING_PREFERENCES).nullable().optional(),
  specialRequests: z.string().max(500).nullable().optional(),
  isVip: z.boolean().optional(),
  vipNote: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  priority: z.number().int().min(0).max(2).optional(),
});
export type UpdateWaitlistEntryInput = z.input<typeof updateWaitlistEntrySchema>;

export const seatFromWaitlistSchema = z.object({
  ...idempotencyMixin,
  tableId: z.string().min(1),
  serverUserId: z.string().optional(),
});
export type SeatFromWaitlistInput = z.input<typeof seatFromWaitlistSchema>;

export const notifyWaitlistGuestSchema = z.object({
  method: z.enum(['sms', 'manual']).default('manual'),
});
export type NotifyWaitlistGuestInput = z.input<typeof notifyWaitlistGuestSchema>;

// ── Host Stand: Reservations ────────────────────────────────────

export const RESERVATION_STATUSES = [
  'confirmed', 'checked_in', 'seated', 'completed', 'no_show', 'canceled',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_SOURCES = [
  'host_stand', 'online', 'phone', 'google', 'third_party',
] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

export const createReservationSchema = z.object({
  ...idempotencyMixin,
  guestName: z.string().min(1).max(100),
  guestPhone: z.string().max(20).optional(),
  guestEmail: z.string().email().optional(),
  partySize: z.number().int().min(1).max(100),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  seatingPreference: z.enum(SEATING_PREFERENCES).optional(),
  specialRequests: z.string().max(500).optional(),
  occasion: z.enum(OCCASIONS).optional(),
  isVip: z.boolean().optional(),
  vipNote: z.string().max(200).optional(),
  customerId: z.string().optional(),
  assignedTableId: z.string().optional(),
  source: z.enum(RESERVATION_SOURCES).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateReservationInput = z.input<typeof createReservationSchema>;

export const updateReservationSchema = z.object({
  guestName: z.string().min(1).max(100).optional(),
  guestPhone: z.string().max(20).nullable().optional(),
  guestEmail: z.string().email().nullable().optional(),
  partySize: z.number().int().min(1).max(100).optional(),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  seatingPreference: z.enum(SEATING_PREFERENCES).nullable().optional(),
  specialRequests: z.string().max(500).nullable().optional(),
  occasion: z.enum(OCCASIONS).nullable().optional(),
  isVip: z.boolean().optional(),
  vipNote: z.string().max(200).nullable().optional(),
  assignedTableId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type UpdateReservationInput = z.input<typeof updateReservationSchema>;

export const checkInReservationSchema = z.object({
  ...idempotencyMixin,
  tableId: z.string().optional(),
  serverUserId: z.string().optional(),
});
export type CheckInReservationInput = z.input<typeof checkInReservationSchema>;

// ── Host Stand: Settings ────────────────────────────────────────

export const updateHostSettingsSchema = z.object({
  defaultTurnTimeMinutes: z.number().int().min(15).max(300).optional(),
  waitTimeMethod: z.enum(['historical', 'manual', 'hybrid']).optional(),
  waitTimeBufferMinutes: z.number().int().min(0).max(30).optional(),
  autoAssignServer: z.boolean().optional(),
  rotationMode: z.enum(['round_robin', 'cover_balance', 'manual']).optional(),
  maxWaitMinutes: z.number().int().min(30).max(300).optional(),
  autoNoShowMinutes: z.number().int().min(5).max(60).optional(),
  reservationSlotIntervalMinutes: z.enum(['15', '30', '60']).transform(Number).optional(),
  maxPartySize: z.number().int().min(1).max(100).optional(),
  minAdvanceHours: z.number().int().min(0).max(72).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  defaultReservationDurationMinutes: z.number().int().min(15).max(480).optional(),
  requirePhoneForWaitlist: z.boolean().optional(),
  requirePhoneForReservation: z.boolean().optional(),
  overbookingPercentage: z.number().int().min(0).max(50).optional(),
  pacingMaxCoversPerSlot: z.number().int().min(1).nullable().optional(),
  showWaitTimesToGuests: z.boolean().optional(),
  showQueuePosition: z.boolean().optional(),
  floorPlanDefaultView: z.enum(['layout', 'grid', 'list']).optional(),
});
export type UpdateHostSettingsInput = z.input<typeof updateHostSettingsSchema>;

// ── Host Stand: Queries ─────────────────────────────────────────

export const getWaitlistFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(WAITLIST_STATUSES).optional(),
});
export type GetWaitlistFilterInput = z.input<typeof getWaitlistFilterSchema>;

export const getReservationsFilterSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(RESERVATION_STATUSES).optional(),
});
export type GetReservationsFilterInput = z.input<typeof getReservationsFilterSchema>;

export const getHostDashboardSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type GetHostDashboardInput = z.input<typeof getHostDashboardSchema>;

export const getWaitTimeEstimateSchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  partySize: z.number().int().min(1),
  seatingPreference: z.enum(SEATING_PREFERENCES).optional(),
});
export type GetWaitTimeEstimateInput = z.input<typeof getWaitTimeEstimateSchema>;

export const getTableAvailabilitySchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  partySize: z.number().int().min(1),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  seatingPreference: z.enum(SEATING_PREFERENCES).optional(),
});
export type GetTableAvailabilityInput = z.input<typeof getTableAvailabilitySchema>;
