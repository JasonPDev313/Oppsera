// Events
export * from './events';

// Consumers
export * from './consumers';

// Validation schemas
export * from './validation';

// Commands
export { updateSpaSettings } from './commands/update-settings';
export { createResource } from './commands/create-resource';
export { updateResource } from './commands/update-resource';
export { deactivateResource } from './commands/deactivate-resource';
export { createService } from './commands/create-service';
export { updateService } from './commands/update-service';
export { archiveService } from './commands/archive-service';
export { createServiceCategory } from './commands/create-service-category';
export { updateServiceCategory } from './commands/update-service-category';
export { createProvider } from './commands/create-provider';
export { updateProvider } from './commands/update-provider';
export { deactivateProvider } from './commands/deactivate-provider';
export { setProviderAvailability } from './commands/set-provider-availability';
export { createProviderTimeOff, cancelProviderTimeOff } from './commands/manage-provider-time-off';
export { setProviderEligibility } from './commands/set-provider-eligibility';
export { createAppointment } from './commands/create-appointment';
export { updateAppointment } from './commands/update-appointment';
export { confirmAppointment } from './commands/confirm-appointment';
export { checkInAppointment } from './commands/check-in-appointment';
export { startService } from './commands/start-service';
export { completeService } from './commands/complete-service';
export { checkoutAppointment } from './commands/checkout-appointment';
export { cancelAppointment } from './commands/cancel-appointment';
export { noShowAppointment } from './commands/no-show-appointment';
export { rescheduleAppointment } from './commands/reschedule-appointment';
export { addAppointmentService } from './commands/add-appointment-service';
export { removeAppointmentService } from './commands/remove-appointment-service';
export { createRecurringAppointment } from './commands/create-recurring-appointment';
export { bulkUpdateAppointments } from './commands/bulk-update-appointments';
export { createServiceAddon, linkAddonToService, unlinkAddonFromService } from './commands/manage-service-addons';
export { addResourceRequirement, removeResourceRequirement } from './commands/manage-service-resources';
export { reorderServices } from './commands/reorder-services';
export { addToWaitlist, removeFromWaitlist, offerWaitlistSlot, acceptWaitlistOffer, declineWaitlistOffer } from './commands/manage-waitlist';
export { createCommissionRule, updateCommissionRule, deactivateCommissionRule } from './commands/manage-commission-rules';
export { calculateAppointmentCommissions, approveCommissions, payCommissions } from './commands/calculate-commissions';
export { createPackageDefinition, updatePackageDefinition, deactivatePackageDefinition } from './commands/manage-package-definitions';
export { purchasePackage, redeemPackageSession, voidPackageRedemption, freezePackage, unfreezePackage, transferPackage, expirePackages } from './commands/manage-packages';
export { createTurnoverTask, updateTurnoverTask, startTurnoverTask, completeTurnoverTask, skipTurnoverTask, autoCreateTurnoverTasks } from './commands/manage-turnovers';
export { openDailyOperations, updateChecklistItem, addIncident, closeDailyOperations, addDailyNotes } from './commands/manage-daily-operations';

// Queries
export {
  getSpaSettings,
  listServiceCategories,
  listServices,
  getService,
  getServiceMenu,
  getServiceForBooking,
  listServiceAddons,
  listResources,
  getResource,
  getAvailableResources,
  listProviders,
  getProvider,
  getProviderSchedule,
  listProviderTimeOff,
  getProviderEligibility,
  listAppointments,
  getAppointment,
  getAppointmentsForCalendar,
  getAppointmentHistory,
  getSpaDashboard,
  listWaitlist,
  getWaitlistStats,
  listCommissionRules,
  listCommissionLedger,
  getProviderCommissionSummary,
  getProviderPerformance,
  listPackageDefinitions,
  getPackageDefinition,
  listCustomerPackages,
  getPackageBalance,
  getAppointmentByToken,
  getServiceAnalytics,
  getClientInsights,
  getSpaDailyTrends,
  getSpaReportingDashboard,
  getProviderPerformanceReport,
  listTurnoverTasks,
  getTurnoverTasksByResource,
  getTurnoverStats,
  getDailyOperations,
  listDailyOperations,
} from './queries';
export { getAvailableSlots as getAvailableSlotsQuery } from './queries';

export type {
  ServiceCategoryRow,
  ListServicesInput,
  ServiceListRow,
  ListServicesResult,
  ServiceDetail,
  ServiceAddonLink,
  ServiceResourceRequirement,
  ServiceMenu,
  ServiceMenuCategory,
  ServiceMenuService,
  ServiceForBooking,
  BookingEligibleProvider,
  BookingResourceRequirement,
  ServiceAddonRow,
  ListResourcesInput,
  ResourceListRow,
  ListResourcesResult,
  ResourceDetail,
  GetAvailableResourcesInput,
  AvailableResourceRow,
  ListProvidersInput,
  ProviderListRow,
  ListProvidersResult,
  ProviderDetail,
  ProviderAvailabilitySlot,
  ProviderTimeOffEntry,
  ProviderEligibleService,
  ProviderScheduleResult,
  ScheduleAppointment,
  ScheduleAvailabilityBlock,
  ScheduleTimeOff,
  ListProviderTimeOffInput,
  ProviderTimeOffRow,
  ListProviderTimeOffResult,
  ProviderEligibilityRow,
  ListAppointmentsInput,
  AppointmentListRow,
  AppointmentServiceRow,
  ListAppointmentsResult,
  AppointmentDetail,
  AppointmentItemDetail,
  AppointmentIntakeResponse,
  AppointmentClinicalNote,
  AppointmentHistoryEntry,
  CalendarResult,
  CalendarProviderColumn,
  CalendarAppointment,
  CalendarAppointmentItem,
  AppointmentHistoryInput,
  AppointmentHistoryRow,
  AppointmentHistoryServiceRow,
  AppointmentHistoryResult,
  GetAvailableSlotsInput,
  AvailableSlotsByProvider,
  GetAvailableSlotsResult,
  SpaDashboardMetrics,
  ListWaitlistInput,
  WaitlistRow,
  ListWaitlistResult,
  WaitlistStats,
  ListCommissionRulesInput,
  CommissionRuleRow,
  ListCommissionRulesResult,
  ListCommissionLedgerInput,
  CommissionLedgerRow,
  ListCommissionLedgerResult,
  GetProviderCommissionSummaryInput,
  ProviderCommissionSummary,
  GetProviderPerformanceInput,
  ProviderPerformanceRow,
  GetProviderPerformanceResult,
  ListPackageDefinitionsInput,
  PackageDefinitionRow,
  ListPackageDefinitionsResult,
  PackageDefinitionDetail,
  ListCustomerPackagesInput,
  CustomerPackageRow,
  ListCustomerPackagesResult,
  PackageBalanceDetail,
  PackageRedemptionRow,
  AppointmentByTokenResult,
  AppointmentTokenItemRow,
  GetServiceAnalyticsInput,
  ServiceAnalyticsRow,
  GetServiceAnalyticsResult,
  GetClientInsightsInput,
  ClientInsightsRow,
  GetClientInsightsResult,
  GetSpaDailyTrendsInput,
  DailyTrendRow,
  GetSpaDailyTrendsResult,
  SpaReportingDashboardInput,
  SpaReportingDashboardResult,
  ProviderPerformanceReportInput,
  ProviderPerformanceReportRow,
  ProviderPerformanceReportResult,
  TurnoverTaskRow,
  TurnoverStatsResult,
  DailyOperationsRow,
} from './queries';

// Helpers — Availability Engine
export {
  getAvailableSlots,
  checkSlotAvailability,
  getProviderDaySchedule,
} from './helpers/availability-engine';
export type {
  AvailableSlot,
  ProviderDaySchedule,
  GetAvailableSlotsParams,
  CheckSlotAvailabilityParams,
  CheckSlotAvailabilityResult,
  GetProviderDayScheduleParams,
} from './helpers/availability-engine';

// Helpers — Appointment Transitions
export {
  canTransitionAppointment,
  assertAppointmentTransition,
  isTerminalStatus,
  isActiveStatus,
  getEventTypeForTransition,
  getStatusLabel,
  APPOINTMENT_TRANSITIONS,
  ACTIVE_APPOINTMENT_STATUSES,
  TERMINAL_STATUSES,
  CONFLICT_EXCLUDED_STATUSES,
} from './helpers/appointment-transitions';
export type { AppointmentStatus } from './helpers/appointment-transitions';

// Helpers — Conflict Detection
export { detectConflicts } from './helpers/conflict-detector';
export type { ConflictCheckParams, ConflictResult, ConflictDetail } from './helpers/conflict-detector';

// Helpers — Waitlist Matcher
export {
  scoreWaitlistEntry,
  matchWaitlistEntries,
  isFlexibilityCompatible,
  formatMatchSummary,
} from './helpers/waitlist-matcher';
export type {
  CanceledSlot,
  WaitlistEntry,
  WaitlistMatch,
  MatchFactor,
} from './helpers/waitlist-matcher';

// Helpers — Deposit Rules
export {
  calculateDeposit,
  shouldWaiveDeposit,
  calculateRefundableDeposit,
  getDefaultDepositConfig,
} from './helpers/deposit-rules';
export type {
  DepositConfig,
  DepositInput,
  DepositResult,
} from './helpers/deposit-rules';

// Helpers — Cancellation Engine
export {
  getHoursUntilAppointment,
  isWithinCancellationWindow,
  getDefaultCancellationConfig,
  shouldWaiveCancellationFee,
  calculateCancellationFee,
  calculateTieredCancellationFee,
  calculateNoShowFee,
} from './helpers/cancellation-engine';
export type {
  CancellationConfig,
  CancellationInput,
  CancellationResult,
  NoShowFeeResult,
  CancellationTier,
} from './helpers/cancellation-engine';

// Helpers — Commission Engine
export {
  isRuleEffective,
  resolveCommissionRule,
  getResolutionLevel,
  calculateCommission,
  computeAppointmentCommissions,
  getResolutionDescription,
} from './helpers/commission-engine';
export type {
  CommissionType,
  CommissionAppliesTo,
  CommissionRule,
  CommissionInput,
  CommissionResult,
  CommissionSummary,
} from './helpers/commission-engine';

// Helpers — Rebooking Engine
export {
  generateRebookingSuggestions,
  scoreDayForRebooking,
  findBestTimeSlot,
  getNextOccurrence,
  formatSuggestionReason,
  getDaysBetween,
} from './helpers/rebooking-engine';
export type {
  RebookingSuggestion,
  RebookingTimeSlot,
  RebookingPreferences,
  AvailableDay,
  RebookingInput,
} from './helpers/rebooking-engine';

// Helpers — Dynamic Pricing Engine
export {
  getDefaultPricingConfig,
  calculateDynamicPrice,
  getTimeOfDayAdjustment,
  getDayOfWeekAdjustment,
  getDemandAdjustment,
  getLeadTimeAdjustment,
  formatPricingBreakdown,
} from './helpers/dynamic-pricing';
export type {
  PricingConfig,
  PricingInput,
  PricingResult,
  PricingAdjustment,
} from './helpers/dynamic-pricing';

export { resolveCatalogItemForSpaService } from './helpers/catalog-bridge';
