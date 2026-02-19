export const MODULE_KEY = 'golf-reporting' as const;
export const MODULE_NAME = 'Golf Reporting & Analytics';
export const MODULE_VERSION = '0.1.0';

// ── Business Date Utility ─────────────────────────────────────
export { computeBusinessDate } from './business-date';

// ── Event Types ───────────────────────────────────────────────
export type {
  TeeTimeBookedData,
  TeeTimeCancelledData,
  TeeTimeNoShowData,
  TeeTimeCheckedInData,
  TeeTimeStartedData,
  TeeTimeCompletedData,
  PaceCheckpointData,
  GolfFolioPostedData,
  GolfEvent,
} from './events';

// ── Event Consumers ───────────────────────────────────────────
export {
  handleTeeTimeBooked,
  handleTeeTimeCancelled,
  handleTeeTimeNoShow,
  handleTeeTimeCheckedIn,
  handleTeeTimeStarted,
  handleTeeTimeCompleted,
  handleFolioPosted,
  handlePaceCheckpoint,
  handleChannelDailyBooked,
  handleChannelDailyCancelled,
} from './consumers';

// ── KPI Services ─────────────────────────────────────────────
export { getTeeSheetKpis } from './kpis';
export type { GetTeeSheetKpisInput, TeeSheetKpis } from './kpis';

export { getPaceKpis } from './kpis';
export type { GetPaceKpisInput, PaceKpis } from './kpis';

export { getChannelKpis } from './kpis';
export type { GetChannelKpisInput, ChannelKpis } from './kpis';

// ── Query Functions ──────────────────────────────────────────
export {
  getGolfRevenue,
  getGolfUtilization,
  getGolfDayparts,
  getGolfCustomers,
  getGolfCustomerKpis,
  getGolfDashboardMetrics,
} from './queries';
export type {
  GetGolfRevenueInput,
  GolfRevenueRow,
  GetGolfUtilizationInput,
  GolfUtilizationRow,
  GetGolfDaypartsInput,
  GolfDaypartRow,
  GetGolfCustomersInput,
  GolfCustomerRow,
  GolfCustomerListResult,
  GetGolfCustomerKpisInput,
  GolfCustomerKpis,
  GetGolfDashboardMetricsInput,
  GolfDashboardMetrics,
} from './queries';

// ── Seeds ───────────────────────────────────────────────────
export { seedGolfDashboards } from './seeds/default-dashboards';
