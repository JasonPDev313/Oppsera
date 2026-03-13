'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  DollarSign,
  Users,
  Brush,
  BedDouble,
  TrendingUp,
  LogIn,
  LogOut,
  Ban,
  RefreshCw,
  CalendarDays,
  Building2,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  AlertTriangle,
  CheckCircle,
  Printer,
  Hash,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Select } from '@/components/ui/select';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface ManagerFlash {
  businessDate: string;
  totalRooms: number;
  roomsOccupied: number;
  occupancyPct: number;
  adrCents: number;
  revParCents: number;
  roomRevenueCents: number;
  arrivals: number;
  departures: number;
  stayovers: number;
  oooRooms: number;
}

interface RevenueByRoomType {
  roomTypeId: string;
  roomTypeName: string;
  roomNights: number;
  revenueCents: number;
  adrCents: number;
  occupancyPct: number;
}

interface NoShowRecord {
  reservationId: string;
  guestName: string;
  roomTypeName: string;
  checkInDate: string;
  nightlyRateCents: number;
  lostRevenueCents: number;
}

interface HousekeepingProductivity {
  housekeeperId: string;
  housekeeperName: string;
  roomsCleaned: number;
  avgMinutesPerRoom: number;
  totalMinutes: number;
  inspectionPassRate: number;
}

interface ActivityByDayRow {
  code: string;
  description: string;
  grossCents: number;
  adjustCents: number;
  netCents: number;
  ptdGrossCents: number;
  ptdAdjustCents: number;
  ptdNetCents: number;
  ytdGrossCents: number;
  ytdAdjustCents: number;
  ytdNetCents: number;
}

interface ActivityByDayData {
  businessDate: string;
  propertyId: string;
  rows: ActivityByDayRow[];
  totals: {
    grossCents: number;
    adjustCents: number;
    netCents: number;
    ptdGrossCents: number;
    ptdAdjustCents: number;
    ptdNetCents: number;
    ytdGrossCents: number;
    ytdAdjustCents: number;
    ytdNetCents: number;
  };
}

interface DepartmentAuditEntry {
  entryId: string;
  businessDate: string;
  folioNumber: number | null;
  roomNumber: string | null;
  postedAt: string;
  entryType: string;
  description: string;
  grossCents: number;
  voidCents: number;
  adjustCents: number;
  netCents: number;
  ledger: string;
  postedBy: string | null;
}

interface DepartmentAuditGroup {
  departmentCode: string;
  entryCount: number;
  entries: DepartmentAuditEntry[];
  totalGrossCents: number;
  totalVoidCents: number;
  totalAdjustCents: number;
  totalNetCents: number;
}

interface OccupancyForecastDay {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyPct: number;
  arrivals: number;
  departures: number;
}

interface PickupReportRow {
  targetDate: string;
  roomsBookedSinceSnapshot: number;
  totalRoomsBooked: number;
}

interface DepartmentAuditData {
  propertyName: string;
  startDate: string;
  endDate: string;
  departments: DepartmentAuditGroup[];
  grandTotalGrossCents: number;
  grandTotalVoidCents: number;
  grandTotalAdjustCents: number;
  grandTotalNetCents: number;
  totalEntries: number;
  truncated: boolean;
}

// ── Tab definition ──────────────────────────────────────────────

type TabId = 'overview' | 'revenue' | 'activity' | 'dept-audit' | 'operations' | 'housekeeping' | 'forecast' | 'pickup';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'activity', label: 'Activity by Day', icon: CalendarDays },
  { id: 'dept-audit', label: 'Dept Audit', icon: Building2 },
  { id: 'operations', label: 'Operations', icon: Users },
  { id: 'housekeeping', label: 'Housekeeping', icon: Brush },
  { id: 'forecast', label: 'Forecast', icon: TrendingUp },
  { id: 'pickup', label: 'Pickup', icon: BedDouble },
];

// ── Helpers ──────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function occupancyColor(pct: number): string {
  if (pct < 60) return 'bg-green-500/20 text-green-500';
  if (pct <= 85) return 'bg-amber-500/20 text-amber-500';
  return 'bg-red-500/20 text-red-500';
}

// ── KPI Card ────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton for tab content ────────────────────────────

function TabSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4"
        >
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-16">
      <BedDouble className="h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-sm font-semibold text-foreground">No data</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ── Overview Tab ────────────────────────────────────────────────

function OverviewTab({
  propertyId,
  businessDate,
}: {
  propertyId: string;
  businessDate: string;
}) {
  const [data, setData] = useState<ManagerFlash | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, businessDate });
        const res = await apiFetch<{ data: ManagerFlash }>(
          `/api/v1/pms/reports/manager-flash${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(res.data ?? null);
      } catch {
        if (!controller.signal.aborted) setData(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [propertyId, businessDate]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-surface px-4 py-3"
          >
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-6 w-16 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState message="No flash report data available for this date." />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        Manager Flash Report &mdash; {data.businessDate}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${occupancyColor(data.occupancyPct)}`}
            >
              <BedDouble className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">
                Occupancy
              </p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">
                {formatPct(data.occupancyPct)}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.roomsOccupied} / {data.totalRooms} rooms
              </p>
            </div>
          </div>
        </div>
        <KpiCard
          label="ADR"
          value={formatCents(data.adrCents)}
          color="bg-indigo-500/20 text-indigo-500"
          icon={TrendingUp}
        />
        <KpiCard
          label="RevPAR"
          value={formatCents(data.revParCents)}
          color="bg-purple-500/20 text-purple-500"
          icon={DollarSign}
        />
        <KpiCard
          label="Room Revenue"
          value={formatCents(data.roomRevenueCents)}
          color="bg-emerald-500/20 text-emerald-500"
          icon={DollarSign}
        />
        <KpiCard
          label="Arrivals"
          value={data.arrivals}
          color="bg-blue-500/20 text-blue-500"
          icon={LogIn}
        />
        <KpiCard
          label="Departures"
          value={data.departures}
          color="bg-orange-500/20 text-orange-500"
          icon={LogOut}
        />
        <KpiCard
          label="Stayovers"
          value={data.stayovers}
          color="bg-muted text-muted-foreground"
          icon={Users}
        />
        <KpiCard
          label="OOO Rooms"
          value={data.oooRooms}
          color="bg-red-500/20 text-red-500"
          icon={Ban}
        />
      </div>
    </div>
  );
}

// ── Revenue Tab ─────────────────────────────────────────────────

function RevenueTab({
  propertyId,
  startDate,
  endDate,
}: {
  propertyId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<RevenueByRoomType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, startDate, endDate });
        const res = await apiFetch<{ data: RevenueByRoomType[] }>(
          `/api/v1/pms/reports/revenue-by-room-type${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(res.data ?? []);
      } catch {
        if (!controller.signal.aborted) setData([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [propertyId, startDate, endDate]);

  if (isLoading) return <TabSkeleton rows={5} />;
  if (data.length === 0)
    return (
      <EmptyState message="No revenue data for the selected date range." />
    );

  const totalRevenue = data.reduce((sum, r) => sum + r.revenueCents, 0);
  const totalNights = data.reduce((sum, r) => sum + r.roomNights, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Revenue by Room Type
        </h2>
        <p className="text-sm text-muted-foreground">
          Total: {formatCents(totalRevenue)} &middot; {totalNights} room nights
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Room Type
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Room Nights
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Revenue
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                ADR
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Occupancy
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {data.map((row) => (
              <tr key={row.roomTypeId}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  {row.roomTypeName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                  {row.roomNights}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                  {formatCents(row.revenueCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                  {formatCents(row.adrCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${occupancyColor(row.occupancyPct)}`}
                  >
                    {formatPct(row.occupancyPct)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Operations Tab ──────────────────────────────────────────────

function OperationsTab({
  propertyId,
  startDate,
  endDate,
}: {
  propertyId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<NoShowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, startDate, endDate });
        const res = await apiFetch<{ data: NoShowRecord[] }>(
          `/api/v1/pms/reports/no-show${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(res.data ?? []);
      } catch {
        if (!controller.signal.aborted) setData([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [propertyId, startDate, endDate]);

  if (isLoading) return <TabSkeleton rows={5} />;
  if (data.length === 0)
    return (
      <EmptyState message="No no-show records for the selected date range." />
    );

  const totalLost = data.reduce((sum, r) => sum + r.lostRevenueCents, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          No-Show Report
        </h2>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">
            {data.length} no-show{data.length !== 1 ? 's' : ''}
          </p>
          <p className="text-sm font-medium text-red-500">
            Lost revenue: {formatCents(totalLost)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Guest
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Room Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Check-in Date
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nightly Rate
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Lost Revenue
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {data.map((row) => (
              <tr key={row.reservationId}>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  {row.guestName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                  {row.roomTypeName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                  {row.checkInDate}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                  {formatCents(row.nightlyRateCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-red-500">
                  {formatCents(row.lostRevenueCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Housekeeping Tab ────────────────────────────────────────────

function HousekeepingTab({
  propertyId,
  startDate,
  endDate,
}: {
  propertyId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<HousekeepingProductivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, startDate, endDate });
        const res = await apiFetch<{ data: HousekeepingProductivity[] }>(
          `/api/v1/pms/reports/housekeeping-productivity${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(res.data ?? []);
      } catch {
        if (!controller.signal.aborted) setData([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [propertyId, startDate, endDate]);

  if (isLoading) return <TabSkeleton rows={5} />;
  if (data.length === 0)
    return (
      <EmptyState message="No housekeeping productivity data for the selected date range." />
    );

  const totalRoomsCleaned = data.reduce((sum, r) => sum + r.roomsCleaned, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Housekeeping Productivity
        </h2>
        <p className="text-sm text-muted-foreground">
          {totalRoomsCleaned} rooms cleaned by {data.length} housekeeper
          {data.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Housekeeper
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Rooms Cleaned
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Avg Min / Room
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total Time
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Inspection Pass Rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {data.map((row) => {
              const hours = Math.floor(row.totalMinutes / 60);
              const mins = row.totalMinutes % 60;
              return (
                <tr key={row.housekeeperId}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                    {row.housekeeperName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                    {row.roomsCleaned}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                    {row.avgMinutesPerRoom.toFixed(1)} min
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                    {hours}h {mins}m
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.inspectionPassRate >= 95
                          ? 'bg-green-500/20 text-green-500'
                          : row.inspectionPassRate >= 80
                            ? 'bg-amber-500/20 text-amber-500'
                            : 'bg-red-500/20 text-red-500'
                      }`}
                    >
                      {formatPct(row.inspectionPassRate)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Activity by Day Tab ────────────────────────────────────────

function ActivityByDayTab({
  propertyId,
  businessDate,
}: {
  propertyId: string;
  businessDate: string;
}) {
  const [data, setData] = useState<ActivityByDayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, businessDate });
        const res = await apiFetch<{ data: ActivityByDayData }>(
          `/api/v1/pms/reports/activity-by-day${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(res.data ?? null);
      } catch {
        if (!controller.signal.aborted) setData(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [propertyId, businessDate]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!search) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <TabSkeleton rows={8} />
      </div>
    );
  }

  if (!data || data.rows.length === 0)
    return (
      <EmptyState message="No activity data for this business date." />
    );

  return (
    <div className="space-y-4">
      {/* Print header — only visible when printing */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold print:text-gray-900">Activity by Day</h1>
        <p className="text-sm print:text-gray-700">
          Revenue/Debit Departments &mdash; Business Date: {data.businessDate}
        </p>
        <p className="text-xs print:text-gray-500">
          Generated {new Date().toLocaleString()}
        </p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
        <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-500">
              <DollarSign className="h-4 w-4" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Day Net</p>
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
            {formatCents(data.totals.netCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
              <TrendingUp className="h-4 w-4" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">PTD Net</p>
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
            {formatCents(data.totals.ptdNetCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-purple-500">
              <BarChart3 className="h-4 w-4" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">YTD Net</p>
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
            {formatCents(data.totals.ytdNetCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Departments</p>
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
            {data.rows.length}
          </p>
        </div>
      </div>

      {/* Toolbar — search + print */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="relative flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Search departments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface py-2 pl-3 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              &times;
            </button>
          )}
        </div>
        {search && (
          <span className="text-xs text-muted-foreground">
            {filteredRows.length} of {data.rows.length} departments
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            Print
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block print:block print:border-gray-300">
        <table className="min-w-full divide-y divide-border print:divide-gray-300">
          <thead className="bg-muted print:bg-gray-100">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Code
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Description
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Gross
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Adjust
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Net
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                PTD Gross
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                PTD Adjust
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                PTD Net
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                YTD Gross
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                YTD Adjust
              </th>
              <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                YTD Net
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface print:divide-gray-200">
            {filteredRows.map((row) => (
              <tr key={row.code} className="hover:bg-accent/30">
                <td className="whitespace-nowrap px-3 py-3 font-mono text-sm font-medium text-foreground">
                  {row.code}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-foreground">
                  {row.description}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                  {formatCents(row.grossCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                  {formatCents(row.adjustCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium tabular-nums text-foreground">
                  {formatCents(row.netCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                  {formatCents(row.ptdGrossCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                  {formatCents(row.ptdAdjustCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium tabular-nums text-foreground">
                  {formatCents(row.ptdNetCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                  {formatCents(row.ytdGrossCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                  {formatCents(row.ytdAdjustCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium tabular-nums text-foreground">
                  {formatCents(row.ytdNetCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border bg-muted font-bold print:border-gray-400 print:bg-gray-100">
            <tr>
              <td className="whitespace-nowrap px-3 py-3 text-sm text-foreground">
                Totals
              </td>
              <td />
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.grossCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.adjustCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.netCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.ptdGrossCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.ptdAdjustCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.ptdNetCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.ytdGrossCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.ytdAdjustCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.totals.ytdNetCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile Card Layout */}
      <div className="space-y-3 md:hidden print:hidden">
        {filteredRows.map((row) => (
          <div
            key={row.code}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-foreground">
                {row.code}
              </span>
              <span className="text-sm text-muted-foreground">{row.description}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="font-medium text-muted-foreground">Day</p>
                <p className="tabular-nums text-foreground">
                  {formatCents(row.grossCents)}
                </p>
                {row.adjustCents !== 0 && (
                  <p className="tabular-nums text-muted-foreground">
                    Adj {formatCents(row.adjustCents)}
                  </p>
                )}
                <p className="font-medium tabular-nums text-foreground">
                  Net {formatCents(row.netCents)}
                </p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">PTD</p>
                <p className="tabular-nums text-foreground">
                  {formatCents(row.ptdGrossCents)}
                </p>
                {row.ptdAdjustCents !== 0 && (
                  <p className="tabular-nums text-muted-foreground">
                    Adj {formatCents(row.ptdAdjustCents)}
                  </p>
                )}
                <p className="font-medium tabular-nums text-foreground">
                  Net {formatCents(row.ptdNetCents)}
                </p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">YTD</p>
                <p className="tabular-nums text-foreground">
                  {formatCents(row.ytdGrossCents)}
                </p>
                {row.ytdAdjustCents !== 0 && (
                  <p className="tabular-nums text-muted-foreground">
                    Adj {formatCents(row.ytdAdjustCents)}
                  </p>
                )}
                <p className="font-medium tabular-nums text-foreground">
                  Net {formatCents(row.ytdNetCents)}
                </p>
              </div>
            </div>
          </div>
        ))}
        {/* Mobile totals card */}
        <div className="rounded-lg border border-border bg-muted p-4">
          <p className="text-sm font-bold text-foreground">Totals</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="font-medium text-muted-foreground">Day Net</p>
              <p className="font-bold tabular-nums text-foreground">
                {formatCents(data.totals.netCents)}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">PTD Net</p>
              <p className="font-bold tabular-nums text-foreground">
                {formatCents(data.totals.ptdNetCents)}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">YTD Net</p>
              <p className="font-bold tabular-nums text-foreground">
                {formatCents(data.totals.ytdNetCents)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Department Audit Tab (§175 compliant) ─────────────────────

const DEPT_COLORS = [
  'bg-green-500', 'bg-indigo-500', 'bg-amber-500', 'bg-sky-500',
  'bg-violet-500', 'bg-red-500', 'bg-teal-500', 'bg-pink-500',
];

function DepartmentAuditTab({
  propertyId,
  startDate,
  endDate,
}: {
  propertyId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<DepartmentAuditData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, startDate, endDate });
        const res = await apiFetch<{ data: DepartmentAuditData }>(
          `/api/v1/pms/reports/department-audit${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(res.data ?? null);
      } catch {
        if (!controller.signal.aborted) setData(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [propertyId, startDate, endDate]);

  // Filtered departments based on search
  const filteredDepts = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.departments;
    const q = search.toLowerCase();
    return data.departments
      .map((dept) => ({
        ...dept,
        entries: dept.entries.filter(
          (e) =>
            e.description.toLowerCase().includes(q) ||
            (e.roomNumber ?? '').toLowerCase().includes(q) ||
            String(e.folioNumber ?? '').includes(q) ||
            dept.departmentCode.toLowerCase().includes(q),
        ),
      }))
      .filter((dept) => dept.entries.length > 0);
  }, [data, search]);

  const filteredEntryCount = useMemo(
    () => filteredDepts.reduce((s, d) => s + d.entries.length, 0),
    [filteredDepts],
  );

  const activeSectionCodes = useMemo(
    () => filteredDepts.map((d) => d.departmentCode),
    [filteredDepts],
  );

  // Handlers
  const toggleSection = useCallback((code: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedSections(new Set(activeSectionCodes)),
    [activeSectionCodes],
  );

  // Loading skeleton (§175: KPI grid + table rows)
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-6 w-28 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state (§175: centered card with domain icon)
  if (!data || data.departments.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-12 text-center">
        <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h3 className="mt-3 text-sm font-medium text-foreground">No Department Activity</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No folio entries found for the selected date range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Print header (§175: hidden print:block) */}
      <div className="hidden print:block print:mb-4">
        <h2 className="text-lg font-bold">Department Audit Report</h2>
        <div className="mt-1 flex gap-4 text-sm text-gray-600">
          <span>Property: {data.propertyName}</span>
          <span>Period: {data.startDate} to {data.endDate}</span>
          <span>Generated: {new Date().toLocaleString()}</span>
        </div>
      </div>

      {/* KPI summary cards (§175: 4 cards) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            <span className="text-xs font-medium text-muted-foreground">Grand Total Net</span>
          </div>
          <div className="mt-1.5">
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatCents(data.grandTotalNetCents)}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-medium text-muted-foreground">Total Gross</span>
          </div>
          <div className="mt-1.5">
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatCents(data.grandTotalGrossCents)}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Entries</span>
          </div>
          <div className="mt-1.5">
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {data.totalEntries} across {data.departments.length} depts
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:p-2">
          <div className="flex items-center gap-2">
            {data.truncated ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-500" />
            )}
            <span className="text-xs font-medium text-muted-foreground">Status</span>
          </div>
          <div className="mt-1.5">
            <span className={`text-xl font-semibold ${data.truncated ? 'text-amber-500' : 'text-foreground'}`}>
              {data.truncated ? 'Truncated (10K limit)' : 'Complete'}
            </span>
          </div>
        </div>
      </div>

      {/* Truncation warning banner */}
      {data.truncated && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 print:border-gray-300 print:bg-gray-50">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <span className="text-sm font-medium text-amber-500 print:text-gray-700">
            Results were capped at 10,000 entries. Narrow the date range for complete data.
          </span>
        </div>
      )}

      {/* Toolbar — search + expand/collapse + print (§175: print:hidden) */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {search && (
          <span className="text-xs text-muted-foreground">
            {filteredEntryCount} of {data.totalEntries} entries
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Collapse All
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {/* Desktop Table (§175: collapsible sections) */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block print:block print:border-gray-300">
        <table className="min-w-full divide-y divide-border print:divide-gray-300">
          <thead className="bg-muted print:bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Date
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Folio #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Room
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Post Time
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Reference
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Gross
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Void
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Adjust
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Net
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Ledger
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-gray-700">
                Agent
              </th>
            </tr>
          </thead>
          {filteredDepts.map((dept, di) => {
            const isCollapsed = collapsedSections.has(dept.departmentCode);
            const dotColor = DEPT_COLORS[di % DEPT_COLORS.length];
            return (
              <tbody key={dept.departmentCode} className="print:break-inside-avoid">
                {/* Section header row (§175: clickable, chevron, colored dot, badge, subtotals) */}
                <tr
                  className="cursor-pointer select-none bg-muted/60 hover:bg-muted print:bg-gray-50"
                  onClick={() => toggleSection(dept.departmentCode)}
                >
                  <td colSpan={5} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground print:hidden" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground print:hidden" />
                      )}
                      <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                      <span className="text-sm font-semibold tracking-wide text-foreground">
                        {dept.departmentCode}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {dept.entryCount}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums font-medium text-foreground">
                    {formatCents(dept.totalGrossCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">
                    {formatCents(dept.totalVoidCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">
                    {formatCents(dept.totalAdjustCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums font-bold text-foreground">
                    {formatCents(dept.totalNetCents)}
                  </td>
                  <td colSpan={2} />
                </tr>
                {/* Detail rows (hidden when collapsed) */}
                {!isCollapsed &&
                  dept.entries.map((e) => (
                    <tr
                      key={e.entryId}
                      className="border-b border-border/50 hover:bg-accent/30"
                    >
                      <td className="whitespace-nowrap py-2 pl-10 pr-3 text-sm text-foreground print:pl-6">
                        {e.businessDate}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-sm tabular-nums text-foreground">
                        {e.folioNumber ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-sm text-foreground">
                        {e.roomNumber ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-foreground">
                        {new Date(e.postedAt).toLocaleString('en-US', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-foreground">
                        {e.description}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">
                        {formatCents(e.grossCents)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">
                        {formatCents(e.voidCents)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-foreground">
                        {formatCents(e.adjustCents)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums font-medium text-foreground">
                        {formatCents(e.netCents)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-foreground">
                        {e.ledger}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-foreground">
                        {e.postedBy ?? 'System'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            );
          })}
          {/* Grand total row (§175: double top border) */}
          <tfoot className="border-t-2 border-border bg-muted font-bold print:border-gray-400 print:bg-gray-100">
            <tr>
              <td colSpan={5} className="whitespace-nowrap px-3 py-3 text-sm text-foreground">
                Grand Totals
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.grandTotalGrossCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.grandTotalVoidCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.grandTotalAdjustCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-foreground">
                {formatCents(data.grandTotalNetCents)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile card layout (§175: md:hidden print:hidden) */}
      <div className="space-y-3 md:hidden print:hidden">
        {filteredDepts.map((dept, di) => {
          const isCollapsed = collapsedSections.has(dept.departmentCode);
          const dotColor = DEPT_COLORS[di % DEPT_COLORS.length];
          return (
            <div key={dept.departmentCode} className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => toggleSection(dept.departmentCode)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                <span className="flex-1 text-sm font-semibold text-foreground">
                  {dept.departmentCode}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {dept.entryCount}
                </span>
                <span className="ml-2 text-sm font-semibold tabular-nums text-foreground">
                  {formatCents(dept.totalNetCents)}
                </span>
              </button>
              {!isCollapsed && (
                <div className="border-t border-border/50 divide-y divide-border/30">
                  {dept.entries.map((e) => (
                    <div key={e.entryId} className="px-4 py-2">
                      <p className="text-sm font-medium text-foreground">{e.description}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{e.businessDate}</span>
                        <span>Folio {e.folioNumber ?? '—'}</span>
                        <span>Room {e.roomNumber ?? '—'}</span>
                        <span className="ml-auto tabular-nums font-medium text-foreground">
                          {formatCents(e.netCents)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* Mobile grand totals card */}
        <div className="rounded-lg border border-border bg-muted p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">Grand Total</span>
            <span className="text-sm font-bold tabular-nums text-foreground">
              {formatCents(data.grandTotalNetCents)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Occupancy Forecast Tab ──────────────────────────────────────

function OccupancyForecastTab({
  propertyId,
  startDate,
  endDate,
}: {
  propertyId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<OccupancyForecastDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, startDate, endDate });
        const res = await apiFetch<{ data: OccupancyForecastDay[] }>(
          `/api/v1/pms/reports/occupancy-forecast${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(res.data ?? []);
      } catch {
        if (!controller.signal.aborted) setData([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [propertyId, startDate, endDate]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <TabSkeleton rows={7} />
      </div>
    );
  }
  if (data.length === 0)
    return <EmptyState message="No forecast data for the selected date range." />;

  const avgOccupancy = data.length > 0
    ? Math.round(data.reduce((s, r) => s + r.occupancyPct, 0) / data.length * 10) / 10
    : 0;
  const peakDay = data.reduce((best, r) => (r.occupancyPct > best.occupancyPct ? r : best), data[0]!);
  const totalArrivals = data.reduce((s, r) => s + r.arrivals, 0);
  const totalDepartures = data.reduce((s, r) => s + r.departures, 0);

  return (
    <div className="space-y-4">
      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold print:text-gray-900">Occupancy Forecast</h1>
        <p className="text-sm print:text-gray-700">
          {startDate} to {endDate}
        </p>
        <p className="text-xs print:text-gray-500">
          Generated {new Date().toLocaleString()}
        </p>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
        <KpiCard
          label="Avg Occupancy"
          value={formatPct(avgOccupancy)}
          color={occupancyColor(avgOccupancy)}
          icon={BedDouble}
        />
        <KpiCard
          label="Peak Day"
          value={`${formatPct(peakDay.occupancyPct)} (${peakDay.date})`}
          color="bg-indigo-500/20 text-indigo-500"
          icon={TrendingUp}
        />
        <KpiCard
          label="Total Arrivals"
          value={totalArrivals}
          color="bg-blue-500/20 text-blue-500"
          icon={LogIn}
        />
        <KpiCard
          label="Total Departures"
          value={totalDepartures}
          color="bg-orange-500/20 text-orange-500"
          icon={LogOut}
        />
      </div>

      {/* Toolbar — print */}
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-lg font-semibold text-foreground">
          {data.length} day{data.length !== 1 ? 's' : ''} forecasted
        </h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block print:block print:border-gray-300">
        <table className="min-w-full divide-y divide-border print:divide-gray-300">
          <thead className="bg-muted print:bg-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Date
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Total Rooms
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Occupied
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Occupancy
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Arrivals
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Departures
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface print:divide-gray-200">
            {data.map((row) => (
              <tr key={row.date} className="hover:bg-accent/30">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  {row.date}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-foreground">
                  {row.totalRooms}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-foreground">
                  {row.occupiedRooms}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${occupancyColor(row.occupancyPct)}`}
                  >
                    {formatPct(row.occupancyPct)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-foreground">
                  {row.arrivals}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-foreground">
                  {row.departures}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 md:hidden print:hidden">
        {data.map((row) => (
          <div
            key={row.date}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{row.date}</span>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${occupancyColor(row.occupancyPct)}`}
              >
                {formatPct(row.occupancyPct)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="font-medium text-muted-foreground">Occupied</p>
                <p className="tabular-nums text-foreground">{row.occupiedRooms} / {row.totalRooms}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Arrivals</p>
                <p className="tabular-nums text-foreground">{row.arrivals}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Departures</p>
                <p className="tabular-nums text-foreground">{row.departures}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pickup Report Tab ──────────────────────────────────────────

function PickupTab({
  propertyId,
  startDate,
  endDate,
}: {
  propertyId: string;
  startDate: string;
  endDate: string;
}) {
  const [data, setData] = useState<PickupReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    (async () => {
      try {
        // snapshotDate = 7 days before startDate by default
        const snap = new Date(startDate);
        snap.setDate(snap.getDate() - 7);
        const snapshotDate = snap.toISOString().slice(0, 10);
        const qs = buildQueryString({ propertyId, snapshotDate, startDate, endDate });
        const res = await apiFetch<{ data: PickupReportRow[] }>(
          `/api/v1/pms/reports/pickup${qs}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setData(res.data ?? []);
      } catch {
        if (!controller.signal.aborted) setData([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [propertyId, startDate, endDate]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <TabSkeleton rows={7} />
      </div>
    );
  }
  if (data.length === 0)
    return <EmptyState message="No pickup data for the selected date range." />;

  const totalPickup = data.reduce((sum, r) => sum + r.roomsBookedSinceSnapshot, 0);
  const totalBooked = data.reduce((sum, r) => sum + r.totalRoomsBooked, 0);
  const avgPickupPerDay = data.length > 0
    ? Math.round((totalPickup / data.length) * 10) / 10
    : 0;
  const peakPickup = data.reduce((best, r) =>
    r.roomsBookedSinceSnapshot > best.roomsBookedSinceSnapshot ? r : best, data[0]!);

  return (
    <div className="space-y-4">
      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold print:text-gray-900">Pickup Report</h1>
        <p className="text-sm print:text-gray-700">
          {startDate} to {endDate} &mdash; Snapshot: 7 days prior
        </p>
        <p className="text-xs print:text-gray-500">
          Generated {new Date().toLocaleString()}
        </p>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
        <KpiCard
          label="Total Pickup"
          value={`${totalPickup} rooms`}
          color="bg-green-500/20 text-green-500"
          icon={TrendingUp}
        />
        <KpiCard
          label="Total Booked"
          value={`${totalBooked} room-nights`}
          color="bg-indigo-500/20 text-indigo-500"
          icon={BedDouble}
        />
        <KpiCard
          label="Avg Pickup / Day"
          value={avgPickupPerDay}
          color="bg-purple-500/20 text-purple-500"
          icon={CalendarDays}
        />
        <KpiCard
          label="Peak Pickup"
          value={`+${peakPickup.roomsBookedSinceSnapshot} (${peakPickup.targetDate})`}
          color="bg-emerald-500/20 text-emerald-500"
          icon={TrendingUp}
        />
      </div>

      {/* Toolbar — print */}
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-lg font-semibold text-foreground">
          {data.length} day{data.length !== 1 ? 's' : ''}
        </h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block print:block print:border-gray-300">
        <table className="min-w-full divide-y divide-border print:divide-gray-300">
          <thead className="bg-muted print:bg-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Date
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Total Booked
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-gray-700">
                Pickup (Last 7 Days)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface print:divide-gray-200">
            {data.map((row) => (
              <tr key={row.targetDate} className="hover:bg-accent/30">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">
                  {row.targetDate}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-foreground">
                  {row.totalRoomsBooked}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-foreground">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                      row.roomsBookedSinceSnapshot > 0
                        ? 'bg-green-500/20 text-green-500'
                        : 'bg-zinc-500/20 text-zinc-400'
                    }`}
                  >
                    +{row.roomsBookedSinceSnapshot}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 md:hidden print:hidden">
        {data.map((row) => (
          <div
            key={row.targetDate}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{row.targetDate}</span>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                  row.roomsBookedSinceSnapshot > 0
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-zinc-500/20 text-zinc-400'
                }`}
              >
                +{row.roomsBookedSinceSnapshot}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="font-medium text-muted-foreground">Total Booked</p>
                <p className="tabular-nums text-foreground">{row.totalRoomsBooked}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Pickup</p>
                <p className="tabular-nums text-foreground">+{row.roomsBookedSinceSnapshot}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────────

export default function ReportsContent() {
  const today = useMemo(() => todayISO(), []);

  // ── State ───────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  // ── Load properties on mount ────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>(
          '/api/v1/pms/properties',
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(items[0]!.id);
        }
      } catch {
        // silently handle
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  // ── Property dropdown options ───────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Refresh key to force tab remount ────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">PMS Reports</h1>
            <p className="text-sm text-muted-foreground">
              Property performance, revenue, operations, and housekeeping
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-3">
        {properties.length > 1 && (
          <div className="w-full sm:w-56">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Property
            </label>
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
            />
          </div>
        )}
        {activeTab !== 'overview' && activeTab !== 'activity' && (
          <>
            <div className="w-full sm:w-44">
              <label htmlFor="reports-start-date" className="mb-1 block text-xs font-medium text-muted-foreground">
                Start Date
              </label>
              <input
                id="reports-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="w-full sm:w-44">
              <label htmlFor="reports-end-date" className="mb-1 block text-xs font-medium text-muted-foreground">
                End Date
              </label>
              <input
                id="reports-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </>
        )}
        {(activeTab === 'overview' || activeTab === 'activity') && (
          <div className="w-full sm:w-44">
            <label htmlFor="reports-business-date" className="mb-1 block text-xs font-medium text-muted-foreground">
              Business Date
            </label>
            <input
              id="reports-business-date"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setEndDate(e.target.value);
              }}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-500'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {!selectedPropertyId ? (
        <EmptyState message="Select a property to view reports." />
      ) : (
        <>
          {activeTab === 'overview' && (
            <OverviewTab
              key={`overview-${refreshKey}`}
              propertyId={selectedPropertyId}
              businessDate={startDate}
            />
          )}
          {activeTab === 'activity' && (
            <ActivityByDayTab
              key={`activity-${refreshKey}`}
              propertyId={selectedPropertyId}
              businessDate={startDate}
            />
          )}
          {activeTab === 'dept-audit' && (
            <DepartmentAuditTab
              key={`dept-audit-${refreshKey}`}
              propertyId={selectedPropertyId}
              startDate={startDate}
              endDate={endDate}
            />
          )}
          {activeTab === 'revenue' && (
            <RevenueTab
              key={`revenue-${refreshKey}`}
              propertyId={selectedPropertyId}
              startDate={startDate}
              endDate={endDate}
            />
          )}
          {activeTab === 'operations' && (
            <OperationsTab
              key={`operations-${refreshKey}`}
              propertyId={selectedPropertyId}
              startDate={startDate}
              endDate={endDate}
            />
          )}
          {activeTab === 'housekeeping' && (
            <HousekeepingTab
              key={`housekeeping-${refreshKey}`}
              propertyId={selectedPropertyId}
              startDate={startDate}
              endDate={endDate}
            />
          )}
          {activeTab === 'forecast' && (
            <OccupancyForecastTab
              key={`forecast-${refreshKey}`}
              propertyId={selectedPropertyId}
              startDate={startDate}
              endDate={endDate}
            />
          )}
          {activeTab === 'pickup' && (
            <PickupTab
              key={`pickup-${refreshKey}`}
              propertyId={selectedPropertyId}
              startDate={startDate}
              endDate={endDate}
            />
          )}
        </>
      )}
    </div>
  );
}
