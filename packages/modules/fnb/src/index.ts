// Module metadata
export const MODULE_KEY = 'pos_fnb' as const;
export const MODULE_NAME = 'F&B POS';
export const MODULE_VERSION = '0.1.0';

// ═══════════════════════════════════════════════════════════════════
// Session 1: Table Management
// ═══════════════════════════════════════════════════════════════════

// Commands
export { syncTablesFromFloorPlan } from './commands/sync-tables-from-floor-plan';
export { createTable } from './commands/create-table';
export { updateTable } from './commands/update-table';
export { updateTableStatus } from './commands/update-table-status';
export { seatTable } from './commands/seat-table';
export { clearTable } from './commands/clear-table';
export { combineTables } from './commands/combine-tables';
export { uncombineTables } from './commands/uncombine-tables';

// Queries
export { listTables } from './queries/list-tables';
export type { FnbTableListItem } from './queries/list-tables';
export { getTable } from './queries/get-table';
export type { FnbTableDetail } from './queries/get-table';
export { getFloorPlanWithLiveStatus } from './queries/get-floor-plan-with-live-status';
export type {
  FloorPlanWithLiveStatus,
  FloorPlanTableWithStatus,
} from './queries/get-floor-plan-with-live-status';
export { getAvailableTables } from './queries/get-available-tables';
export type { AvailableTable } from './queries/get-available-tables';
export { listTableStatusHistory } from './queries/list-table-status-history';
export type { TableStatusHistoryItem } from './queries/list-table-status-history';

// Helpers
export { extractTablesFromSnapshot } from './helpers/extract-tables-from-snapshot';
export { generateLookupCode } from './helpers/lookup-code';
export { buildReceiptHtml } from './helpers/receipt-html';
export type { ReceiptData as GuestReceiptData, ReceiptLineItem } from './helpers/receipt-html';
export type { FloorPlanTableEntry } from './helpers/extract-tables-from-snapshot';

// ═══════════════════════════════════════════════════════════════════
// Session 2: Server Sections & Shift Model
// ═══════════════════════════════════════════════════════════════════

// Commands
export { createSection } from './commands/create-section';
export { updateSection } from './commands/update-section';
export { assignServerToSection } from './commands/assign-server-to-section';
export { cutServer } from './commands/cut-server';
export { pickupSection } from './commands/pickup-section';
export { createShiftExtension } from './commands/create-shift-extension';
export { updateShiftStatus } from './commands/update-shift-status';
export { advanceRotation } from './commands/advance-rotation';

// Queries
export { listSections } from './queries/list-sections';
export type { SectionListItem } from './queries/list-sections';
export { listServerAssignments } from './queries/list-server-assignments';
export type { ServerAssignmentItem } from './queries/list-server-assignments';
export { getHostStandView } from './queries/get-host-stand-view';
export type { HostStandView, ServerOnFloor } from './queries/get-host-stand-view';

// ═══════════════════════════════════════════════════════════════════
// Session 3: Tabs, Checks & Seat Lifecycle
// ═══════════════════════════════════════════════════════════════════

// Commands
export { openTab } from './commands/open-tab';
export { updateTab } from './commands/update-tab';
export { closeTab } from './commands/close-tab';
export { voidTab } from './commands/void-tab';
export { transferTab } from './commands/transfer-tab';
export { reopenTab } from './commands/reopen-tab';
export { fireCourse } from './commands/fire-course';
export { sendCourse } from './commands/send-course';
export { addTabItems } from './commands/add-tab-items';
export { splitTab } from './commands/split-tab';

// Queries
export { listTabs } from './queries/list-tabs';
export type { FnbTabListItem } from './queries/list-tabs';
export { getTabDetail } from './queries/get-tab-detail';
export type { FnbTabDetail, TabCourseDetail, TabTransferRecord } from './queries/get-tab-detail';

// ═══════════════════════════════════════════════════════════════════
// Session 4: Course Pacing, Hold/Fire & Kitchen Tickets
// ═══════════════════════════════════════════════════════════════════

// Commands
export { createKitchenTicket } from './commands/create-kitchen-ticket';
export { updateTicketStatus } from './commands/update-ticket-status';
export { updateTicketItemStatus } from './commands/update-ticket-item-status';
export { voidTicket } from './commands/void-ticket';
export { createDeltaChit } from './commands/create-delta-chit';
export { createRoutingRule } from './commands/create-routing-rule';
export { updateRoutingRule } from './commands/update-routing-rule';

// Queries
export { listKitchenTickets } from './queries/list-kitchen-tickets';
export type { KitchenTicketListItem } from './queries/list-kitchen-tickets';
export { getKitchenTicketDetail } from './queries/get-kitchen-ticket-detail';
export type { KitchenTicketDetail, TicketItemDetail, DeltaChitDetail } from './queries/get-kitchen-ticket-detail';
export { listRoutingRules } from './queries/list-routing-rules';
export type { RoutingRuleListItem } from './queries/list-routing-rules';

// ═══════════════════════════════════════════════════════════════════
// Session 5: KDS Stations & Expo
// ═══════════════════════════════════════════════════════════════════

// Commands
export { createStation } from './commands/create-station';
export { updateStation } from './commands/update-station';
export { upsertDisplayConfig } from './commands/upsert-display-config';
export { bumpItem } from './commands/bump-item';
export { recallItem } from './commands/recall-item';
export { bumpTicket } from './commands/bump-ticket';
export { callBackToStation } from './commands/call-back-to-station';

// Queries
export { listStations } from './queries/list-stations';
export type { StationListItem } from './queries/list-stations';
export { getStationDetail } from './queries/get-station-detail';
export type { StationDetail, DisplayConfig } from './queries/get-station-detail';
export { getKdsView } from './queries/get-kds-view';
export type { KdsView, KdsTicketCard, KdsTicketItem } from './queries/get-kds-view';
export { getExpoView } from './queries/get-expo-view';
export type { ExpoView, ExpoTicketCard, ExpoTicketItem } from './queries/get-expo-view';
export { getStationMetrics } from './queries/get-station-metrics';
export type { StationMetrics } from './queries/get-station-metrics';

// ═══════════════════════════════════════════════════════════════════
// Session 6: Modifiers, 86 Board & Menu Availability
// ═══════════════════════════════════════════════════════════════════

// Commands
export { eightySixItem } from './commands/eighty-six-item';
export { restoreItem } from './commands/restore-item';
export { createMenuPeriod } from './commands/create-menu-period';
export { updateMenuPeriod } from './commands/update-menu-period';
export { createAvailabilityWindow } from './commands/create-availability-window';
export { updateAvailabilityWindow } from './commands/update-availability-window';
export { createAllergen } from './commands/create-allergen';
export { tagItemAllergen } from './commands/tag-item-allergen';
export { removeItemAllergen } from './commands/remove-item-allergen';
export { createPrepNotePreset } from './commands/create-prep-note-preset';

// Queries
export { listEightySixed } from './queries/list-eighty-sixed';
export type { EightySixedItem } from './queries/list-eighty-sixed';
export { listMenuPeriods } from './queries/list-menu-periods';
export type { MenuPeriodItem } from './queries/list-menu-periods';
export { listAllergens } from './queries/list-allergens';
export type { AllergenItem } from './queries/list-allergens';
export { getItemAllergens } from './queries/get-item-allergens';
export type { ItemAllergenDetail } from './queries/get-item-allergens';
export { listPrepNotePresets } from './queries/list-prep-note-presets';
export type { PrepNotePresetItem } from './queries/list-prep-note-presets';

// ═══════════════════════════════════════════════════════════════════
// Session 7: Split Checks, Merged Tabs & Payment Flows
// ═══════════════════════════════════════════════════════════════════

// Commands
export { createAutoGratuityRule } from './commands/create-auto-gratuity-rule';
export { updateAutoGratuityRule } from './commands/update-auto-gratuity-rule';
export { presentCheck } from './commands/present-check';
export { startPaymentSession } from './commands/start-payment-session';
export { completePaymentSession } from './commands/complete-payment-session';
export { failPaymentSession } from './commands/fail-payment-session';
export { applySplitStrategy } from './commands/apply-split-strategy';
export { rejoinChecks } from './commands/rejoin-checks';
export { compItem } from './commands/comp-item';
export { discountCheck } from './commands/discount-check';
export { voidCheck } from './commands/void-check';
export { refundCheck } from './commands/refund-check';
export { recordSplitTender } from './commands/record-split-tender';

// Queries
export { listAutoGratuityRules } from './queries/list-auto-gratuity-rules';
export type { AutoGratuityRuleItem } from './queries/list-auto-gratuity-rules';
export { getPaymentSession } from './queries/get-payment-session';
export type { PaymentSessionDetail } from './queries/get-payment-session';
export { listPaymentSessions } from './queries/list-payment-sessions';
export type { PaymentSessionListItem } from './queries/list-payment-sessions';
export { getCheckSummary } from './queries/get-check-summary';
export type { CheckSummaryItem } from './queries/get-check-summary';

// ═══════════════════════════════════════════════════════════════════
// Session 8: Pre-Auth Bar Tabs & Card-on-File
// ═══════════════════════════════════════════════════════════════════

// Commands
export { createPreauth } from './commands/create-preauth';
export { capturePreauth } from './commands/capture-preauth';
export { voidPreauth } from './commands/void-preauth';
export { adjustTip } from './commands/adjust-tip';
export { finalizeTip } from './commands/finalize-tip';
export { markTabWalkout } from './commands/mark-tab-walkout';

// Queries
export { getTabPreauths } from './queries/get-tab-preauths';
export type { TabPreauthItem } from './queries/get-tab-preauths';
export { listTipAdjustments } from './queries/list-tip-adjustments';
export type { TipAdjustmentItem } from './queries/list-tip-adjustments';
export { listOpenPreauths } from './queries/list-open-preauths';
export type { OpenPreauthItem } from './queries/list-open-preauths';

// ═══════════════════════════════════════════════════════════════════
// Session 9: Tips, Tip Pooling & Gratuity Rules
// ═══════════════════════════════════════════════════════════════════

// Commands
export { createTipPool } from './commands/create-tip-pool';
export { updateTipPool } from './commands/update-tip-pool';
export { addPoolParticipant } from './commands/add-pool-participant';
export { removePoolParticipant } from './commands/remove-pool-participant';
export { distributeTipPool } from './commands/distribute-tip-pool';
export { declareCashTips } from './commands/declare-cash-tips';
export { recordTipOut } from './commands/record-tip-out';

// Queries
export { listTipPools } from './queries/list-tip-pools';
export type { TipPoolListItem } from './queries/list-tip-pools';
export { getTipPoolDetail } from './queries/get-tip-pool-detail';
export type { TipPoolDetail, TipPoolParticipantDetail } from './queries/get-tip-pool-detail';
export { listTipDeclarations } from './queries/list-tip-declarations';
export type { TipDeclarationItem } from './queries/list-tip-declarations';
export { listTipOutEntries } from './queries/list-tip-out-entries';
export type { TipOutEntryItem } from './queries/list-tip-out-entries';
export { getTipPoolDistributions } from './queries/get-tip-pool-distributions';
export type { TipPoolDistributionItem } from './queries/get-tip-pool-distributions';

// ═══════════════════════════════════════════════════════════════════
// Session 10: Close Batch, Z-Report & Cash Control
// ═══════════════════════════════════════════════════════════════════

// Commands
export { startCloseBatch } from './commands/start-close-batch';
export { beginServerCheckout } from './commands/begin-server-checkout';
export { completeServerCheckoutS10 } from './commands/complete-server-checkout-s10';
export { recordCashDrop } from './commands/record-cash-drop';
export { recordCashPaidOut } from './commands/record-cash-paid-out';
export { recordCashCount } from './commands/record-cash-count';
export { reconcileCloseBatch } from './commands/reconcile-close-batch';
export { postCloseBatch } from './commands/post-close-batch';
export { lockCloseBatch } from './commands/lock-close-batch';
export { recordDeposit } from './commands/record-deposit';

// Queries
export { getCloseBatch } from './queries/get-close-batch';
export type { CloseBatchDetail } from './queries/get-close-batch';
export { getZReport } from './queries/get-z-report';
export type { ZReportData } from './queries/get-z-report';
export { listServerCheckouts } from './queries/list-server-checkouts';
export type { ServerCheckoutItem } from './queries/list-server-checkouts';
export { listCashDrops } from './queries/list-cash-drops';
export type { CashDropItem } from './queries/list-cash-drops';
export { listCashPaidOuts } from './queries/list-cash-paid-outs';
export type { CashPaidOutItem } from './queries/list-cash-paid-outs';
export { getDepositSlip } from './queries/get-deposit-slip';
export type { DepositSlipDetail } from './queries/get-deposit-slip';

// ═══════════════════════════════════════════════════════════════════
// Session 11: GL Posting & Accounting Wiring
// ═══════════════════════════════════════════════════════════════════

// Commands
export { configureFnbGlMapping } from './commands/configure-fnb-gl-mapping';
export { updateFnbPostingConfig } from './commands/update-fnb-posting-config';
export { postBatchToGl } from './commands/post-batch-to-gl';
export { reverseBatchPosting } from './commands/reverse-batch-posting';
export { retryBatchPosting } from './commands/retry-batch-posting';

// Queries
export { listFnbGlMappings } from './queries/list-fnb-gl-mappings';
export type { FnbGlMappingItem } from './queries/list-fnb-gl-mappings';
export { listUnpostedBatches } from './queries/list-unposted-batches';
export type { UnpostedBatchItem } from './queries/list-unposted-batches';
export { getBatchPostingStatus } from './queries/get-batch-posting-status';
export type { BatchPostingStatus } from './queries/get-batch-posting-status';
export { getPostingReconciliation } from './queries/get-posting-reconciliation';
export type { PostingReconciliationData } from './queries/get-posting-reconciliation';

// Helpers
export { buildBatchJournalLines } from './helpers/build-batch-journal-lines';
export type { JournalLine } from './helpers/build-batch-journal-lines';

// ═══════════════════════════════════════════════════════════════════
// Session 12: F&B POS Settings Module
// ═══════════════════════════════════════════════════════════════════

// Commands
export { updateFnbSettings } from './commands/update-fnb-settings';
export type { UpdateFnbSettingsResult } from './commands/update-fnb-settings';
export { updateFnbSetting } from './commands/update-fnb-setting';
export type { UpdateFnbSettingResult } from './commands/update-fnb-setting';
export { seedFnbSettings } from './commands/seed-fnb-settings';
export type { SeedFnbSettingsResult } from './commands/seed-fnb-settings';

// Queries
export { getFnbSettings } from './queries/get-fnb-settings';
export type { FnbSettingsResult } from './queries/get-fnb-settings';
export { getFnbSetting } from './queries/get-fnb-setting';
export type { FnbSettingResult } from './queries/get-fnb-setting';
export { getFnbSettingsDefaults } from './queries/get-fnb-settings-defaults';
export type { FnbSettingsDefaultsResult } from './queries/get-fnb-settings-defaults';
export { validateFnbSettings } from './queries/validate-fnb-settings';
export type { FnbSettingsValidationResult } from './queries/validate-fnb-settings';

// Helpers
export { FNB_SETTINGS_DEFAULTS, getSettingDefault, getSettingKeys } from './helpers/fnb-settings-defaults';

// ═══════════════════════════════════════════════════════════════════
// Session 13: Real-Time Sync, Concurrency & Offline
// ═══════════════════════════════════════════════════════════════════

// Commands
export { acquireSoftLock } from './commands/acquire-soft-lock';
export type { AcquireSoftLockResult } from './commands/acquire-soft-lock';
export { renewSoftLock } from './commands/renew-soft-lock';
export type { RenewSoftLockResult } from './commands/renew-soft-lock';
export { releaseSoftLock } from './commands/release-soft-lock';
export { forceReleaseSoftLock } from './commands/force-release-soft-lock';
export { cleanExpiredLocks } from './commands/clean-expired-locks';
export type { CleanExpiredLocksResult } from './commands/clean-expired-locks';

// Queries
export { getActiveLock } from './queries/get-active-lock';
export type { ActiveLockDetail } from './queries/get-active-lock';
export { listActiveLocks } from './queries/list-active-locks';
export type { ActiveLockItem } from './queries/list-active-locks';
export { listTerminalLocks } from './queries/list-terminal-locks';
export type { TerminalLockItem } from './queries/list-terminal-locks';

// Helpers
export {
  buildChannelName,
  parseChannelName,
  getEventChannels,
  getDefaultSubscriptions,
} from './helpers/channel-topology';
export type { ChannelScope } from './helpers/channel-topology';
export {
  OFFLINE_ALLOWED_OPERATIONS,
  OFFLINE_BLOCKED_OPERATIONS,
  isOfflineAllowed,
  DEFAULT_MAX_OFFLINE_QUEUE_SIZE,
} from './helpers/offline-queue-types';
export type {
  OfflineQueueItem,
  OfflineQueueState,
  OfflineAllowedOperation,
  OfflineBlockedOperation,
} from './helpers/offline-queue-types';

// ═══════════════════════════════════════════════════════════════════
// Session 14: Receipts, Printer Routing & Chit Design
// ═══════════════════════════════════════════════════════════════════

// Commands
export { createRoutingRuleS14 } from './commands/create-routing-rule-s14';
export type { CreateRoutingRuleS14Result } from './commands/create-routing-rule-s14';
export { updateRoutingRuleS14 } from './commands/update-routing-rule-s14';
export type { UpdateRoutingRuleS14Result } from './commands/update-routing-rule-s14';
export { createPrintJob } from './commands/create-print-job';
export type { CreatePrintJobResult } from './commands/create-print-job';
export { reprintJob } from './commands/reprint-job';
export type { ReprintJobResult } from './commands/reprint-job';
export { updatePrintJobStatus } from './commands/update-print-job-status';
export type { UpdatePrintJobStatusResult } from './commands/update-print-job-status';

// Queries
export { listRoutingRulesS14 } from './queries/list-routing-rules-s14';
export type { RoutingRuleS14Item } from './queries/list-routing-rules-s14';
export { listPrintJobs } from './queries/list-print-jobs';
export type { PrintJobListItem } from './queries/list-print-jobs';
export { getPrintJob } from './queries/get-print-job';
export type { PrintJobDetail } from './queries/get-print-job';

// Helpers — Chit Layout Renderers
export {
  fitLine, rightAlign, centerText, formatDollars,
  renderKitchenChitText,
  renderDeltaChitText,
  renderGuestCheckText,
  renderReceiptText,
  renderExpoChitText,
  renderZReportText,
} from './helpers/chit-layout';
export type {
  KitchenChitData, KitchenChitItem,
  DeltaChitData, DeltaChitItem,
  GuestCheckData, GuestCheckItem,
  ReceiptData as ChitReceiptData,
  ExpoChitData, ExpoChitItem,
  ZReportData as ZReportChitData,
} from './helpers/chit-layout';

// Helpers — Kitchen Modifier Formatting
export { formatModifierForKitchen } from './helpers/format-modifier-for-kitchen';
export type { KitchenModifier, ModifierInstruction } from './helpers/format-modifier-for-kitchen';

// Helpers — Printer Routing
export { resolveRoutedPrinter, isReceiptType, isStationType } from './helpers/printer-routing';
export type { RoutingRule, PrintRoutingContext } from './helpers/printer-routing';

// ═══════════════════════════════════════════════════════════════════
// Guest Pay — Pay at the Table via QR Code
// ═══════════════════════════════════════════════════════════════════

// Commands
export { createGuestPaySession } from './commands/create-guest-pay-session';
export { selectGuestPayTip } from './commands/select-guest-pay-tip';
export { simulateGuestPayment } from './commands/simulate-guest-payment';
export { invalidateGuestPaySession } from './commands/invalidate-guest-pay-session';
export { updateGuestPayTipSettings } from './commands/update-guest-pay-tip-settings';
export { expireGuestPaySessions } from './commands/expire-guest-pay-sessions';
export { chargeMemberAccount } from './commands/charge-member-account';

// Queries
export { getGuestPaySessionByToken } from './queries/get-guest-pay-session-by-token';
export { getGuestPaySessionByLookupCode } from './queries/get-guest-pay-session-by-lookup-code';
export { getGuestPaySession } from './queries/get-guest-pay-session';
export { listGuestPaySessionsForTab } from './queries/list-guest-pay-sessions-for-tab';
export { getGuestPayTipSettings } from './queries/get-guest-pay-tip-settings';
export { getActiveGuestPayForTab } from './queries/get-active-guest-pay-for-tab';

// ═══════════════════════════════════════════════════════════════════
// My Section — Server Table Claims
// ═══════════════════════════════════════════════════════════════════

export { saveMySection } from './commands/save-my-section';
export { getMySection } from './queries/get-my-section';
export type { MySectionResult } from './queries/get-my-section';
export { getRoomSectionAssignments } from './queries/get-room-section-assignments';
export type { RoomSectionAssignment } from './queries/get-room-section-assignments';

// ═══════════════════════════════════════════════════════════════════
// Session 15: F&B Reporting Read Models
// ═══════════════════════════════════════════════════════════════════

// Consumers
export { handleFnbTabClosed } from './consumers/handle-fnb-tab-closed';
export { handleFnbDiscountComp } from './consumers/handle-fnb-discount-comp';
export type { DiscountCompEventData } from './consumers/handle-fnb-discount-comp';
export { handleFnbTicketBumped, handleFnbItemBumped, handleFnbItemVoided } from './consumers/handle-fnb-ticket-bumped';
export { handleCourseSent } from './consumers/handle-course-sent';
export type { CourseSentConsumerData } from './consumers/handle-course-sent';

// Helpers — Station Routing
export { resolveStation } from './helpers/resolve-station';

// Queries
export { getServerPerformance } from './queries/get-server-performance';
export type { ServerPerformanceRow, ServerPerformanceResult } from './queries/get-server-performance';
export { getTableTurns } from './queries/get-table-turns';
export type { TableTurnsRow, TableTurnsResult } from './queries/get-table-turns';
export { getKitchenPerformance } from './queries/get-kitchen-performance';
export type { KitchenPerformanceRow, KitchenPerformanceResult } from './queries/get-kitchen-performance';
export { getDaypartSales } from './queries/get-daypart-sales';
export type { DaypartSalesRow, DaypartSalesResult } from './queries/get-daypart-sales';
export { getMenuMix } from './queries/get-menu-mix';
export type { MenuMixRow, MenuMixResult } from './queries/get-menu-mix';
export { getDiscountCompAnalysis } from './queries/get-discount-comp-analysis';
export type { DiscountCompAnalysisRow, DiscountCompAnalysisResult } from './queries/get-discount-comp-analysis';
export { getHourlySales } from './queries/get-hourly-sales';
export type { HourlySalesRow, HourlySalesResult } from './queries/get-hourly-sales';
export { getFnbDashboard } from './queries/get-fnb-dashboard';
export type { FnbDashboardMetrics } from './queries/get-fnb-dashboard';

// Helpers — Reporting Utils
export {
  computeDaypart, computeTurnTimeMinutes, incrementalAvg,
  computeTipPercentage, DAYPART_RANGES,
} from './helpers/fnb-reporting-utils';
export type {
  Daypart, FnbTabClosedConsumerData,
  FnbPaymentCompletedConsumerData, FnbTicketBumpedConsumerData,
  FnbItemBumpedConsumerData, FnbItemVoidedConsumerData,
} from './helpers/fnb-reporting-utils';

// ═══════════════════════════════════════════════════════════════════
// Session 16: UX Screen Map & Interaction Flows
// ═══════════════════════════════════════════════════════════════════

// UX Screen Map
export {
  FNB_SCREENS, COMPONENT_REUSE_MAP,
  FNB_SCREEN_PERMISSIONS, FNB_NAV_ITEMS,
  FNB_INTERACTION_FLOWS, FNB_WIREFRAMES,
  FNB_BREAKPOINTS, MODE_SWITCHING,
} from './helpers/ux-screen-map';
export type {
  ScreenDefinition, ComponentReuse, ScreenPermission,
  NavItem, FlowStep, InteractionFlow, WireframeDescription,
  FnbRole,
} from './helpers/ux-screen-map';

// Permissions
export {
  FNB_PERMISSIONS, FNB_ROLE_DEFAULTS,
  roleHasPermission, getPermissionCategories, getPermissionsByCategory,
} from './helpers/fnb-permissions';
export type { FnbPermission, SystemRole } from './helpers/fnb-permissions';

// ═══════════════════════════════════════════════════════════════════
// Validation Schemas & Types
// ═══════════════════════════════════════════════════════════════════

export {
  // Enums
  TABLE_TYPES, TABLE_SHAPES, TABLE_STATUSES,
  ASSIGNMENT_STATUSES, SHIFT_STATUSES,
  TAB_TYPES, TAB_STATUSES, SERVICE_TYPES, COURSE_STATUSES, SPLIT_STRATEGIES,
  TICKET_STATUSES, TICKET_ITEM_STATUSES, DELTA_TYPES, ROUTING_RULE_TYPES,
  STATION_TYPES, DISPLAY_MODES, SORT_BY_OPTIONS,
  ENTITY_86_TYPES, ALLERGEN_SEVERITIES, AVAILABILITY_ENTITY_TYPES,
  PAYMENT_SESSION_STATUSES, CHECK_SPLIT_STRATEGIES,
  PREAUTH_STATUSES,
  TIP_POOL_TYPES, TIP_POOL_SCOPES, TIP_DISTRIBUTION_METHODS, TIP_OUT_CALC_METHODS,
  CLOSE_BATCH_STATUSES, SERVER_CHECKOUT_STATUSES,
  FNB_GL_MAPPING_ENTITY_TYPES, FNB_POSTING_STATUSES, FNB_POSTING_MODES,
  // Session 1
  syncTablesFromFloorPlanSchema,
  createTableSchema, updateTableSchema,
  updateTableStatusSchema, seatTableSchema,
  combineTablesSchema, uncombineTablesSchema,
  listTablesFilterSchema, getFloorPlanWithStatusFilterSchema,
  listTableStatusHistorySchema,
  // Session 2
  createSectionSchema, updateSectionSchema,
  assignServerToSectionSchema, cutServerSchema, pickupSectionSchema,
  createShiftExtensionSchema, updateShiftStatusSchema,
  completeServerCheckoutSchema, advanceRotationSchema,
  listSectionsFilterSchema, listServerAssignmentsFilterSchema,
  getHostStandViewSchema,
  // Session 3
  openTabSchema, updateTabSchema, closeTabSchema, voidTabSchema,
  transferTabSchema, reopenTabSchema, fireCourseSchema, sendCourseSchema,
  addTabItemsSchema, splitTabSchema, listTabsFilterSchema, getTabDetailSchema,
  // Session 4
  createKitchenTicketSchema, updateTicketItemStatusSchema,
  updateTicketStatusSchema, createDeltaChitSchema, voidTicketSchema,
  createRoutingRuleSchema, updateRoutingRuleSchema,
  listKitchenTicketsFilterSchema, getKitchenTicketDetailSchema,
  listRoutingRulesFilterSchema,
  // Session 5
  createStationSchema, updateStationSchema, upsertDisplayConfigSchema,
  bumpItemSchema, recallItemSchema, bumpTicketSchema, callBackToStationSchema,
  listStationsFilterSchema, getStationDetailSchema,
  getKdsViewSchema, getExpoViewSchema, getStationMetricsSchema,
  // Session 6
  eightySixItemSchema, restoreItemSchema,
  createMenuPeriodSchema, updateMenuPeriodSchema,
  createAvailabilityWindowSchema, updateAvailabilityWindowSchema,
  createAllergenSchema, tagItemAllergenSchema, removeItemAllergenSchema,
  createPrepNotePresetSchema,
  listEightySixedSchema, listMenuPeriodsSchema, getAvailableMenuSchema,
  listAllergensSchema, getItemAllergensSchema, listPrepNotePresetsSchema,
  // Session 7
  createAutoGratuityRuleSchema, updateAutoGratuityRuleSchema,
  presentCheckSchema, startPaymentSessionSchema,
  completePaymentSessionSchema, failPaymentSessionSchema,
  applySplitStrategySchema, rejoinChecksSchema,
  compItemSchema, discountCheckSchema, voidCheckSchema, refundCheckSchema,
  listAutoGratuityRulesSchema, getPaymentSessionSchema,
  listPaymentSessionsSchema, getCheckSummarySchema,
  // Session 8
  createPreauthSchema, capturePreauthSchema, voidPreauthSchema,
  adjustTipSchema, finalizeTipSchema, markTabWalkoutSchema,
  getTabPreauthsSchema, listTipAdjustmentsSchema, listOpenPreauthsSchema,
  // Session 9
  createTipPoolSchema, updateTipPoolSchema,
  addPoolParticipantSchema, removePoolParticipantSchema,
  distributeTipPoolSchema, declareCashTipsSchema, recordTipOutSchema,
  listTipPoolsSchema, getTipPoolDetailSchema, listTipDeclarationsSchema,
  listTipOutEntriesSchema, getTipPoolDistributionsSchema,
  // Session 10
  startCloseBatchSchema, beginServerCheckoutSchema, completeServerCheckoutSchemaS10,
  recordCashDropSchema, recordCashPaidOutSchema, recordCashCountSchema,
  reconcileCloseBatchSchema, postCloseBatchSchema, lockCloseBatchSchema,
  recordDepositSchema,
  getCloseBatchSchema, getZReportSchema, listServerCheckoutsSchema,
  listCashDropsSchema, listCashPaidOutsSchema, getDepositSlipSchema,
  // Session 11
  configureFnbGlMappingSchema, updateFnbPostingConfigSchema,
  postBatchToGlSchema, reverseBatchPostingSchema, retryBatchPostingSchema,
  listFnbGlMappingsSchema, listUnpostedBatchesSchema,
  getBatchPostingStatusSchema, getPostingReconciliationSchema,
  // Session 12
  FNB_SETTINGS_MODULE_KEYS, FNB_SETTINGS_SCHEMAS,
  fnbGeneralSettingsSchema, fnbFloorSettingsSchema, fnbOrderingSettingsSchema,
  fnbKitchenSettingsSchema, fnbPaymentSettingsSchema, fnbTipsSettingsSchema,
  fnbAccountingSettingsSchema, fnbReceiptsSettingsSchema, fnbHardwareSettingsSchema,
  getFnbSettingsSchema, updateFnbSettingsSchema, updateFnbSettingSchema,
  getFnbSettingSchema, getFnbSettingsDefaultsSchema, validateFnbSettingsSchema,
  // Session 13
  SOFT_LOCK_ENTITY_TYPES, CHANNEL_TYPES, OFFLINE_QUEUE_STATUSES,
  acquireSoftLockSchema, renewSoftLockSchema, releaseSoftLockSchema,
  forceReleaseSoftLockSchema, cleanExpiredLocksSchema,
  createTerminalSessionSchema, heartbeatTerminalSessionSchema, disconnectTerminalSessionSchema,
  getActiveLockSchema, listActiveLocksSchema, listTerminalLocksSchema,
  // Session 14
  PRINT_JOB_TYPES, PRINT_JOB_STATUSES, RECEIPT_COPY_TYPES,
  createRoutingRuleS14Schema, updateRoutingRuleS14Schema, deleteRoutingRuleS14Schema,
  createPrintJobSchema, reprintJobSchema, updatePrintJobStatusSchema,
  listPrintJobsSchema, getPrintJobSchema, listRoutingRulesS14Schema,
  renderGuestCheckSchema, renderReceiptSchema, renderKitchenChitSchema,
  renderDeltaChitSchema, renderExpoChitSchema, renderZReportSchema,
  // Session 15
  FNB_DAYPARTS,
  getServerPerformanceSchema, getTableTurnsSchema,
  getKitchenPerformanceSchema, getDaypartSalesSchema,
  getMenuMixSchema, getDiscountCompAnalysisSchema,
  getHourlySalesSchema, getFnbDashboardSchema,
  // Guest Pay
  GUEST_PAY_SESSION_STATUSES, GUEST_PAY_ATTEMPT_STATUSES,
  createGuestPaySessionSchema, selectGuestPayTipSchema,
  simulateGuestPaymentSchema, invalidateGuestPaySessionSchema,
  updateGuestPayTipSettingsSchema,
  guestPayMemberAuthSchema, guestPayMemberVerifySchema, chargeMemberAccountSchema,
  // My Section
  saveMySectionSchema, getMySectionFilterSchema, getRoomSectionAssignmentsFilterSchema,
  // Host Stand
  WAITLIST_STATUSES, SEATING_PREFERENCES, WAITLIST_SOURCES, OCCASIONS,
  RESERVATION_STATUSES, RESERVATION_SOURCES,
  addToWaitlistSchema, updateWaitlistEntrySchema, seatFromWaitlistSchema,
  notifyWaitlistGuestSchema, createReservationSchema, updateReservationSchema,
  checkInReservationSchema, updateHostSettingsSchema,
  getWaitlistFilterSchema, getReservationsFilterSchema, getHostDashboardSchema,
  getWaitTimeEstimateSchema, getTableAvailabilitySchema,
} from './validation';

export type {
  FnbTableType, FnbTableShape, FnbTableStatus,
  AssignmentStatus, ShiftStatus,
  FnbTabType, FnbTabStatus, FnbServiceType, FnbCourseStatus, FnbSplitStrategy,
  FnbTicketStatus, FnbTicketItemStatus, FnbDeltaType, FnbRoutingRuleType,
  FnbStationType, FnbDisplayMode, FnbSortBy,
  Entity86Type, AllergenSeverity, AvailabilityEntityType,
  SyncTablesFromFloorPlanInput, CreateTableInput, UpdateTableInput,
  UpdateTableStatusInput, SeatTableInput,
  CombineTablesInput, UncombineTablesInput,
  ListTablesFilterInput, GetFloorPlanWithStatusFilterInput,
  ListTableStatusHistoryInput,
  CreateSectionInput, UpdateSectionInput,
  AssignServerToSectionInput, CutServerInput, PickupSectionInput,
  CreateShiftExtensionInput, UpdateShiftStatusInput,
  CompleteServerCheckoutInput, AdvanceRotationInput,
  ListSectionsFilterInput, ListServerAssignmentsFilterInput,
  GetHostStandViewInput,
  OpenTabInput, UpdateTabInput, CloseTabInput, VoidTabInput,
  TransferTabInput, ReopenTabInput, FireCourseInput, SendCourseInput,
  AddTabItemsInput, SplitTabInput, ListTabsFilterInput, GetTabDetailInput,
  CreateKitchenTicketInput, UpdateTicketItemStatusInput,
  UpdateTicketStatusInput, CreateDeltaChitInput, VoidTicketInput,
  CreateRoutingRuleInput, UpdateRoutingRuleInput,
  ListKitchenTicketsFilterInput, GetKitchenTicketDetailInput,
  ListRoutingRulesFilterInput,
  CreateStationInput, UpdateStationInput, UpsertDisplayConfigInput,
  BumpItemInput, RecallItemInput, BumpTicketInput, CallBackToStationInput,
  ListStationsFilterInput, GetStationDetailInput,
  GetKdsViewInput, GetExpoViewInput, GetStationMetricsInput,
  EightySixItemInput, RestoreItemInput,
  CreateMenuPeriodInput, UpdateMenuPeriodInput,
  CreateAvailabilityWindowInput, UpdateAvailabilityWindowInput,
  CreateAllergenInput, TagItemAllergenInput, RemoveItemAllergenInput,
  CreatePrepNotePresetInput,
  ListEightySixedInput, ListMenuPeriodsInput, GetAvailableMenuInput,
  ListAllergensInput, GetItemAllergensInput, ListPrepNotePresetsInput,
  PaymentSessionStatus, CheckSplitStrategy,
  CreateAutoGratuityRuleInput, UpdateAutoGratuityRuleInput,
  PresentCheckInput, StartPaymentSessionInput,
  CompletePaymentSessionInput, FailPaymentSessionInput,
  ApplySplitStrategyInput, RejoinChecksInput,
  CompItemInput, DiscountCheckInput, VoidCheckInput, RefundCheckInput,
  ListAutoGratuityRulesInput, GetPaymentSessionInput,
  ListPaymentSessionsInput, GetCheckSummaryInput,
  PreauthStatus,
  CreatePreauthInput, CapturePreauthInput, VoidPreauthInput,
  AdjustTipInput, FinalizeTipInput, MarkTabWalkoutInput,
  GetTabPreauthsInput, ListTipAdjustmentsInput, ListOpenPreauthsInput,
  TipPoolType, TipPoolScope, TipDistributionMethod, TipOutCalcMethod,
  CreateTipPoolInput, UpdateTipPoolInput,
  AddPoolParticipantInput, RemovePoolParticipantInput,
  DistributeTipPoolInput, DeclareCashTipsInput, RecordTipOutInput,
  ListTipPoolsInput, GetTipPoolDetailInput, ListTipDeclarationsInput,
  ListTipOutEntriesInput, GetTipPoolDistributionsInput,
  CloseBatchStatus, ServerCheckoutStatus,
  StartCloseBatchInput, BeginServerCheckoutInput, CompleteServerCheckoutS10Input,
  RecordCashDropInput, RecordCashPaidOutInput, RecordCashCountInput,
  ReconcileCloseBatchInput, PostCloseBatchInput, LockCloseBatchInput,
  RecordDepositInput,
  GetCloseBatchInput, GetZReportInput, ListServerCheckoutsInput,
  ListCashDropsInput, ListCashPaidOutsInput, GetDepositSlipInput,
  FnbGlMappingEntityType, FnbPostingStatus, FnbPostingMode,
  ConfigureFnbGlMappingInput, UpdateFnbPostingConfigInput,
  PostBatchToGlInput, ReverseBatchPostingInput, RetryBatchPostingInput,
  ListFnbGlMappingsInput, ListUnpostedBatchesInput,
  GetBatchPostingStatusInput, GetPostingReconciliationInput,
  FnbSettingsModuleKey,
  GetFnbSettingsInput, UpdateFnbSettingsInput, UpdateFnbSettingInput,
  GetFnbSettingInput, GetFnbSettingsDefaultsInput, ValidateFnbSettingsInput,
  // Session 13
  SoftLockEntityType, ChannelType, OfflineQueueStatus,
  AcquireSoftLockInput, RenewSoftLockInput, ReleaseSoftLockInput,
  ForceReleaseSoftLockInput, CleanExpiredLocksInput,
  CreateTerminalSessionInput, HeartbeatTerminalSessionInput, DisconnectTerminalSessionInput,
  GetActiveLockInput, ListActiveLocksInput, ListTerminalLocksInput,
  // Session 14
  PrintJobType, PrintJobStatus, ReceiptCopyType,
  CreateRoutingRuleS14Input, UpdateRoutingRuleS14Input, DeleteRoutingRuleS14Input,
  CreatePrintJobInput, ReprintJobInput, UpdatePrintJobStatusInput,
  ListPrintJobsInput, GetPrintJobInput, ListRoutingRulesS14Input,
  RenderGuestCheckInput, RenderReceiptInput, RenderKitchenChitInput,
  RenderDeltaChitInput, RenderExpoChitInput, RenderZReportInput,
  // Session 15
  FnbDaypart,
  GetServerPerformanceInput, GetTableTurnsInput,
  GetKitchenPerformanceInput, GetDaypartSalesInput,
  GetMenuMixInput, GetDiscountCompAnalysisInput,
  GetHourlySalesInput, GetFnbDashboardInput,
  // Guest Pay
  GuestPaySessionStatus, GuestPayAttemptStatus,
  CreateGuestPaySessionInput, SelectGuestPayTipInput,
  SimulateGuestPaymentInput, InvalidateGuestPaySessionInput,
  UpdateGuestPayTipSettingsInput,
  GuestPayMemberAuthInput, GuestPayMemberVerifyInput, ChargeMemberAccountInput,
  // My Section
  SaveMySectionInput, GetMySectionFilterInput, GetRoomSectionAssignmentsFilterInput,
  // Host Stand
  WaitlistStatus, SeatingPreference, WaitlistSource, Occasion,
  ReservationStatus, ReservationSource,
  AddToWaitlistInput, UpdateWaitlistEntryInput, SeatFromWaitlistInput,
  NotifyWaitlistGuestInput, CreateReservationInput, UpdateReservationInput,
  CheckInReservationInput, UpdateHostSettingsInput,
  GetWaitlistFilterInput, GetReservationsFilterInput, GetHostDashboardInput,
  GetWaitTimeEstimateInput, GetTableAvailabilityInput,
  // KDS Comprehensive Settings
  AlertEventConfig,
  CreateBumpBarProfileInput, UpdateBumpBarProfileInput,
  CreateAlertProfileInput, UpdateAlertProfileInput,
  UpsertPerformanceTargetInput,
  UpsertItemPrepTimeInput, BulkUpsertItemPrepTimesInput,
  CreateKdsRoutingRuleInput, UpdateKdsRoutingRuleInput,
  GetKdsViewEnhancedInput,
} from './validation';

// ═══════════════════════════════════════════════════════════════════
// Event Types
// ═══════════════════════════════════════════════════════════════════

export { FNB_EVENTS } from './events/types';
export type {
  // Session 1
  TableStatusChangedPayload, TablesSyncedPayload,
  TableCombinedPayload, TableUncombinedPayload,
  TableCreatedPayload, TableUpdatedPayload,
  // Session 2
  SectionCreatedPayload, SectionUpdatedPayload,
  ServerAssignedPayload, ServerCutPayload,
  SectionPickedUpPayload, ShiftStatusChangedPayload,
  ServerCheckoutPayload, RotationAdvancedPayload,
  // Session 3
  TabOpenedPayload, TabUpdatedPayload, TabClosedPayload,
  TabVoidedPayload, TabTransferredPayload, TabReopenedPayload,
  TabSplitPayload, CourseSentPayload, CourseFiredPayload,
  // Session 4
  TicketCreatedPayload, TicketStatusChangedPayload,
  TicketItemStatusChangedPayload, TicketVoidedPayload,
  DeltaChitCreatedPayload,
  // Session 5
  StationCreatedPayload, StationUpdatedPayload,
  ItemBumpedPayload, ItemRecalledPayload,
  TicketBumpedPayload, ItemCalledBackPayload,
  // Session 6
  ItemEightySixedPayload, ItemRestoredPayload,
  MenuPeriodCreatedPayload, MenuPeriodUpdatedPayload,
  AllergenTaggedPayload,
  // Session 7
  CheckPresentedPayload, PaymentStartedPayload,
  TenderAppliedPayload, PaymentCompletedPayload,
  PaymentFailedPayload, CheckCompedPayload,
  CheckDiscountedPayload, CheckVoidedPayload,
  CheckRefundedPayload,
  // Session 8
  PreauthCreatedPayload, PreauthCapturedPayload,
  TipAdjustedPayload, TipFinalizedPayload,
  TabWalkoutPayload,
  // Session 9
  TipCollectedPayload, TipDeclaredPayload,
  TipPoolDistributedPayload, TipOutRecordedPayload,
  // Session 10
  CloseBatchStartedPayload, ServerCheckedOutPayload,
  CloseBatchReconciledPayload, CloseBatchPostedPayload,
  DepositRecordedPayload,
  // Session 11
  GlPostingCreatedPayload, GlPostingReversedPayload,
  GlPostingFailedPayload,
  // Session 12
  SettingsUpdatedPayload,
  // Session 13
  SoftLockAcquiredPayload, SoftLockReleasedPayload,
  TerminalConnectedPayload, TerminalDisconnectedPayload,
  // Session 14
  PrintJobCreatedPayload, PrintJobCompletedPayload,
  PrintJobFailedPayload, PrintJobReprintedPayload,
  // Guest Pay
  GuestPaySessionCreatedPayload, GuestPayPaymentSucceededPayload,
  GuestPaySessionInvalidatedPayload, GuestPaySessionSupersededPayload,
} from './events/types';

// ═══════════════════════════════════════════════════════════════════
// Errors
// ═══════════════════════════════════════════════════════════════════

export {
  // Session 1
  TableNotFoundError,
  TableStatusConflictError,
  TableVersionConflictError,
  TableNotCombinableError,
  TableAlreadyCombinedError,
  CombineGroupNotFoundError,
  RoomNotFoundError,
  NoPublishedVersionError,
  DuplicateTableNumberError,
  // Session 3
  TabNotFoundError,
  TabStatusConflictError,
  TabVersionConflictError,
  CourseNotFoundError,
  CourseStatusConflictError,
  // Session 4
  TicketNotFoundError,
  TicketStatusConflictError,
  TicketItemNotFoundError,
  TicketVersionConflictError,
  RoutingRuleNotFoundError,
  // Session 5
  StationNotFoundError,
  DuplicateStationNameError,
  TicketNotReadyError,
  // Session 6
  EightySixLogNotFoundError,
  ItemAlreadyEightySixedError,
  MenuPeriodNotFoundError,
  DuplicateMenuPeriodNameError,
  AllergenNotFoundError,
  AvailabilityWindowNotFoundError,
  // Session 7
  PaymentSessionNotFoundError,
  PaymentSessionStatusConflictError,
  SplitNotAllowedError,
  AutoGratuityRuleNotFoundError,
  CheckAlreadyPaidError,
  RefundExceedsTenderError,
  // Session 8
  PreauthNotFoundError,
  PreauthStatusConflictError,
  PreauthAmountExceededError,
  TipAdjustmentWindowClosedError,
  TipAlreadyFinalizedError,
  // Session 9
  TipPoolNotFoundError,
  TipPoolParticipantExistsError,
  TipDeclarationExistsError,
  TipDeclarationBelowMinimumError,
  // Session 10
  CloseBatchNotFoundError,
  CloseBatchStatusConflictError,
  OpenTabsExistError,
  ServerCheckoutNotFoundError,
  DepositSlipNotFoundError,
  // Session 11
  GlPostingFailedError,
  GlMappingNotFoundError,
  BatchAlreadyPostedError,
  BatchNotPostedError,
  // Session 12
  InvalidSettingsModuleKeyError,
  InvalidSettingKeyError,
  // Session 13
  SoftLockHeldError,
  SoftLockNotFoundError,
  SoftLockExpiredError,
  TerminalSessionNotFoundError,
  // Session 14
  PrintJobNotFoundError,
  PrintRoutingRuleNotFoundError,
  NoPrinterRoutedError,
  PrintJobAlreadyCompletedError,
} from './errors';

// ═══════════════════════════════════════════════════════════════════
// Host Stand — Waitlist, Reservations & Seating Intelligence
// ═══════════════════════════════════════════════════════════════════

// Commands
export { addToWaitlist } from './commands/add-to-waitlist';
export { updateWaitlistEntry } from './commands/update-waitlist-entry';
export { seatFromWaitlist } from './commands/seat-from-waitlist';
export { removeFromWaitlist } from './commands/remove-from-waitlist';
export { notifyWaitlistGuest } from './commands/notify-waitlist-guest';
export { createReservation, mapReservationRow } from './commands/create-reservation';
export { updateReservation } from './commands/update-reservation';
export { cancelReservation, noShowReservation } from './commands/cancel-reservation';
export { checkInReservation } from './commands/check-in-reservation';
export { updateHostSettings } from './commands/update-host-settings';

// Queries
export { getHostDashboard } from './queries/get-host-dashboard';
export type {
  HostDashboard, WaitlistEntry, ReservationEntry,
  TableSummary, ServerSummary,
} from './queries/get-host-dashboard';
export { getWaitTimeEstimate } from './queries/get-wait-time-estimate';
export type { WaitTimeEstimate } from './queries/get-wait-time-estimate';
export { getTableAvailability } from './queries/get-table-availability';
export type {
  TableAvailabilityResult, AvailableTableForSeating,
} from './queries/get-table-availability';
export { getHostSettings } from './queries/get-host-settings';
export type { HostSettings } from './queries/get-host-settings';
export { getWaitlist } from './queries/get-waitlist';
export type { WaitlistItem, WaitlistResult } from './queries/get-waitlist';
export { getReservations } from './queries/get-reservations';
export type { ReservationItem, ReservationsResult } from './queries/get-reservations';

// ═══════════════════════════════════════════════════════════════════
// Host Module V2 — Enhanced Reservations, Waitlist & Turn Tracking
// ═══════════════════════════════════════════════════════════════════

// V2 Commands
export { hostCreateReservation } from './commands/host-create-reservation';
export { hostUpdateReservation } from './commands/host-update-reservation';
export { confirmReservation } from './commands/confirm-reservation';
export { checkInReservationV2 } from './commands/check-in-reservation-v2';
export { seatReservation } from './commands/seat-reservation';
export { completeReservation } from './commands/complete-reservation';
export { cancelReservationV2 } from './commands/cancel-reservation-v2';
export { markNoShow } from './commands/mark-no-show';
export { hostAddToWaitlist } from './commands/host-add-to-waitlist';
export { hostUpdateWaitlistEntry } from './commands/host-update-waitlist-entry';
export { notifyWaitlistParty } from './commands/notify-waitlist-party';
export { hostSeatFromWaitlist } from './commands/host-seat-from-waitlist';
export { hostRemoveFromWaitlist } from './commands/host-remove-from-waitlist';
export { recordTableTurn } from './commands/record-table-turn';
export { sendGuestNotification } from './commands/send-guest-notification';

// V2 Helpers
export { mapHostReservationRow, mapHostWaitlistRow } from './commands/host-helpers';

// V2 Queries
export { hostListReservations } from './queries/host-list-reservations';
export type { HostReservationListItem, HostReservationListResult } from './queries/host-list-reservations';
export { hostGetReservation } from './queries/host-get-reservation';
export type { HostReservationDetail } from './queries/host-get-reservation';
export { hostGetUpcomingReservations } from './queries/host-get-upcoming-reservations';
export type { UpcomingReservationItem } from './queries/host-get-upcoming-reservations';
export { hostListWaitlist } from './queries/host-list-waitlist';
export type { HostWaitlistListItem } from './queries/host-list-waitlist';
export { hostGetWaitlistEntry } from './queries/host-get-waitlist-entry';
export type { HostWaitlistEntryDetail } from './queries/host-get-waitlist-entry';
export { hostGetWaitlistStats } from './queries/host-get-waitlist-stats';
export type { HostWaitlistStats } from './queries/host-get-waitlist-stats';
export { hostGetDashboardMetrics } from './queries/host-get-dashboard-metrics';
export type { HostDashboardMetrics } from './queries/host-get-dashboard-metrics';
export { hostGetTableTurnStats } from './queries/host-get-table-turn-stats';
export type { HostTableTurnStats, TurnTimeBucket } from './queries/host-get-table-turn-stats';
export { hostGetPreShiftReport } from './queries/host-get-pre-shift-report';
export type { PreShiftReport } from './queries/host-get-pre-shift-report';

// V2 Analytics
export { getHostAnalytics } from './queries/get-host-analytics';
export type { HostAnalyticsResult, HostAnalyticsInput } from './queries/get-host-analytics';

// V2 Events
export { HOST_EVENTS } from './events/host-events';
export type { HostEventType } from './events/host-events';

// V2 Validation
export {
  HOST_RESERVATION_STATUSES,
  HOST_WAITLIST_STATUSES,
  MEAL_PERIODS,
  RESERVATION_TRANSITIONS,
  WAITLIST_TRANSITIONS,
  validateReservationTransition,
  validateWaitlistTransition,
} from './validation-host';
export type {
  HostReservationStatus,
  HostWaitlistStatus,
  MealPeriod,
  HostCreateReservationInput,
  HostUpdateReservationInput,
  SeatReservationInput,
  CancelReservationV2Input,
  ConfirmReservationInput,
  CompleteReservationInput,
  MarkNoShowInput,
  CheckInReservationV2Input,
  HostAddToWaitlistInput,
  HostUpdateWaitlistEntryInput,
  HostSeatFromWaitlistInput,
  HostNotifyWaitlistInput,
  HostRemoveFromWaitlistInput,
  RecordTableTurnInput,
  SendGuestNotificationInput,
  HostGetAnalyticsInput,
} from './validation-host';
export {
  hostCreateReservationSchema,
  hostUpdateReservationSchema,
  hostGetAnalyticsSchema,
  hostRemoveFromWaitlistSchema,
  sendGuestNotificationSchema,
  hostAddToWaitlistSchema,
  hostSeatFromWaitlistSchema,
  cancelReservationV2Schema,
  markNoShowSchema,
  checkInReservationV2Schema,
  confirmReservationSchema,
  completeReservationSchema,
  seatReservationSchema,
  hostGetPreShiftReportSchema,
} from './validation-host';

// V2 Services (pure algorithm exports)
export {
  computeWaitTime,
  getPartySizeBucket,
  getConfidence,
  roundToNearest,
  clamp,
  DEFAULT_TURN_TIMES,
} from './services/wait-time-estimator';
export type {
  WaitTimeEstimate as WaitTimeEstimateV2,
  EstimateWaitTimeInput,
  TurnTimeData,
  OccupancyData,
} from './services/wait-time-estimator';

export {
  computeTableSuggestions,
  scoreCapacityFit,
  scoreSeatingPreference,
  scoreServerBalance,
  scoreVipPreference,
  generateReasoning,
  findCombinations,
  scoreTable,
} from './services/table-assigner';
export type {
  TableSuggestion,
  SuggestTablesInput,
  AvailableTable as AvailableTableV2,
  ServerLoad,
  CustomerTableHistory,
} from './services/table-assigner';

// V2 Intelligence Queries (DB wrappers)
export { estimateWaitTime } from './queries/estimate-wait-time';
export { suggestTables } from './queries/suggest-tables';
export { getTableAvailabilityForecast } from './queries/get-table-availability-forecast';
export type { TableForecastEntry, TableAvailabilityForecastInput } from './queries/get-table-availability-forecast';

// V2 Notification Service
export { getSmsProvider, setSmsProvider, ConsoleSmsProvider, TwilioSmsProvider } from './services/notification-service';
export type { SmsProvider } from './services/notification-service';
export { NOTIFICATION_TEMPLATES, renderTemplate } from './services/notification-templates';
export type { NotificationTemplateKey } from './services/notification-templates';

// V2 Host Settings
export {
  hostSettingsSchema,
  getDefaultHostSettings,
  mergeHostSettings,
} from './services/host-settings';
export type { HostSettings as HostSettingsV2, HostSettingsInput } from './services/host-settings';

// V2 Consumers
export { handleTabClosedForHost, handleTurnCompletedForHost } from './consumers/host-consumers';

// ═══════════════════════════════════════════════════════════════════
// KDS Comprehensive Settings & Routing Engine
// ═══════════════════════════════════════════════════════════════════

// Commands
export { upsertBumpBarProfile } from './commands/upsert-bump-bar-profile';
export { upsertAlertProfile } from './commands/upsert-alert-profile';
export { upsertPerformanceTarget } from './commands/upsert-performance-target';
export { upsertItemPrepTime, bulkUpsertItemPrepTimes } from './commands/upsert-item-prep-time';

// Queries
export {
  listBumpBarProfiles, getBumpBarProfile,
  listAlertProfiles, getAlertProfile,
  listPerformanceTargets, listItemPrepTimes,
  getKdsStationSettings,
} from './queries/list-kds-settings';
export type {
  BumpBarProfileListItem, BumpBarProfileDetail,
  AlertProfileListItem, AlertProfileDetail,
  PerformanceTargetItem, ItemPrepTimeItem,
  KdsStationSettings,
} from './queries/list-kds-settings';

// Routing Engine
export {
  resolveStationRouting,
  getStationPrepTimeForItem,
} from './services/kds-routing-engine';
export type {
  RoutingContext, RoutableItem, RoutingResult,
} from './services/kds-routing-engine';

// KDS Validation Schemas
export {
  alertEventConfigSchema,
  createBumpBarProfileSchema, updateBumpBarProfileSchema,
  createAlertProfileSchema, updateAlertProfileSchema,
  upsertPerformanceTargetSchema,
  upsertItemPrepTimeSchema, bulkUpsertItemPrepTimesSchema,
  createKdsRoutingRuleSchema, updateKdsRoutingRuleSchema,
  getKdsViewEnhancedSchema,
} from './validation';

// Re-export reconciliation methods (used by ReconciliationReadApi)
export { getFnbCloseStatus } from './reconciliation';
