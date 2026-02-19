// ── Golf Dashboard ──────────────────────────────────────────────

export interface GolfDashboardMetrics {
  todayRoundsPlayed: number;
  todayRevenue: number;
  utilizationBps: number;
  avgRoundDurationMin: number;
  cancelRateBps: number;
  noShowRateBps: number;
  onlinePctBps: number;
}

// ── Golf Utilization ────────────────────────────────────────────

export interface GolfUtilizationRow {
  businessDate: string;
  slotsBooked: number;
  slotsAvailable: number;
  utilizationBps: number;
  cancellations: number;
  noShows: number;
}

export interface TeeSheetKpis {
  slotsBooked: number;
  slotsAvailable: number;
  utilizationBps: number;
  cancellations: number;
  noShows: number;
  netPlayers: number;
  cancelRateBps: number;
  noShowRateBps: number;
}

// ── Golf Revenue ────────────────────────────────────────────────

export interface GolfRevenueRow {
  businessDate: string;
  greenFeeRevenue: number;
  cartFeeRevenue: number;
  rangeFeeRevenue: number;
  foodBevRevenue: number;
  proShopRevenue: number;
  taxTotal: number;
  totalRevenue: number;
  roundsPlayed: number;
  revPerRound: number;
}

// ── Pace & Ops ──────────────────────────────────────────────────

export interface PaceKpis {
  roundsCompleted: number;
  avgRoundDurationMin: number;
  slowRoundsCount: number;
  slowRoundPctBps: number;
  avgMinutesPerHole: number;
  startsCount: number;
  lateStartsCount: number;
  avgStartDelayMin: number;
  intervalComplianceBps: number;
}

export interface GolfDaypartRow {
  daypart: string;
  label: string;
  hourStart: number;
  hourEnd: number;
  slotsBooked: number;
  pctOfTotalBps: number;
}

// ── Channels ────────────────────────────────────────────────────

export interface ChannelKpis {
  onlineSlots: number;
  proshopSlots: number;
  phoneSlots: number;
  totalSlots: number;
  onlinePctBps: number;
  proshopPctBps: number;
  phonePctBps: number;
  memberRounds: number;
  publicRounds: number;
  leagueRounds: number;
  outingRounds: number;
  bookingCount: number;
  avgLeadTimeHours: number;
  lastMinuteCount: number;
  advancedCount: number;
  lastMinutePctBps: number;
  advancedPctBps: number;
}

// ── Customers ───────────────────────────────────────────────────

export interface GolfCustomerRow {
  id: string;
  customerId: string;
  customerName: string | null;
  totalRounds: number;
  totalRevenue: number;
  lastPlayedAt: string | null;
  avgPartySize: number;
}

export interface GolfCustomerKpis {
  totalCustomers: number;
  totalRounds: number;
  totalRevenue: number;
  avgRoundsPerCustomer: number;
  avgRevenuePerCustomer: number;
}
