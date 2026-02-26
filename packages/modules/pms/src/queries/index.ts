export { listProperties } from './list-properties';
export type { PropertyListItem, ListPropertiesResult } from './list-properties';

export { getProperty } from './get-property';
export type { PropertyDetail } from './get-property';

export { listRoomTypes } from './list-room-types';
export type { RoomTypeListItem, ListRoomTypesResult } from './list-room-types';

export { getRoomType } from './get-room-type';
export type { RoomTypeDetail } from './get-room-type';

export { listRooms } from './list-rooms';
export type { RoomListItem, ListRoomsResult } from './list-rooms';

export { getRoom } from './get-room';
export type { RoomDetail } from './get-room';

export { listRatePlans } from './list-rate-plans';
export type { RatePlanListItem, ListRatePlansResult } from './list-rate-plans';

export { getRatePlan } from './get-rate-plan';
export type { RatePlanDetail, RatePlanPrice } from './get-rate-plan';

export { getNightlyRate } from './get-nightly-rate';
export type { NightlyRateResult } from './get-nightly-rate';

export { getRatePlanPrices } from './get-rate-plan-prices';
export type { RatePlanPriceRow } from './get-rate-plan-prices';

export { searchGuests } from './search-guests';
export type { GuestSearchItem, SearchGuestsResult } from './search-guests';

export { getGuest } from './get-guest';
export type { GuestDetail, GuestReservationSummary } from './get-guest';

export { listReservations } from './list-reservations';
export { getReservation } from './get-reservation';
export { suggestAvailableRooms } from './suggest-rooms';
export { listHousekeepingRooms } from './list-housekeeping-rooms';
export { getFolio } from './get-folio';
export { getFolioByReservation } from './get-folio-by-reservation';

export { getCalendarWeek } from './calendar-week';
export type {
  CalendarWeekResponse,
  CalendarRoom,
  CalendarSegment,
  OooBlock,
  OccupancyByDate,
  UnassignedReservation,
} from './calendar-week';

export { getCalendarDay } from './calendar-day';
export type { CalendarDayResponse } from './calendar-day';

export { getDailyOccupancy } from './daily-occupancy';
export type { DailyOccupancyRow } from './daily-occupancy';

export { getRateRestrictions } from './get-rate-restrictions';
export type { RateRestrictionRow, GetRateRestrictionsInput } from './get-rate-restrictions';

export { checkRestrictions } from './check-restrictions';
export type { CheckRestrictionsInput, CheckRestrictionsResult } from './check-restrictions';

export { listPaymentMethods } from './list-payment-methods';
export type { PaymentMethodItem } from './list-payment-methods';

export { listPaymentTransactions } from './list-payment-transactions';
export type { PaymentTransactionItem } from './list-payment-transactions';

export { listDepositPolicies } from './list-deposit-policies';
export type { DepositPolicyItem } from './list-deposit-policies';

export { listCancellationPolicies } from './list-cancellation-policies';
export type { CancellationPolicyItem } from './list-cancellation-policies';

export { listMessageTemplates } from './list-message-templates';
export type { MessageTemplateItem } from './list-message-templates';

export { getMessageTemplate } from './get-message-template';
export type { MessageTemplateDetail } from './get-message-template';

export { listMessageLog } from './list-message-log';
export type { MessageLogItem, ListMessageLogInput, ListMessageLogResult } from './list-message-log';

export { getOccupancyForecast } from './get-occupancy-forecast';
export type { OccupancyForecastDay } from './get-occupancy-forecast';

export { getRevenueByRoomType } from './get-revenue-by-room-type';
export type { RevenueByRoomTypeRow } from './get-revenue-by-room-type';

export { getPickupReport } from './get-pickup-report';
export type { PickupReportRow } from './get-pickup-report';

export { getManagerFlashReport } from './get-manager-flash-report';
export type { ManagerFlashReport } from './get-manager-flash-report';

export { getNoShowReport } from './get-no-show-report';
export type { NoShowReportRow, NoShowReportResult } from './get-no-show-report';

export { getHousekeepingProductivity } from './get-housekeeping-productivity';
export type { HousekeepingProductivityRow } from './get-housekeeping-productivity';

export { listHousekeepers } from './list-housekeepers';
export type { HousekeeperItem } from './list-housekeepers';

export { listHousekeepingAssignments } from './list-housekeeping-assignments';
export type { HousekeepingAssignmentItem } from './list-housekeeping-assignments';

export { getHousekeeperWorkload } from './get-housekeeper-workload';
export type { HousekeeperWorkload } from './get-housekeeper-workload';

export { listWorkOrders } from './list-work-orders';
export type { WorkOrderListItem, ListWorkOrdersInput, ListWorkOrdersResult } from './list-work-orders';

export { getWorkOrder } from './get-work-order';
export type { WorkOrderDetail, WorkOrderComment } from './get-work-order';

export { listRatePackages } from './list-rate-packages';
export type { RatePackageListItem, ListRatePackagesResult } from './list-rate-packages';

export { getRatePackage } from './get-rate-package';
export type { RatePackageDetail } from './get-rate-package';

// ── Groups ──────────────────────────────────────────────────────────
export { listGroups } from './list-groups';
export type { GroupListItem, ListGroupsResult } from './list-groups';

export { getGroup } from './get-group';
export type { GroupDetail, GroupRoomBlock } from './get-group';

// ── Corporate Accounts ──────────────────────────────────────────────
export { listCorporateAccounts } from './list-corporate-accounts';
export type { CorporateAccountListItem, ListCorporateAccountsResult } from './list-corporate-accounts';

export { getCorporateAccount } from './get-corporate-account';
export type { CorporateAccountDetail, CorporateRateOverride } from './get-corporate-account';

export { getCorporateRate } from './get-corporate-rate';
export type { CorporateRateResult } from './get-corporate-rate';

// ── Calendar Month ───────────────────────────────────────────────────
export { getCalendarMonth } from './get-calendar-month';
export type { MonthDay, CalendarMonthResult } from './get-calendar-month';

// ── Pricing Rules ───────────────────────────────────────────────────
export { listPricingRules } from './list-pricing-rules';
export type { PricingRuleListItem, ListPricingRulesResult } from './list-pricing-rules';

export { getPricingRule } from './get-pricing-rule';
export type { PricingRuleDetail } from './get-pricing-rule';

export { getPricingLog } from './get-pricing-log';
export type { PricingLogEntry, GetPricingLogInput } from './get-pricing-log';

export { previewPricing } from './preview-pricing';
export type { PricingPreviewDay } from './preview-pricing';

// ── Channels ────────────────────────────────────────────────────────
export { listChannels } from './list-channels';
export type { ChannelListItem, ListChannelsResult } from './list-channels';

export { getChannel } from './get-channel';
export type { ChannelDetail } from './get-channel';

export { listChannelSyncLog } from './list-channel-sync-log';
export type { ChannelSyncLogItem } from './list-channel-sync-log';

// ── Booking Engine ──────────────────────────────────────────────────
export { getBookingEngineConfig } from './get-booking-engine-config';
export type { BookingEngineConfigDetail } from './get-booking-engine-config';

// ── Auto Room Assignment ────────────────────────────────────────────
export { listRoomAssignmentPreferences } from './list-room-assignment-preferences';
export type { RoomAssignmentPreferenceItem } from './list-room-assignment-preferences';

export { getRoomSuggestions } from './get-room-suggestions';
export type { RoomSuggestion } from './get-room-suggestions';

// ── Guest Self-Service Portal ──────────────────────────────────────
export { getGuestPortalSessionByToken, getGuestPortalSession } from './get-guest-portal-session';
export type { GuestPortalSessionDetail } from './get-guest-portal-session';

export { getGuestPortalFolio } from './get-guest-portal-folio';
export type { GuestPortalFolio, GuestPortalFolioEntry } from './get-guest-portal-folio';

// ── Loyalty/Points ─────────────────────────────────────────────────
export { listLoyaltyPrograms } from './list-loyalty-programs';
export type { LoyaltyProgramItem } from './list-loyalty-programs';

export { getLoyaltyMember } from './get-loyalty-member';
export type { LoyaltyMemberDetail } from './get-loyalty-member';

export { listLoyaltyTransactions } from './list-loyalty-transactions';
export type { LoyaltyTransactionItem, ListLoyaltyTransactionsResult } from './list-loyalty-transactions';

// ── Utilization Grid ────────────────────────────────────────────────
export { getUtilizationGrid } from './get-utilization-grid';
export type { UtilizationGridResponse, UtilizationRoomType, UtilizationCell } from './get-utilization-grid';

export { getUtilizationGridByRoom } from './get-utilization-grid-by-room';
export type { UtilizationByRoomResponse, UtilizationRoom, UtilizationRoomCell } from './get-utilization-grid-by-room';
