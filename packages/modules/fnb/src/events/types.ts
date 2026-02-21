// ── F&B Event Constants ─────────────────────────────────────────
export const FNB_EVENTS = {
  // Session 1 — Table Management
  TABLE_STATUS_CHANGED: 'fnb.table.status_changed.v1',
  TABLES_SYNCED: 'fnb.table.synced_from_floor_plan.v1',
  TABLE_COMBINED: 'fnb.table.combined.v1',
  TABLE_UNCOMBINED: 'fnb.table.uncombined.v1',
  TABLE_CREATED: 'fnb.table.created.v1',
  TABLE_UPDATED: 'fnb.table.updated.v1',
  // Session 2 — Server Sections & Shift Model
  SECTION_CREATED: 'fnb.section.created.v1',
  SECTION_UPDATED: 'fnb.section.updated.v1',
  SERVER_ASSIGNED: 'fnb.server.assigned_to_section.v1',
  SERVER_CUT: 'fnb.server.cut.v1',
  SECTION_PICKED_UP: 'fnb.section.picked_up.v1',
  SHIFT_STATUS_CHANGED: 'fnb.shift.status_changed.v1',
  SERVER_CHECKOUT_COMPLETED: 'fnb.server.checkout_completed.v1',
  ROTATION_ADVANCED: 'fnb.rotation.advanced.v1',
  // Session 3 — Tabs, Checks & Seat Lifecycle
  TAB_OPENED: 'fnb.tab.opened.v1',
  TAB_UPDATED: 'fnb.tab.updated.v1',
  TAB_CLOSED: 'fnb.tab.closed.v1',
  TAB_VOIDED: 'fnb.tab.voided.v1',
  TAB_TRANSFERRED: 'fnb.tab.transferred.v1',
  TAB_REOPENED: 'fnb.tab.reopened.v1',
  TAB_SPLIT: 'fnb.tab.split.v1',
  COURSE_SENT: 'fnb.course.sent.v1',
  COURSE_FIRED: 'fnb.course.fired.v1',
  // Session 4 — Kitchen Tickets & Course Pacing
  TICKET_CREATED: 'fnb.ticket.created.v1',
  TICKET_STATUS_CHANGED: 'fnb.ticket.status_changed.v1',
  TICKET_ITEM_STATUS_CHANGED: 'fnb.ticket_item.status_changed.v1',
  TICKET_VOIDED: 'fnb.ticket.voided.v1',
  DELTA_CHIT_CREATED: 'fnb.delta_chit.created.v1',
  // Session 5 — KDS Stations & Expo
  STATION_CREATED: 'fnb.station.created.v1',
  STATION_UPDATED: 'fnb.station.updated.v1',
  ITEM_BUMPED: 'fnb.kds.item_bumped.v1',
  ITEM_RECALLED: 'fnb.kds.item_recalled.v1',
  TICKET_BUMPED: 'fnb.kds.ticket_bumped.v1',
  ITEM_CALLED_BACK: 'fnb.kds.item_called_back.v1',
  // Session 6 — 86 Board, Menu Availability & Allergens
  ITEM_EIGHTY_SIXED: 'fnb.menu.item_eighty_sixed.v1',
  ITEM_RESTORED: 'fnb.menu.item_restored.v1',
  MENU_PERIOD_CREATED: 'fnb.menu.period_created.v1',
  MENU_PERIOD_UPDATED: 'fnb.menu.period_updated.v1',
  ALLERGEN_TAGGED: 'fnb.menu.allergen_tagged.v1',
  // Session 7 — Split Checks, Merged Tabs & Payment Flows
  CHECK_PRESENTED: 'fnb.payment.check_presented.v1',
  PAYMENT_STARTED: 'fnb.payment.started.v1',
  TENDER_APPLIED: 'fnb.payment.tender_applied.v1',
  PAYMENT_COMPLETED: 'fnb.payment.completed.v1',
  PAYMENT_FAILED: 'fnb.payment.failed.v1',
  CHECK_COMPED: 'fnb.payment.check_comped.v1',
  CHECK_DISCOUNTED: 'fnb.payment.check_discounted.v1',
  CHECK_VOIDED: 'fnb.payment.check_voided.v1',
  CHECK_REFUNDED: 'fnb.payment.check_refunded.v1',
  // Session 8 — Pre-Auth Bar Tabs & Card-on-File
  PREAUTH_CREATED: 'fnb.preauth.created.v1',
  PREAUTH_CAPTURED: 'fnb.preauth.captured.v1',
  TIP_ADJUSTED: 'fnb.preauth.tip_adjusted.v1',
  TIP_FINALIZED: 'fnb.preauth.tip_finalized.v1',
  TAB_WALKOUT: 'fnb.tab.walkout.v1',
  // Session 9 — Tips, Tip Pooling & Gratuity Rules
  TIP_COLLECTED: 'fnb.tip.collected.v1',
  TIP_DECLARED: 'fnb.tip.declared.v1',
  TIP_POOL_DISTRIBUTED: 'fnb.tip.pool_distributed.v1',
  TIP_OUT_RECORDED: 'fnb.tip.tip_out_recorded.v1',
  // Session 10 — Close Batch, Z-Report & Cash Control
  CLOSE_BATCH_STARTED: 'fnb.close_batch.started.v1',
  SERVER_CHECKED_OUT: 'fnb.close_batch.server_checked_out.v1',
  CLOSE_BATCH_RECONCILED: 'fnb.close_batch.reconciled.v1',
  CLOSE_BATCH_POSTED: 'fnb.close_batch.posted.v1',
  DEPOSIT_RECORDED: 'fnb.close_batch.deposit_recorded.v1',
  // Session 11 — GL Posting & Accounting Wiring
  GL_POSTING_CREATED: 'fnb.gl.posting_created.v1',
  GL_POSTING_REVERSED: 'fnb.gl.posting_reversed.v1',
  GL_POSTING_FAILED: 'fnb.gl.posting_failed.v1',
  // Session 12 — F&B POS Settings
  SETTINGS_UPDATED: 'fnb.settings.updated.v1',
  // Session 13 — Real-Time Sync, Concurrency & Offline
  SOFT_LOCK_ACQUIRED: 'fnb.lock.acquired.v1',
  SOFT_LOCK_RELEASED: 'fnb.lock.released.v1',
  TERMINAL_CONNECTED: 'fnb.terminal.connected.v1',
  TERMINAL_DISCONNECTED: 'fnb.terminal.disconnected.v1',
  // Session 14 — Receipts, Printer Routing & Chit Design
  PRINT_JOB_CREATED: 'fnb.print.job_created.v1',
  PRINT_JOB_COMPLETED: 'fnb.print.job_completed.v1',
  PRINT_JOB_FAILED: 'fnb.print.job_failed.v1',
  PRINT_JOB_REPRINTED: 'fnb.print.job_reprinted.v1',
} as const;

// ── Session 1 Payloads ─────────────────────────────────────────

export interface TableStatusChangedPayload {
  tableId: string;
  roomId: string;
  locationId: string;
  oldStatus: string | null;
  newStatus: string;
  partySize: number | null;
  serverUserId: string | null;
  tabId: string | null;
}

export interface TablesSyncedPayload {
  roomId: string;
  locationId: string;
  versionId: string;
  tablesCreated: number;
  tablesUpdated: number;
  tablesDeactivated: number;
}

export interface TableCombinedPayload {
  combineGroupId: string;
  locationId: string;
  primaryTableId: string;
  tableIds: string[];
  combinedCapacity: number;
}

export interface TableUncombinedPayload {
  combineGroupId: string;
  locationId: string;
  tableIds: string[];
}

export interface TableCreatedPayload {
  tableId: string;
  roomId: string;
  locationId: string;
  tableNumber: number;
  displayLabel: string;
  capacityMax: number;
}

export interface TableUpdatedPayload {
  tableId: string;
  roomId: string;
  locationId: string;
  changes: Record<string, unknown>;
}

// ── Session 2 Payloads ─────────────────────────────────────────

export interface SectionCreatedPayload {
  sectionId: string;
  roomId: string;
  locationId: string;
  name: string;
}

export interface SectionUpdatedPayload {
  sectionId: string;
  changes: Record<string, unknown>;
}

export interface ServerAssignedPayload {
  assignmentId: string;
  sectionId: string;
  serverUserId: string;
  locationId: string;
  businessDate: string;
}

export interface ServerCutPayload {
  assignmentId: string;
  sectionId: string;
  serverUserId: string;
  locationId: string;
  cutBy: string;
}

export interface SectionPickedUpPayload {
  assignmentId: string;
  sectionId: string;
  originalServerUserId: string;
  newServerUserId: string;
  locationId: string;
}

export interface ShiftStatusChangedPayload {
  shiftExtensionId: string;
  serverUserId: string;
  locationId: string;
  oldStatus: string;
  newStatus: string;
}

export interface ServerCheckoutPayload {
  shiftExtensionId: string;
  serverUserId: string;
  locationId: string;
  coversServed: number;
  totalSalesCents: number;
  totalTipsCents: number;
}

export interface RotationAdvancedPayload {
  locationId: string;
  businessDate: string;
  nextServerUserId: string;
}

// ── Session 3 Payloads ─────────────────────────────────────────

export interface TabOpenedPayload {
  tabId: string;
  locationId: string;
  tabNumber: number;
  tabType: string;
  tableId: string | null;
  serverUserId: string;
  businessDate: string;
  partySize: number | null;
}

export interface TabUpdatedPayload {
  tabId: string;
  changes: Record<string, unknown>;
}

export interface TabClosedPayload {
  tabId: string;
  locationId: string;
  tableId: string | null;
  serverUserId: string;
  businessDate: string;
}

export interface TabVoidedPayload {
  tabId: string;
  locationId: string;
  tableId: string | null;
  serverUserId: string;
  reason: string;
  businessDate: string;
}

export interface TabTransferredPayload {
  tabId: string;
  locationId: string;
  fromServerUserId: string | null;
  toServerUserId: string | null;
  fromTableId: string | null;
  toTableId: string | null;
  reason: string | null;
}

export interface TabReopenedPayload {
  tabId: string;
  locationId: string;
  reopenedBy: string;
}

export interface TabSplitPayload {
  tabId: string;
  locationId: string;
  strategy: string;
  newTabIds: string[];
}

export interface CourseSentPayload {
  tabId: string;
  locationId: string;
  courseNumber: number;
}

export interface CourseFiredPayload {
  tabId: string;
  locationId: string;
  courseNumber: number;
}

// ── Session 4 Payloads ─────────────────────────────────────────

export interface TicketCreatedPayload {
  ticketId: string;
  locationId: string;
  tabId: string;
  orderId: string;
  ticketNumber: number;
  itemCount: number;
  businessDate: string;
}

export interface TicketStatusChangedPayload {
  ticketId: string;
  locationId: string;
  oldStatus: string;
  newStatus: string;
}

export interface TicketItemStatusChangedPayload {
  ticketItemId: string;
  ticketId: string;
  locationId: string;
  oldStatus: string;
  newStatus: string;
}

export interface TicketVoidedPayload {
  ticketId: string;
  locationId: string;
  tabId: string;
}

export interface DeltaChitCreatedPayload {
  deltaChitId: string;
  ticketId: string;
  locationId: string;
  deltaType: string;
  itemName: string;
}

// ── Session 5 Payloads ─────────────────────────────────────────

export interface StationCreatedPayload {
  stationId: string;
  locationId: string;
  name: string;
  stationType: string;
}

export interface StationUpdatedPayload {
  stationId: string;
  locationId: string;
  changes: Record<string, unknown>;
}

export interface ItemBumpedPayload {
  ticketItemId: string;
  ticketId: string;
  stationId: string;
  locationId: string;
}

export interface ItemRecalledPayload {
  ticketItemId: string;
  ticketId: string;
  stationId: string;
  locationId: string;
}

export interface TicketBumpedPayload {
  ticketId: string;
  locationId: string;
  tabId: string;
}

export interface ItemCalledBackPayload {
  ticketItemId: string;
  ticketId: string;
  stationId: string;
  locationId: string;
  reason: string | null;
}

// ── Session 6 Payloads ─────────────────────────────────────────

export interface ItemEightySixedPayload {
  eightySixLogId: string;
  locationId: string;
  entityType: string;
  entityId: string;
  stationId: string | null;
  reason: string | null;
  businessDate: string;
}

export interface ItemRestoredPayload {
  eightySixLogId: string;
  locationId: string;
  entityType: string;
  entityId: string;
}

export interface MenuPeriodCreatedPayload {
  menuPeriodId: string;
  locationId: string;
  name: string;
}

export interface MenuPeriodUpdatedPayload {
  menuPeriodId: string;
  locationId: string;
  changes: Record<string, unknown>;
}

export interface AllergenTaggedPayload {
  catalogItemId: string;
  allergenId: string;
  allergenName: string;
}

// ── Session 7 Payloads ─────────────────────────────────────────

export interface CheckPresentedPayload {
  tabId: string;
  orderId: string;
  locationId: string;
  totalCents: number;
  seatCount: number | null;
  perSeat: boolean;
  presentedBy: string;
}

export interface PaymentStartedPayload {
  paymentSessionId: string;
  tabId: string;
  orderId: string;
  locationId: string;
  totalAmountCents: number;
}

export interface TenderAppliedPayload {
  paymentSessionId: string;
  tenderId: string;
  tabId: string;
  orderId: string;
  locationId: string;
  amountCents: number;
  tenderType: string;
}

export interface PaymentCompletedPayload {
  paymentSessionId: string;
  tabId: string;
  orderId: string;
  locationId: string;
  totalTendersCents: number;
  changeCents: number;
}

export interface PaymentFailedPayload {
  paymentSessionId: string;
  tabId: string;
  orderId: string;
  locationId: string;
  reason: string;
}

export interface CheckCompedPayload {
  orderId: string;
  orderLineId: string;
  locationId: string;
  compAmountCents: number;
  reason: string;
  compedBy: string;
}

export interface CheckDiscountedPayload {
  orderId: string;
  locationId: string;
  discountAmountCents: number;
  discountType: string;
  percentage: number | null;
}

export interface CheckVoidedPayload {
  orderId: string;
  tabId: string;
  locationId: string;
  reason: string;
  voidedBy: string;
}

export interface CheckRefundedPayload {
  tenderId: string;
  orderId: string;
  locationId: string;
  refundAmountCents: number;
  refundMethod: string;
  originalTenderId: string;
}

// ── Session 8 Payloads ─────────────────────────────────────────

export interface PreauthCreatedPayload {
  preauthId: string;
  tabId: string;
  locationId: string;
  authAmountCents: number;
  cardLast4: string;
  cardBrand: string | null;
  expiresAt: string;
}

export interface PreauthCapturedPayload {
  preauthId: string;
  tabId: string;
  locationId: string;
  authAmountCents: number;
  capturedAmountCents: number;
  tipAmountCents: number;
}

export interface TipAdjustedPayload {
  adjustmentId: string;
  tabId: string;
  locationId: string;
  preauthId: string | null;
  tenderId: string | null;
  originalTipCents: number;
  adjustedTipCents: number;
}

export interface TipFinalizedPayload {
  tabId: string;
  locationId: string;
  adjustmentCount: number;
  totalFinalizedTipCents: number;
}

export interface TabWalkoutPayload {
  tabId: string;
  locationId: string;
  preauthId: string | null;
  capturedAmountCents: number;
  autoGratuityPercentage: number | null;
}

// ── Session 9 Payloads ─────────────────────────────────────────

export interface TipCollectedPayload {
  tabId: string;
  locationId: string;
  serverUserId: string;
  tipAmountCents: number;
  source: string; // card | cash | auto_gratuity
}

export interface TipDeclaredPayload {
  declarationId: string;
  serverUserId: string;
  locationId: string;
  businessDate: string;
  cashTipsDeclaredCents: number;
  meetsMinimumThreshold: boolean;
}

export interface TipPoolDistributedPayload {
  distributionId: string;
  poolId: string;
  locationId: string;
  businessDate: string;
  totalPoolAmountCents: number;
  participantCount: number;
}

export interface TipOutRecordedPayload {
  tipOutId: string;
  fromServerUserId: string;
  toEmployeeId: string;
  locationId: string;
  businessDate: string;
  amountCents: number;
  calculationMethod: string;
}

// ── Session 10 Payloads ─────────────────────────────────────────

export interface CloseBatchStartedPayload {
  closeBatchId: string;
  locationId: string;
  businessDate: string;
  startedBy: string;
  startingFloatCents: number;
}

export interface ServerCheckedOutPayload {
  checkoutId: string;
  closeBatchId: string;
  serverUserId: string;
  locationId: string;
  businessDate: string;
  totalSalesCents: number;
  cashOwedToHouseCents: number;
}

export interface CloseBatchReconciledPayload {
  closeBatchId: string;
  locationId: string;
  businessDate: string;
  reconciledBy: string;
  cashOverShortCents: number | null;
}

export interface CloseBatchPostedPayload {
  closeBatchId: string;
  locationId: string;
  businessDate: string;
  postedBy: string;
  glJournalEntryId: string | null;
}

export interface DepositRecordedPayload {
  depositId: string;
  closeBatchId: string;
  locationId: string;
  depositAmountCents: number;
  depositDate: string;
}

// ── Session 11 Payloads ─────────────────────────────────────────

export interface GlPostingCreatedPayload {
  closeBatchId: string;
  locationId: string;
  businessDate: string;
  glJournalEntryId: string;
  totalDebitCents: number;
  totalCreditCents: number;
  lineCount: number;
}

export interface GlPostingReversedPayload {
  closeBatchId: string;
  locationId: string;
  businessDate: string;
  originalGlJournalEntryId: string;
  reversalGlJournalEntryId: string;
  reason: string;
}

export interface GlPostingFailedPayload {
  closeBatchId: string;
  locationId: string;
  businessDate: string;
  errorCode: string;
  errorMessage: string;
}

// ── Session 12 Payloads ─────────────────────────────────────────

export interface SettingsUpdatedPayload {
  moduleKey: string;
  locationId: string | null;
  changedKeys: string[];
  updatedBy: string;
}

// ── Session 13 Payloads ─────────────────────────────────────────

export interface SoftLockAcquiredPayload {
  lockId: string;
  entityType: string;
  entityId: string;
  lockedBy: string;
  terminalId: string | null;
  expiresAt: string;
}

export interface SoftLockReleasedPayload {
  lockId: string;
  entityType: string;
  entityId: string;
  releasedBy: string;
  forced: boolean;
}

export interface TerminalConnectedPayload {
  sessionId: string;
  terminalId: string;
  locationId: string;
  userId: string;
  subscribedChannels: string[];
}

export interface TerminalDisconnectedPayload {
  sessionId: string;
  terminalId: string;
  locationId: string;
  userId: string;
  locksReleased: number;
}

// ── Session 14 Payloads ─────────────────────────────────────────

export interface PrintJobCreatedPayload {
  jobId: string;
  locationId: string;
  printJobType: string;
  printerId: string;
  stationId: string | null;
  ticketId: string | null;
  tabId: string | null;
}

export interface PrintJobCompletedPayload {
  jobId: string;
  locationId: string;
  printerId: string;
  printJobType: string;
  retryCount: number;
}

export interface PrintJobFailedPayload {
  jobId: string;
  locationId: string;
  printerId: string;
  printJobType: string;
  errorReason: string;
  retryCount: number;
}

export interface PrintJobReprintedPayload {
  originalJobId: string;
  reprintJobId: string;
  locationId: string;
  printJobType: string;
  userId: string;
  reason: string | null;
}
