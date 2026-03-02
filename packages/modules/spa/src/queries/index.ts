// Settings
export { getSpaSettings } from './get-settings';

// Service categories
export { listServiceCategories } from './list-service-categories';
export type { ServiceCategoryRow } from './list-service-categories';

// Services
export { listServices } from './list-services';
export type { ListServicesInput, ServiceListRow, ListServicesResult } from './list-services';

export { getService } from './get-service';
export type { ServiceDetail, ServiceAddonLink, ServiceResourceRequirement } from './get-service';

export { getServiceMenu } from './get-service-menu';
export type { ServiceMenu, ServiceMenuCategory, ServiceMenuService } from './get-service-menu';

export { getServiceForBooking } from './get-service-for-booking';
export type {
  ServiceForBooking,
  BookingEligibleProvider,
  BookingResourceRequirement,
} from './get-service-for-booking';

// Service addons
export { listServiceAddons } from './list-service-addons';
export type { ServiceAddonRow } from './list-service-addons';

// Resources
export { listResources } from './list-resources';
export type { ListResourcesInput, ResourceListRow, ListResourcesResult } from './list-resources';

export { getResource } from './get-resource';
export type { ResourceDetail } from './get-resource';

export { getAvailableResources } from './get-available-resources';
export type { GetAvailableResourcesInput, AvailableResourceRow } from './get-available-resources';

// Providers
export { listProviders } from './list-providers';
export type { ListProvidersInput, ProviderListRow, ListProvidersResult } from './list-providers';

export { getProvider } from './get-provider';
export type {
  ProviderDetail,
  ProviderAvailabilitySlot,
  ProviderTimeOffEntry,
  ProviderEligibleService,
} from './get-provider';

export { getProviderSchedule } from './get-provider-schedule';
export type {
  ProviderScheduleResult,
  ScheduleAppointment,
  ScheduleAvailabilityBlock,
  ScheduleTimeOff,
} from './get-provider-schedule';

export { listProviderTimeOff } from './list-provider-time-off';
export type {
  ListProviderTimeOffInput,
  ProviderTimeOffRow,
  ListProviderTimeOffResult,
} from './list-provider-time-off';

export { getProviderEligibility } from './get-provider-eligibility';
export type { ProviderEligibilityRow } from './get-provider-eligibility';

// Appointments
export { listAppointments } from './list-appointments';
export type {
  ListAppointmentsInput,
  AppointmentListRow,
  AppointmentServiceRow,
  ListAppointmentsResult,
} from './list-appointments';

export { getAppointment } from './get-appointment';
export type {
  AppointmentDetail,
  AppointmentItemDetail,
  AppointmentIntakeResponse,
  AppointmentClinicalNote,
  AppointmentHistoryEntry,
} from './get-appointment';

export { getAppointmentsForCalendar } from './get-appointments-for-calendar';
export type {
  CalendarResult,
  CalendarProviderColumn,
  CalendarAppointment,
  CalendarAppointmentItem,
} from './get-appointments-for-calendar';

export { getAppointmentHistory } from './get-appointment-history';
export type {
  AppointmentHistoryInput,
  AppointmentHistoryRow,
  AppointmentHistoryServiceRow,
  AppointmentHistoryResult,
} from './get-appointment-history';

// Availability / Booking
export { getAvailableSlots } from './get-available-slots';
export type {
  GetAvailableSlotsInput,
  AvailableSlotsByProvider,
  GetAvailableSlotsResult,
} from './get-available-slots';
export type { AvailableSlot } from './get-available-slots';

// Dashboard
export { getSpaDashboard } from './get-spa-dashboard';
export type { SpaDashboardMetrics } from './get-spa-dashboard';

// Waitlist
export { listWaitlist } from './list-waitlist';
export type { ListWaitlistInput, WaitlistRow, ListWaitlistResult } from './list-waitlist';

export { getWaitlistStats } from './get-waitlist-stats';
export type { WaitlistStats } from './get-waitlist-stats';

// Commission Rules
export { listCommissionRules } from './list-commission-rules';
export type {
  ListCommissionRulesInput,
  CommissionRuleRow,
  ListCommissionRulesResult,
} from './list-commission-rules';

// Commission Ledger
export { listCommissionLedger } from './list-commission-ledger';
export type {
  ListCommissionLedgerInput,
  CommissionLedgerRow,
  ListCommissionLedgerResult,
} from './list-commission-ledger';

// Commission Summary
export { getProviderCommissionSummary } from './get-provider-commission-summary';
export type {
  GetProviderCommissionSummaryInput,
  ProviderCommissionSummary,
} from './get-provider-commission-summary';

// Provider Performance
export { getProviderPerformance } from './get-provider-performance';
export type {
  GetProviderPerformanceInput,
  ProviderPerformanceRow,
  GetProviderPerformanceResult,
} from './get-provider-performance';

// Package Definitions
export { listPackageDefinitions } from './list-package-definitions';
export type {
  ListPackageDefinitionsInput,
  PackageDefinitionRow,
  ListPackageDefinitionsResult,
} from './list-package-definitions';

export { getPackageDefinition } from './get-package-definition';
export type { PackageDefinitionDetail } from './get-package-definition';

// Customer Packages (Balances)
export { listCustomerPackages } from './list-customer-packages';
export type {
  ListCustomerPackagesInput,
  CustomerPackageRow,
  ListCustomerPackagesResult,
} from './list-customer-packages';

export { getPackageBalance } from './get-package-balance';
export type {
  PackageBalanceDetail,
  PackageRedemptionRow,
} from './get-package-balance';

// Appointment by token (public booking management)
export { getAppointmentByToken } from './get-appointment-by-token';
export type {
  AppointmentByTokenResult,
  AppointmentTokenItemRow,
} from './get-appointment-by-token';

// Spa Reporting Dashboard (CQRS read model date-range aggregation)
export { getSpaReportingDashboard } from './get-spa-reporting-dashboard';
export type {
  SpaReportingDashboardInput,
  SpaReportingDashboardResult,
} from './get-spa-reporting-dashboard';

// Provider Performance Report (CQRS read model)
export { getProviderPerformanceReport } from './get-provider-performance-report';
export type {
  ProviderPerformanceReportInput,
  ProviderPerformanceReportRow,
  ProviderPerformanceReportResult,
} from './get-provider-performance-report';

// Service Analytics (reporting)
export { getServiceAnalytics } from './get-service-analytics';
export type {
  GetServiceAnalyticsInput,
  ServiceAnalyticsRow,
  GetServiceAnalyticsResult,
} from './get-service-analytics';

// Client Insights (reporting)
export { getClientInsights } from './get-client-insights';
export type {
  GetClientInsightsInput,
  ClientInsightsRow,
  GetClientInsightsResult,
} from './get-client-insights';

// Daily Trends (reporting)
export { getSpaDailyTrends } from './get-spa-daily-trends';
export type {
  GetSpaDailyTrendsInput,
  DailyTrendRow,
  GetSpaDailyTrendsResult,
} from './get-spa-daily-trends';

// Turnover Tasks (operations)
export { listTurnoverTasks, getTurnoverTasksByResource, getTurnoverStats } from './list-turnover-tasks';
export type { TurnoverTaskRow, TurnoverStatsResult } from './list-turnover-tasks';

// Daily Operations (operations)
export { getDailyOperations, listDailyOperations } from './get-daily-operations';
export type { DailyOperationsRow } from './get-daily-operations';

// Online Booking Stats
export { getOnlineBookingStats } from './get-online-booking-stats';
export type {
  OnlineBookingStatsInput,
  OnlineBookingStats,
  RecentOnlineBooking,
} from './get-online-booking-stats';
