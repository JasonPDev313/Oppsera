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

// ── Tab definition ──────────────────────────────────────────────

type TabId = 'overview' | 'revenue' | 'operations' | 'housekeeping';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'operations', label: 'Operations', icon: Users },
  { id: 'housekeeping', label: 'Housekeeping', icon: Brush },
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
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, businessDate });
        const res = await apiFetch<{ data: ManagerFlash }>(
          `/api/v1/pms/reports/manager-flash${qs}`,
        );
        if (!cancelled) setData(res.data ?? null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, startDate, endDate });
        const res = await apiFetch<{ data: RevenueByRoomType[] }>(
          `/api/v1/pms/reports/revenue-by-room-type${qs}`,
        );
        if (!cancelled) setData(res.data ?? []);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, startDate, endDate });
        const res = await apiFetch<{ data: NoShowRecord[] }>(
          `/api/v1/pms/reports/no-show${qs}`,
        );
        if (!cancelled) setData(res.data ?? []);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId, startDate, endDate });
        const res = await apiFetch<{ data: HousekeepingProductivity[] }>(
          `/api/v1/pms/reports/housekeeping-productivity${qs}`,
        );
        if (!cancelled) setData(res.data ?? []);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>(
          '/api/v1/pms/properties',
        );
        if (cancelled) return;
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
      cancelled = true;
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
        {activeTab !== 'overview' && (
          <>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </>
        )}
        {activeTab === 'overview' && (
          <div className="w-full sm:w-44">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Business Date
            </label>
            <input
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
        </>
      )}
    </div>
  );
}
