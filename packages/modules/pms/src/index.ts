export const MODULE_KEY = 'pms' as const;
export const MODULE_NAME = 'Property Management System';
export const MODULE_VERSION = '0.0.1';

/** SQL tables owned by this module — used by extraction tooling */
export const MODULE_TABLES = [
  'pms_properties',
  'pms_room_types',
  'pms_rooms',
  'pms_rate_plans',
  'pms_rate_plan_prices',
  'pms_guests',
  'pms_reservations',
  'pms_room_blocks',
  'pms_folios',
  'pms_folio_entries',
  'pms_room_status_log',
  'pms_audit_log',
  'pms_idempotency_keys',
  'pms_outbox',
  'pms_rate_restrictions',
  'pms_payment_methods',
  'pms_payment_transactions',
  'pms_deposit_policies',
  'pms_cancellation_policies',
  'pms_message_templates',
  'pms_message_log',
  'pms_housekeepers',
  'pms_housekeeping_assignments',
  'pms_work_orders',
  'pms_work_order_comments',
  'pms_rate_packages',
  'pms_groups',
  'pms_group_room_blocks',
  'pms_corporate_accounts',
  'pms_corporate_rate_overrides',
  'pms_pricing_rules',
  'pms_pricing_log',
  'pms_channels',
  'pms_channel_sync_log',
  'pms_booking_engine_config',
  'pms_room_assignment_preferences',
  'pms_guest_portal_sessions',
  'pms_loyalty_programs',
  'pms_loyalty_members',
  'pms_loyalty_transactions',
  'pms_housekeepers_staff',
  'rm_pms_calendar_segments',
  'rm_pms_daily_occupancy',
  'rm_pms_revenue_by_room_type',
  'rm_pms_housekeeping_productivity',
] as const;

// Schema re-exports (from @oppsera/db)
export {
  pmsProperties,
  pmsRoomTypes,
  pmsRooms,
  pmsRatePlans,
  pmsRatePlanPrices,
  pmsGuests,
  pmsReservations,
  pmsRoomBlocks,
  pmsFolios,
  pmsFolioEntries,
  pmsRoomStatusLog,
  pmsAuditLog,
  pmsIdempotencyKeys,
  pmsOutbox,
  rmPmsCalendarSegments,
  rmPmsDailyOccupancy,
  pmsRateRestrictions,
  pmsPaymentMethods,
  pmsPaymentTransactions,
  pmsDepositPolicies,
  pmsCancellationPolicies,
  pmsMessageTemplates,
  pmsMessageLog,
  rmPmsRevenueByRoomType,
  rmPmsHousekeepingProductivity,
  pmsHousekeepers,
  pmsHousekeepingAssignments,
  pmsWorkOrders,
  pmsWorkOrderComments,
  pmsRatePackages,
  pmsGroups,
  pmsGroupRoomBlocks,
  pmsCorporateAccounts,
  pmsCorporateRateOverrides,
  pmsPricingRules,
  pmsPricingLog,
  pmsChannels,
  pmsChannelSyncLog,
  pmsBookingEngineConfig,
  pmsRoomAssignmentPreferences,
  pmsGuestPortalSessions,
  pmsLoyaltyPrograms,
  pmsLoyaltyMembers,
  pmsLoyaltyTransactions,
} from '@oppsera/db';

// Validation schemas
export {
  createPropertySchema,
  updatePropertySchema,
  createRoomTypeSchema,
  updateRoomTypeSchema,
  createRoomSchema,
  updateRoomSchema,
  updateRoomStatusSchema,
  createRatePlanSchema,
  updateRatePlanSchema,
  setRatePlanPriceSchema,
  createGuestSchema,
  updateGuestSchema,
  createReservationSchema,
  updateReservationSchema,
  cancelReservationSchema,
  markNoShowSchema,
  calendarMoveSchema,
  calendarResizeSchema,
  checkInSchema,
  checkOutSchema,
  moveRoomSchema,
  updateRoomHousekeepingSchema,
  postFolioEntrySchema,
  setOutOfOrderSchema,
  setRateRestrictionsSchema,
  clearRateRestrictionsSchema,
  savePaymentMethodSchema,
  chargeCardSchema,
  authorizeDepositSchema,
  captureDepositSchema,
  refundPaymentSchema,
  createDepositPolicySchema,
  updateDepositPolicySchema,
  createCancellationPolicySchema,
  updateCancellationPolicySchema,
  createMessageTemplateSchema,
  updateMessageTemplateSchema,
  sendReservationMessageSchema,
  logCommunicationSchema,
  createHousekeeperSchema,
  updateHousekeeperSchema,
  assignHousekeepingSchema,
  completeCleaningSchema,
  createWorkOrderSchema,
  updateWorkOrderSchema,
  completeWorkOrderSchema,
  addWorkOrderCommentSchema,
  createRatePackageSchema,
  updateRatePackageSchema,
  // Groups
  createGroupSchema,
  updateGroupSchema,
  setGroupRoomBlocksSchema,
  pickUpGroupRoomSchema,
  groupTypeEnum,
  groupStatusEnum,
  groupBillingTypeEnum,
  // Corporate
  createCorporateAccountSchema,
  updateCorporateAccountSchema,
  setCorporateRateOverridesSchema,
  corporateBillingTypeEnum,
  // Pricing Rules
  pricingRuleTypeEnum,
  pricingAdjustmentTypeEnum,
  pricingAdjustmentDirectionEnum,
  pricingConditionsSchema,
  pricingAdjustmentsSchema,
  createPricingRuleSchema,
  updatePricingRuleSchema,
  runPricingEngineSchema,
  // Channels
  channelCodeEnum,
  createChannelSchema,
  updateChannelSchema,
  syncChannelSchema,
  // Booking Engine
  updateBookingEngineConfigSchema,
  // Auto Room Assignment
  updateRoomAssignmentPreferencesSchema,
  runAutoAssignmentSchema,
  // Guest Portal
  createGuestPortalSessionSchema,
  completePreCheckinSchema,
  // Loyalty
  createLoyaltyProgramSchema,
  updateLoyaltyProgramSchema,
  enrollLoyaltyGuestSchema,
  earnLoyaltyPointsSchema,
  redeemLoyaltyPointsSchema,
  adjustLoyaltyPointsSchema,
} from './validation';

export type {
  CreatePropertyInput,
  UpdatePropertyInput,
  CreateRoomTypeInput,
  UpdateRoomTypeInput,
  CreateRoomInput,
  UpdateRoomInput,
  UpdateRoomStatusInput,
  CreateRatePlanInput,
  UpdateRatePlanInput,
  SetRatePlanPriceInput,
  CreateGuestInput,
  UpdateGuestInput,
  CreateReservationInput,
  UpdateReservationInput,
  CancelReservationInput,
  MarkNoShowInput,
  CalendarMoveInput,
  CalendarResizeInput,
  CheckInInput,
  CheckOutInput,
  MoveRoomInput,
  UpdateRoomHousekeepingInput,
  PostFolioEntryInput,
  SetOutOfOrderInput,
  SetRateRestrictionsInput,
  ClearRateRestrictionsInput,
  SavePaymentMethodInput,
  ChargeCardInput,
  AuthorizeDepositInput,
  CaptureDepositInput,
  RefundPaymentInput,
  CreateDepositPolicyInput,
  UpdateDepositPolicyInput,
  CreateCancellationPolicyInput,
  UpdateCancellationPolicyInput,
  CreateMessageTemplateInput,
  UpdateMessageTemplateInput,
  SendReservationMessageInput,
  LogCommunicationInput,
  CreateHousekeeperInput,
  UpdateHousekeeperInput,
  AssignHousekeepingInput,
  CompleteCleaningInput,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  CompleteWorkOrderInput,
  AddWorkOrderCommentInput,
  CreateRatePackageInput,
  UpdateRatePackageInput,
  // Groups
  CreateGroupInput,
  UpdateGroupInput,
  SetGroupRoomBlocksInput,
  PickUpGroupRoomInput,
  GroupType,
  GroupStatus,
  GroupBillingType,
  // Corporate
  CreateCorporateAccountInput,
  UpdateCorporateAccountInput,
  SetCorporateRateOverridesInput,
  CorporateBillingType,
  // Pricing Rules
  PricingRuleType,
  PricingAdjustmentType,
  PricingAdjustmentDirection,
  PricingConditions,
  PricingAdjustments,
  CreatePricingRuleInput,
  UpdatePricingRuleInput,
  RunPricingEngineInput,
  // Channels
  ChannelCode,
  CreateChannelInput,
  UpdateChannelInput,
  SyncChannelInput,
  // Booking Engine
  UpdateBookingEngineConfigInput,
  // Auto Room Assignment
  UpdateRoomAssignmentPreferencesInput,
  RunAutoAssignmentInput,
  // Guest Portal
  CreateGuestPortalSessionInput,
  CompletePreCheckinInput,
  // Loyalty
  CreateLoyaltyProgramInput,
  UpdateLoyaltyProgramInput,
  EnrollLoyaltyGuestInput,
  EarnLoyaltyPointsInput,
  RedeemLoyaltyPointsInput,
  AdjustLoyaltyPointsInput,
} from './validation';

// Permissions
export { PMS_PERMISSIONS, PMS_ROLE_PERMISSIONS, PMS_ROLES } from './permissions';
export type { PmsPermission } from './permissions';

// Types
export {
  ReservationStatus,
  RoomStatus,
  BlockType,
  SourceType,
  FolioEntryType,
  FolioStatus,
  ResizeEdge,
} from './types';
export type { PrimaryGuestJson } from './types';

// State machines
export {
  RESERVATION_TRANSITIONS,
  ACTIVE_RESERVATION_STATUSES,
  IMMOVABLE_STATUSES,
  canTransitionReservation,
  assertReservationTransition,
  ROOM_STATUS_TRANSITIONS,
  canTransitionRoom,
  assertRoomTransition,
} from './state-machines';

// Events
export { PMS_EVENTS } from './events/types';
export type { PmsEventType } from './events/types';
export { handleCalendarProjection, handleOccupancyProjection, handleRoomChargeTender, handleFolioSettlementTender } from './events/consumers';
export type * from './events/payloads';

// Errors
export {
  RoomAlreadyBookedError,
  RoomOutOfOrderError,
  InvalidStatusTransitionError,
  ConcurrencyConflictError,
  ReservationNotMovableError,
  FolioNotOpenError,
} from './errors';

// Helpers
export { bootstrapPropertiesFromLocations } from './helpers/bootstrap-properties';

// Commands
export { createProperty } from './commands/create-property';
export { updateProperty } from './commands/update-property';
export { createRoomType } from './commands/create-room-type';
export { updateRoomType } from './commands/update-room-type';
export { createRoom } from './commands/create-room';
export { updateRoom } from './commands/update-room';
export { setRoomOutOfOrder } from './commands/set-room-out-of-order';
export { clearRoomOutOfOrder } from './commands/clear-room-out-of-order';
export { updateRoomHousekeeping } from './commands/update-room-housekeeping';
export { createRatePlan } from './commands/create-rate-plan';
export { updateRatePlan } from './commands/update-rate-plan';
export { setRatePlanPrices } from './commands/set-rate-plan-prices';
export { createGuest } from './commands/create-guest';
export { updateGuest } from './commands/update-guest';
export { createReservation } from './commands/create-reservation';
export { updateReservation } from './commands/update-reservation';
export { cancelReservation } from './commands/cancel-reservation';
export { markNoShow } from './commands/mark-no-show';
export { moveReservation } from './commands/move-reservation';
export { resizeReservation } from './commands/resize-reservation';
export { checkIn } from './commands/check-in';
export { checkOut } from './commands/check-out';
export { moveRoom } from './commands/move-room';
export { updateRoomStatus } from './commands/update-room-status';
export { postFolioEntry } from './commands/post-folio-entry';
export { closeFolio } from './commands/close-folio';
export { setRateRestrictions } from './commands/set-rate-restrictions';
export { clearRateRestrictions } from './commands/clear-rate-restrictions';
export { savePaymentMethod } from './commands/save-payment-method';
export { removePaymentMethod } from './commands/remove-payment-method';
export { authorizeDeposit } from './commands/authorize-deposit';
export { captureDeposit } from './commands/capture-deposit';
export { chargeCard } from './commands/charge-card';
export { refundPayment } from './commands/refund-payment';
export { createDepositPolicy } from './commands/create-deposit-policy';
export { updateDepositPolicy } from './commands/update-deposit-policy';
export { createCancellationPolicy } from './commands/create-cancellation-policy';
export { updateCancellationPolicy } from './commands/update-cancellation-policy';
export { createMessageTemplate } from './commands/create-message-template';
export { updateMessageTemplate } from './commands/update-message-template';
export { sendReservationMessage } from './commands/send-reservation-message';
export { logCommunication } from './commands/log-communication';
export { createHousekeeper } from './commands/create-housekeeper';
export { updateHousekeeper } from './commands/update-housekeeper';
export { assignHousekeeping } from './commands/assign-housekeeping';
export { startCleaning } from './commands/start-cleaning';
export { completeCleaning } from './commands/complete-cleaning';
export { skipCleaning } from './commands/skip-cleaning';
export { createWorkOrder } from './commands/create-work-order';
export { updateWorkOrder } from './commands/update-work-order';
export { completeWorkOrder } from './commands/complete-work-order';
export { addWorkOrderComment } from './commands/add-work-order-comment';
export { createRatePackage } from './commands/create-rate-package';
export { updateRatePackage } from './commands/update-rate-package';
export { deactivateRatePackage } from './commands/deactivate-rate-package';
// Group commands
export { createGroup } from './commands/create-group';
export { updateGroup } from './commands/update-group';
export { setGroupRoomBlocks } from './commands/set-group-room-blocks';
export { pickUpGroupRoom } from './commands/pick-up-group-room';
export { releaseGroupBlocks } from './commands/release-group-blocks';
// Corporate commands
export { createCorporateAccount } from './commands/create-corporate-account';
export { updateCorporateAccount } from './commands/update-corporate-account';
export { setCorporateRateOverrides } from './commands/set-corporate-rate-overrides';
export { deactivateCorporateAccount } from './commands/deactivate-corporate-account';
// Pricing rule commands
export { createPricingRule } from './commands/create-pricing-rule';
export { updatePricingRule } from './commands/update-pricing-rule';
export { deactivatePricingRule } from './commands/deactivate-pricing-rule';
export { runPricingEngine } from './commands/run-pricing-engine';
// Channel commands
export { createChannel } from './commands/create-channel';
export { updateChannel } from './commands/update-channel';
export { syncChannel } from './commands/sync-channel';
// Booking engine commands
export { updateBookingEngineConfig } from './commands/update-booking-engine-config';
// Auto room assignment commands
export { updateRoomAssignmentPreferences } from './commands/update-room-assignment-preferences';
export { runAutoAssignment } from './commands/run-auto-assignment';
export type { AutoAssignmentResult } from './commands/run-auto-assignment';
// Guest portal commands
export { createGuestPortalSession } from './commands/create-guest-portal-session';
export { completePreCheckin } from './commands/complete-pre-checkin';
export { expireGuestPortalSessions } from './commands/expire-guest-portal-sessions';
// Loyalty commands
export { createLoyaltyProgram } from './commands/create-loyalty-program';
export { updateLoyaltyProgram } from './commands/update-loyalty-program';
export { enrollLoyaltyGuest } from './commands/enroll-loyalty-guest';
export { earnLoyaltyPoints } from './commands/earn-loyalty-points';
export { redeemLoyaltyPoints } from './commands/redeem-loyalty-points';
export type { RedemptionResult } from './commands/redeem-loyalty-points';
export { adjustLoyaltyPoints } from './commands/adjust-loyalty-points';

// Pricing engine helper
export { computeDynamicRate, evaluateConditions, applyAdjustment } from './helpers/pricing-engine';
export type { PricingContext, PricingRuleRow, ComputedRate } from './helpers/pricing-engine';

// Room assignment engine helper
export { scoreRoom, rankRooms } from './helpers/room-assignment-engine';
export type { ScoredRoom, AssignmentContext, PreferenceWeight, RoomScore } from './helpers/room-assignment-engine';

// Queries
export {
  listProperties,
  getProperty,
  listRoomTypes,
  getRoomType,
  listRooms,
  getRoom,
  listRatePlans,
  getRatePlan,
  getNightlyRate,
  getRatePlanPrices,
  searchGuests,
  getGuest,
  listReservations,
  getReservation,
  suggestAvailableRooms,
  listHousekeepingRooms,
  getFolio,
  getFolioByReservation,
  getCalendarWeek,
  getCalendarDay,
  getDailyOccupancy,
  getRateRestrictions,
  checkRestrictions,
  listPaymentMethods,
  listPaymentTransactions,
  listDepositPolicies,
  listCancellationPolicies,
  listMessageTemplates,
  getMessageTemplate,
  listMessageLog,
  getOccupancyForecast,
  getRevenueByRoomType,
  getPickupReport,
  getManagerFlashReport,
  getNoShowReport,
  getHousekeepingProductivity,
  listHousekeepers,
  listHousekeepingAssignments,
  getHousekeeperWorkload,
  listWorkOrders,
  getWorkOrder,
  listRatePackages,
  getRatePackage,
  // Groups
  listGroups,
  getGroup,
  // Corporate
  listCorporateAccounts,
  getCorporateAccount,
  getCorporateRate,
  // Calendar Month
  getCalendarMonth,
  // Pricing Rules
  listPricingRules,
  getPricingRule,
  getPricingLog,
  previewPricing,
  // Channels
  listChannels,
  getChannel,
  listChannelSyncLog,
  // Booking Engine
  getBookingEngineConfig,
  // Auto Room Assignment
  listRoomAssignmentPreferences,
  getRoomSuggestions,
  // Guest Self-Service Portal
  getGuestPortalSessionByToken,
  getGuestPortalSession,
  getGuestPortalFolio,
  // Loyalty/Points
  listLoyaltyPrograms,
  getLoyaltyMember,
  listLoyaltyTransactions,
  // Utilization Grid
  getUtilizationGrid,
  getUtilizationGridByRoom,
} from './queries';

export type {
  PropertyListItem,
  ListPropertiesResult,
  PropertyDetail,
  RoomTypeListItem,
  ListRoomTypesResult,
  RoomTypeDetail,
  RoomListItem,
  ListRoomsResult,
  RoomDetail,
  RatePlanListItem,
  ListRatePlansResult,
  RatePlanDetail,
  RatePlanPrice,
  NightlyRateResult,
  RatePlanPriceRow,
  GuestSearchItem,
  SearchGuestsResult,
  GuestDetail,
  GuestReservationSummary,
  CalendarWeekResponse,
  CalendarRoom,
  CalendarSegment,
  OooBlock,
  OccupancyByDate,
  CalendarDayResponse,
  UnassignedReservation,
  DailyOccupancyRow,
  RateRestrictionRow,
  GetRateRestrictionsInput,
  CheckRestrictionsInput,
  CheckRestrictionsResult,
  PaymentMethodItem,
  PaymentTransactionItem,
  DepositPolicyItem,
  CancellationPolicyItem,
  MessageTemplateItem,
  MessageTemplateDetail,
  MessageLogItem,
  ListMessageLogInput,
  ListMessageLogResult,
  OccupancyForecastDay,
  RevenueByRoomTypeRow,
  PickupReportRow,
  ManagerFlashReport,
  NoShowReportRow,
  NoShowReportResult,
  HousekeepingProductivityRow,
  HousekeeperItem,
  HousekeepingAssignmentItem,
  HousekeeperWorkload,
  WorkOrderListItem,
  ListWorkOrdersResult,
  WorkOrderDetail,
  RatePackageListItem,
  ListRatePackagesResult,
  RatePackageDetail,
  // Groups
  GroupListItem,
  ListGroupsResult,
  GroupDetail,
  GroupRoomBlock,
  // Corporate
  CorporateAccountListItem,
  ListCorporateAccountsResult,
  CorporateAccountDetail,
  CorporateRateOverride,
  CorporateRateResult,
  // Calendar Month
  MonthDay,
  CalendarMonthResult,
  // Pricing Rules
  PricingRuleListItem,
  ListPricingRulesResult,
  PricingRuleDetail,
  PricingLogEntry,
  GetPricingLogInput,
  PricingPreviewDay,
  // Channels
  ChannelListItem,
  ListChannelsResult,
  ChannelDetail,
  ChannelSyncLogItem,
  // Booking Engine
  BookingEngineConfigDetail,
  // Auto Room Assignment
  RoomAssignmentPreferenceItem,
  RoomSuggestion,
  // Guest Self-Service Portal
  GuestPortalSessionDetail,
  GuestPortalFolio,
  GuestPortalFolioEntry,
  // Loyalty/Points
  LoyaltyProgramItem,
  LoyaltyMemberDetail,
  LoyaltyTransactionItem,
  ListLoyaltyTransactionsResult,
  // Utilization Grid
  UtilizationGridResponse,
  UtilizationRoomType,
  UtilizationCell,
  UtilizationByRoomResponse,
  UtilizationRoom,
  UtilizationRoomCell,
} from './queries';

// POS Integration Queries
export {
  searchCheckedInGuestsForPOS,
  getCheckedInGuestByRoom,
  getActiveFolioForGuest,
  getFolioSummaryForPOS,
} from './queries/pos-integration';

// Background Jobs
export {
  runNightlyChargePosting,
  runNoShowMarking,
  runHousekeepingAutoDirty,
} from './jobs';
export type {
  NightlyChargeResult,
  NoShowResult,
  AutoDirtyResult,
} from './jobs';
