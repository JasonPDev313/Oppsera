// ═══════════════════════════════════════════════════════════════════
// F&B POS Frontend Types
// Mirrors backend query return types from @oppsera/module-fnb
// ═══════════════════════════════════════════════════════════════════

// ── Table Status Enum ─────────────────────────────────────────────

export type FnbTableStatus =
  | 'available'
  | 'reserved'
  | 'seated'
  | 'ordered'
  | 'entrees_fired'
  | 'dessert'
  | 'check_presented'
  | 'paid'
  | 'dirty'
  | 'blocked';

export type FnbTableType =
  | 'standard'
  | 'bar_seat'
  | 'communal'
  | 'booth'
  | 'high_top'
  | 'patio';

export type FnbTableShape =
  | 'round'
  | 'square'
  | 'rectangle'
  | 'oval'
  | 'custom';

export type FnbTabType = 'dine_in' | 'bar' | 'takeout' | 'delivery';

export type FnbTabStatus = 'open' | 'closed' | 'voided' | 'merged';

export type FnbCourseStatus =
  | 'unsent'
  | 'sent'
  | 'held'
  | 'fired'
  | 'cooking'
  | 'ready'
  | 'served';

export type FnbTicketStatus =
  | 'pending'
  | 'cooking'
  | 'ready'
  | 'bumped'
  | 'voided';

export type FnbTicketItemStatus =
  | 'pending'
  | 'cooking'
  | 'ready'
  | 'bumped'
  | 'voided';

export type FnbPaymentSessionStatus =
  | 'open'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type FnbPreauthStatus = 'created' | 'captured' | 'voided';

export type FnbCloseBatchStatus =
  | 'open'
  | 'reconciling'
  | 'reconciled'
  | 'posted'
  | 'locked';

export type FnbSplitStrategy =
  | 'by_seat'
  | 'by_item'
  | 'equal_split'
  | 'custom_amount';

// ── Floor Plan + Tables ───────────────────────────────────────────

export interface FnbTableWithStatus {
  tableId: string;
  floorPlanObjectId: string | null;
  tableNumber: number;
  displayLabel: string;
  capacityMin: number;
  capacityMax: number;
  tableType: string;
  shape: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  isCombinable: boolean;
  sectionId: string | null;
  // Live status fields
  status: FnbTableStatus;
  currentTabId: string | null;
  currentServerUserId: string | null;
  seatedAt: string | null;
  partySize: number | null;
  guestNames: string | null;
  combineGroupId: string | null;
  version: number;
}

export interface FnbCombineGroup {
  id: string;
  primaryTableId: string;
  combinedCapacity: number;
  tableIds: string[];
}

export interface FnbRoomInfo {
  id: string;
  name: string;
  slug: string;
  locationId: string;
  widthFt: number;
  heightFt: number;
  gridSizeFt: number;
  scalePxPerFt: number;
  defaultMode: string | null;
  capacity: number | null;
}

export interface FnbVersionInfo {
  id: string;
  versionNumber: number;
  snapshotJson: Record<string, unknown>;
  publishedAt: string | null;
}

export interface FloorPlanWithLiveStatus {
  room: FnbRoomInfo;
  version: FnbVersionInfo | null;
  tables: FnbTableWithStatus[];
  combineGroups: FnbCombineGroup[];
}

export interface FnbTableListItem {
  id: string;
  roomId: string;
  locationId: string;
  tableNumber: number;
  displayLabel: string;
  capacityMin: number;
  capacityMax: number;
  tableType: string;
  shape: string;
  isCombinable: boolean;
  isActive: boolean;
  sectionId: string | null;
  sortOrder: number;
  status: FnbTableStatus | null;
  currentTabId: string | null;
  currentServerUserId: string | null;
  seatedAt: string | null;
  partySize: number | null;
  combineGroupId: string | null;
  version: number | null;
}

// ── Sections ──────────────────────────────────────────────────────

export interface FnbSection {
  id: string;
  name: string;
  color: string | null;
  serverUserId: string | null;
  serverName: string | null;
  tableCount: number;
  isActive: boolean;
}

export interface FnbServerAssignment {
  id: string;
  sectionId: string;
  sectionName: string;
  serverUserId: string;
  serverName: string | null;
  status: string;
  assignedAt: string;
}

// ── Tabs + Checks ─────────────────────────────────────────────────

export interface FnbTabCourse {
  id: string;
  courseNumber: number;
  courseName: string;
  courseStatus: FnbCourseStatus;
  firedAt: string | null;
  sentAt: string | null;
  servedAt: string | null;
}

export interface FnbTabTransfer {
  id: string;
  transferType: string;
  fromServerUserId: string | null;
  toServerUserId: string | null;
  fromTableId: string | null;
  toTableId: string | null;
  reason: string | null;
  transferredBy: string;
  transferredAt: string;
}

export interface FnbTabLine {
  id: string;
  orderLineId: string | null;
  catalogItemId: string;
  catalogItemName: string | null;
  seatNumber: number | null;
  courseNumber: number | null;
  qty: number;
  unitPriceCents: number;
  extendedPriceCents: number;
  modifiers: string[];
  specialInstructions: string | null;
  status: string;
  sentAt: string | null;
  firedAt: string | null;
}

export interface FnbTabDetail {
  id: string;
  tabNumber: number;
  tabType: FnbTabType;
  status: FnbTabStatus;
  tableId: string | null;
  tableNumber: number | null;
  displayLabel: string | null;
  roomName: string | null;
  serverUserId: string;
  serverName: string | null;
  partySize: number | null;
  guestName: string | null;
  serviceType: string;
  businessDate: string;
  currentCourseNumber: number;
  primaryOrderId: string | null;
  customerId: string | null;
  splitFromTabId: string | null;
  splitStrategy: FnbSplitStrategy | null;
  runningTotalCents: number;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  version: number;
  metadata: Record<string, unknown> | null;
  courses: FnbTabCourse[];
  transfers: FnbTabTransfer[];
  lines: FnbTabLine[];
}

export interface FnbTabListItem {
  id: string;
  tabNumber: number;
  tabType: FnbTabType;
  status: FnbTabStatus;
  tableId: string | null;
  tableNumber: number | null;
  displayLabel: string | null;
  serverUserId: string;
  serverName: string | null;
  partySize: number | null;
  guestName: string | null;
  totalCents: number;
  openedAt: string;
  businessDate: string;
}

export interface CheckSummary {
  orderId: string;
  subtotalCents: number;
  taxTotalCents: number;
  serviceChargeTotalCents: number;
  discountTotalCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  tenderCount: number;
  status: string;
}

// ── Kitchen Tickets (KDS) ─────────────────────────────────────────

export interface KdsTicketItem {
  itemId: string;
  orderLineId: string;
  itemName: string;
  modifierSummary: string | null;
  specialInstructions: string | null;
  seatNumber: number | null;
  courseName: string | null;
  quantity: number;
  itemStatus: FnbTicketItemStatus;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
  startedAt: string | null;
  readyAt: string | null;
  elapsedSeconds: number;
}

export interface KdsTicketCard {
  ticketId: string;
  ticketNumber: number;
  tabId: string;
  courseNumber: number | null;
  status: FnbTicketStatus;
  tableNumber: number | null;
  serverName: string | null;
  sentAt: string;
  elapsedSeconds: number;
  items: KdsTicketItem[];
}

export interface KdsView {
  stationId: string;
  stationName: string;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  tickets: KdsTicketCard[];
  activeTicketCount: number;
}

// ── Expo View ─────────────────────────────────────────────────────

export interface ExpoTicketItem {
  itemId: string;
  itemName: string;
  modifierSummary: string | null;
  seatNumber: number | null;
  courseName: string | null;
  quantity: number;
  itemStatus: FnbTicketItemStatus;
  stationId: string | null;
  stationName: string | null;
  isRush: boolean;
  isAllergy: boolean;
  isVip: boolean;
}

export interface ExpoTicketCard {
  ticketId: string;
  ticketNumber: number;
  tabId: string;
  courseNumber: number | null;
  status: FnbTicketStatus;
  tableNumber: number | null;
  serverName: string | null;
  sentAt: string;
  elapsedSeconds: number;
  items: ExpoTicketItem[];
  allItemsReady: boolean;
  readyCount: number;
  totalCount: number;
}

export interface ExpoView {
  tickets: ExpoTicketCard[];
  totalActiveTickets: number;
  ticketsAllReady: number;
}

// ── Stations ──────────────────────────────────────────────────────

export interface FnbStation {
  id: string;
  name: string;
  stationType: string;
  displayOrder: number;
  isActive: boolean;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
}

export interface FnbStationMetrics {
  stationId: string;
  averageTicketTimeSeconds: number;
  ticketsCompleted: number;
  ticketsPending: number;
  ticketsPastThreshold: number;
}

// ── Payments + Pre-Auth ───────────────────────────────────────────

export interface FnbPaymentSession {
  id: string;
  tabId: string;
  status: FnbPaymentSessionStatus;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  tenderCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface FnbPreauth {
  id: string;
  tabId: string;
  cardLast4: string | null;
  amountCents: number;
  status: FnbPreauthStatus;
  createdAt: string;
  capturedAt: string | null;
  voidedAt: string | null;
}

// ── Tips ──────────────────────────────────────────────────────────

export interface FnbTipPool {
  id: string;
  name: string;
  distributionMethod: string;
  isActive: boolean;
  participantCount: number;
}

export interface FnbTipPoolDetail extends FnbTipPool {
  participants: Array<{
    id: string;
    userId: string;
    userName: string | null;
    points: number;
    hoursWorked: number | null;
  }>;
}

export interface FnbTipAdjustment {
  id: string;
  tabId: string;
  tabNumber: number;
  originalAmountCents: number;
  adjustedAmountCents: number;
  adjustedBy: string;
  adjustedAt: string;
  reason: string | null;
}

// ── Close Batch + Z-Report ────────────────────────────────────────

export interface FnbCloseBatch {
  id: string;
  locationId: string;
  businessDate: string;
  status: FnbCloseBatchStatus;
  startedAt: string;
  startedBy: string;
  postedAt: string | null;
  lockedAt: string | null;
}

export interface FnbZReport {
  closeBatchId: string;
  grossSalesCents: number;
  netSalesCents: number;
  taxCollectedCents: number;
  tipsCreditCents: number;
  tipsCashDeclaredCents: number;
  serviceChargesCents: number;
  discountsCents: number;
  compsCents: number;
  voidsCents: number;
  voidsCount: number;
  discountsCount: number;
  compsCount: number;
  coversCount: number;
  avgCheckCents: number;
  tenderBreakdown: Array<{
    tenderType: string;
    totalCents: number;
    count: number;
  }>;
  salesByDepartment: Array<{
    departmentName: string;
    totalCents: number;
  }> | null;
  taxByGroup: Array<{
    taxGroupName: string;
    totalCents: number;
  }> | null;
  cashStartingFloatCents: number;
  cashSalesCents: number;
  cashTipsCents: number;
  cashDropsCents: number;
  cashPaidOutsCents: number;
  cashExpectedCents: number;
  cashCountedCents: number | null;
  cashOverShortCents: number | null;
}

export interface FnbServerCheckout {
  id: string;
  serverUserId: string;
  serverName: string | null;
  status: string;
  salesCents: number;
  tipsCreditCents: number;
  tipsCashDeclaredCents: number;
  tabsServed: number;
  coversServed: number;
  cashOwedCents: number;
  cashCollectedCents: number | null;
  overShortCents: number | null;
}

export interface FnbCashDrop {
  id: string;
  amountCents: number;
  droppedBy: string;
  droppedAt: string;
  notes: string | null;
}

export interface FnbDepositSlip {
  closeBatchId: string;
  totalDepositCents: number;
  denominationBreakdown: Array<{
    denomination: string;
    count: number;
    totalCents: number;
  }>;
}

// ── Host Stand ────────────────────────────────────────────────────

export interface FnbServerOnFloor {
  serverUserId: string;
  serverName: string | null;
  sectionNames: string[];
  coversServed: number;
  openTabCount: number;
  totalSalesCents: number;
  shiftStatus: string;
}

export interface FnbHostStandView {
  servers: FnbServerOnFloor[];
  nextUpServerUserId: string | null;
  rotationOrder: string[];
  availableTableCount: number;
  seatedTableCount: number;
  totalTableCount: number;
}

// ── Dashboard Metrics ─────────────────────────────────────────────

export interface FnbDashboardMetrics {
  totalCovers: number;
  totalSales: number;
  avgCheck: number;
  tablesTurned: number;
  avgTurnTimeMinutes: number | null;
  tipTotal: number;
  tipPercentage: number | null;
  kitchenAvgTicketTimeSeconds: number | null;
  ticketsPastThreshold: number;
  topServer: { serverUserId: string; totalSales: number } | null;
  daypartBreakdown: Array<{
    daypart: string;
    covers: number;
    grossSales: number;
  }>;
  hourlySales: Array<{
    hour: number;
    salesCents: number;
    covers: number;
  }>;
}

// ── Allergens ─────────────────────────────────────────────────────

export interface FnbAllergen {
  id: string;
  name: string;
  icon: string | null;
  isActive: boolean;
}

export interface FnbItemAllergen {
  allergenId: string;
  allergenName: string;
  allergenIcon: string | null;
  severity: string | null;
}

// ── Menu Periods ──────────────────────────────────────────────────

export interface FnbMenuPeriod {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isActive: boolean;
}

export interface FnbEightySixedItem {
  id: string;
  catalogItemId: string;
  itemName: string;
  reason: string | null;
  eightySixedBy: string;
  eightySixedAt: string;
}

// ── Soft Locks ────────────────────────────────────────────────────

export interface FnbSoftLock {
  id: string;
  entityType: string;
  entityId: string;
  lockedBy: string;
  lockedByName: string | null;
  terminalId: string;
  acquiredAt: string;
  expiresAt: string;
}

// ── Reporting ─────────────────────────────────────────────────────

export interface FnbServerPerformance {
  serverUserId: string;
  serverName: string | null;
  covers: number;
  totalSales: number;
  avgCheck: number;
  tipPercentage: number | null;
  tabsServed: number;
  avgTurnTimeMinutes: number | null;
}

export interface FnbTableTurnData {
  tableId: string;
  tableNumber: number;
  turns: number;
  avgTurnTimeMinutes: number;
  totalCovers: number;
  totalSalesCents: number;
}

export interface FnbKitchenPerformance {
  stationId: string;
  stationName: string;
  avgTicketTimeSeconds: number;
  ticketsCompleted: number;
  ticketsPastThreshold: number;
  p95TicketTimeSeconds: number | null;
}

export interface FnbDaypartSales {
  daypart: string;
  covers: number;
  grossSalesCents: number;
  avgCheckCents: number;
  tabCount: number;
}

export interface FnbMenuMixItem {
  catalogItemId: string;
  itemName: string;
  departmentName: string | null;
  quantitySold: number;
  totalSalesCents: number;
  percentOfSales: number;
}

export interface FnbHourlySales {
  hour: number;
  salesCents: number;
  covers: number;
  tabCount: number;
}

// ── Draft Line (Local State) ──────────────────────────────────────

export interface FnbDraftLine {
  localId: string;
  catalogItemId: string;
  catalogItemName: string;
  itemType: string;
  unitPriceCents: number;
  qty: number;
  seatNumber: number;
  courseNumber: number;
  modifiers: Array<{
    modifierId: string;
    name: string;
    priceAdjustment: number;
  }>;
  specialInstructions: string | null;
  addedAt: number; // timestamp for ordering
}

// ── Navigation State ──────────────────────────────────────────────

export type FnbScreen = 'floor' | 'tab' | 'payment' | 'split';

export interface FnbNavigateParams {
  tabId?: string;
  roomId?: string;
  checkIndex?: number;
}

// ── Split Check Workspace ─────────────────────────────────────────

export interface FnbSplitCheck {
  checkIndex: number;
  label: string;
  lineIds: string[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  isPaid: boolean;
}

export interface FnbSplitWorkspace {
  strategy: FnbSplitStrategy;
  checks: FnbSplitCheck[];
  numberOfChecks: number;
}

// ── Pagination ────────────────────────────────────────────────────

export interface FnbPaginatedResult<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Table status color map (used in components) ───────────────────

export const FNB_TABLE_STATUS_COLORS: Record<FnbTableStatus, string> = {
  available: 'var(--fnb-status-available)',
  reserved: 'var(--fnb-status-reserved)',
  seated: 'var(--fnb-status-seated)',
  ordered: 'var(--fnb-status-ordered)',
  entrees_fired: 'var(--fnb-status-entrees-fired)',
  dessert: 'var(--fnb-status-dessert)',
  check_presented: 'var(--fnb-status-check-presented)',
  paid: 'var(--fnb-status-paid)',
  dirty: 'var(--fnb-status-dirty)',
  blocked: 'var(--fnb-status-blocked)',
};

export const FNB_TABLE_STATUS_LABELS: Record<FnbTableStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  seated: 'Seated',
  ordered: 'Ordered',
  entrees_fired: 'Entrees Fired',
  dessert: 'Dessert',
  check_presented: 'Check Presented',
  paid: 'Paid',
  dirty: 'Dirty',
  blocked: 'Blocked',
};

export const FNB_COURSE_STATUS_LABELS: Record<FnbCourseStatus, string> = {
  unsent: 'Unsent',
  sent: 'Sent',
  held: 'Held',
  fired: 'Fired',
  cooking: 'Cooking',
  ready: 'Ready',
  served: 'Served',
};
