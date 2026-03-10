'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CalendarCheck,
  CalendarMinus,
  Moon,
  Percent,
  DollarSign,
  Plus,
  LogIn,
  LogOut,
  Users,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface Reservation {
  id: string;
  primaryGuestJson: { firstName: string; lastName: string } | null;
  roomTypeName: string | null;
  roomNumber: string | null;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  nightlyRateCents: number;
  totalCents: number;
  sourceType: string | null;
}

interface FlashReport {
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

interface HousekeepingRoom {
  roomId: string;
  roomNumber: string;
  status: string;
  isOutOfOrder: boolean;
  departingToday: boolean;
  arrivingToday: boolean;
  currentGuest: { name: string; checkOutDate: string } | null;
}

// ── Helpers ──────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function guestName(g: { firstName: string; lastName: string } | null): string {
  if (!g) return '\u2014';
  return `${g.lastName}, ${g.firstName}`;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Count reservations by sourceType, returning "X Transient · Y Group" or similar */
function sourceBreakdown(items: Reservation[]): string {
  if (items.length === 0) return '';
  const counts: Record<string, number> = {};
  for (const r of items) {
    const key = r.sourceType ?? 'DIRECT';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const parts: string[] = [];
  if (counts['DIRECT']) parts.push(`${counts['DIRECT']} Transient`);
  if (counts['GROUP']) parts.push(`${counts['GROUP']} Group`);
  if (counts['CHANNEL']) parts.push(`${counts['CHANNEL']} Channel`);
  // Catch any other source types
  for (const [key, val] of Object.entries(counts)) {
    if (key !== 'DIRECT' && key !== 'GROUP' && key !== 'CHANNEL') {
      parts.push(`${val} ${key.charAt(0) + key.slice(1).toLowerCase()}`);
    }
  }
  return parts.join(' \u00b7 ');
}

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  HOLD: { label: 'Hold', variant: 'warning' },
  CONFIRMED: { label: 'Confirmed', variant: 'success' },
  CHECKED_IN: { label: 'Checked In', variant: 'info' },
  CHECKED_OUT: { label: 'Checked Out', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'error' },
  NO_SHOW: { label: 'No Show', variant: 'orange' },
};

const REFRESH_INTERVAL_MS = 60_000;

// ── KPI Card ─────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  details,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  details?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold text-foreground">{value}</p>
          {details && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{details}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Horizontal Bar Chart ─────────────────────────────────────────

interface BarSegment {
  label: string;
  value: number;
  color: string;
}

function HorizontalBar({
  title,
  segments,
  total,
}: {
  title: string;
  segments: BarSegment[];
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>

      {/* Bar */}
      <div className="mb-3 flex h-7 w-full overflow-hidden rounded-md">
        {segments.map((seg) => {
          const pct = (seg.value / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg.label}
              className={`${seg.color} flex items-center justify-center text-xs font-medium text-white transition-all`}
              style={{ width: `${pct}%`, minWidth: pct > 0 ? '2px' : undefined }}
              title={`${seg.label}: ${seg.value}`}
            >
              {pct >= 8 ? seg.value : ''}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${seg.color}`} />
            {seg.label} ({seg.value})
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page Component ───────────────────────────────────────────────

type ReservationRow = Reservation & Record<string, unknown>;

export default function PmsContent() {
  const router = useRouter();
  const today = useMemo(() => todayISO(), []);

  // ── State ───────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [businessDate, setBusinessDate] = useState(today);
  const [flash, setFlash] = useState<FlashReport | null>(null);
  const [arrivals, setArrivals] = useState<Reservation[]>([]);
  const [departures, setDepartures] = useState<Reservation[]>([]);
  const [stayovers, setStayovers] = useState<Reservation[]>([]);
  const [hkRooms, setHkRooms] = useState<HousekeepingRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stayoversOpen, setStayoversOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isToday = businessDate === today;

  // ── Load properties ─────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>('/api/v1/pms/properties', { signal: controller.signal });
        if (controller.signal.aborted) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(items[0]!.id);
        }
      } catch {
        // silently handle — properties will be empty
      }
    })();
    return () => { controller.abort(); };
  }, []);

  // ── Auto-refresh every 60s (client-side only) ──────────────────
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // ── Load dashboard data ────────────────────────────────────────
  useEffect(() => {
    if (!selectedPropertyId) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);

    (async () => {
      try {
        const [flashRes, frontDeskRes, hkRes] = await Promise.all([
          apiFetch<{ data: FlashReport }>(
            `/api/v1/pms/reports/manager-flash${buildQueryString({
              propertyId: selectedPropertyId,
              businessDate,
            })}`,
            { signal: controller.signal },
          ),
          apiFetch<{ data: { arrivals: Reservation[]; inHouse: Reservation[] } }>(
            `/api/v1/pms/front-desk${buildQueryString({
              propertyId: selectedPropertyId,
            })}`,
            { signal: controller.signal },
          ),
          apiFetch<{ data: HousekeepingRoom[] }>(
            `/api/v1/pms/housekeeping/rooms${buildQueryString({
              propertyId: selectedPropertyId,
              date: businessDate,
            })}`,
            { signal: controller.signal },
          ),
        ]);

        if (controller.signal.aborted) return;

        setFlash(flashRes.data ?? null);

        const allArrivals = frontDeskRes.data?.arrivals ?? [];
        setArrivals(allArrivals.filter((r) => r.checkInDate === businessDate));

        const allInHouse = frontDeskRes.data?.inHouse ?? [];
        setDepartures(allInHouse.filter((r) => r.checkOutDate === businessDate));
        setStayovers(allInHouse.filter((r) => r.checkOutDate > businessDate));

        setHkRooms(hkRes.data ?? []);
      } catch {
        // silently handle
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => { controller.abort(); };
  }, [selectedPropertyId, businessDate, refreshKey]);

  // ── Derived KPIs ────────────────────────────────────────────────
  const arrivalBreakdown = useMemo(() => sourceBreakdown(arrivals), [arrivals]);
  const departureBreakdown = useMemo(() => sourceBreakdown(departures), [departures]);
  const stayoverBreakdown = useMemo(() => sourceBreakdown(stayovers), [stayovers]);

  const occupancyDetails = flash
    ? `${flash.roomsOccupied} / ${flash.totalRooms} rooms${flash.oooRooms > 0 ? ` \u00b7 ${flash.oooRooms} OOO` : ''}`
    : undefined;

  const rateDetails = flash
    ? `RevPAR ${formatDollars(flash.revParCents)} \u00b7 Rev ${formatDollars(flash.roomRevenueCents)}`
    : undefined;

  // ── Occupancy chart segments ───────────────────────────────────
  const occupancySegments = useMemo((): BarSegment[] => {
    if (!flash) return [];
    const available = flash.totalRooms - flash.roomsOccupied - flash.oooRooms;
    return [
      { label: 'Occupied', value: flash.roomsOccupied, color: 'bg-blue-500' },
      { label: 'Available', value: Math.max(0, available), color: 'bg-emerald-500' },
      { label: 'Out of Order', value: flash.oooRooms, color: 'bg-red-500' },
    ];
  }, [flash]);

  // ── Housekeeping chart segments ────────────────────────────────
  const hkSegments = useMemo((): BarSegment[] => {
    if (hkRooms.length === 0) return [];
    let clean = 0;
    let dirty = 0;
    let cleaning = 0;
    let inspected = 0;
    let ooo = 0;
    let occupied = 0;

    for (const room of hkRooms) {
      if (room.isOutOfOrder) { ooo++; continue; }
      switch (room.status) {
        case 'clean': clean++; break;
        case 'dirty': dirty++; break;
        case 'cleaning': cleaning++; break;
        case 'inspected': inspected++; break;
        case 'occupied': occupied++; break;
        default: dirty++; break;
      }
    }

    return [
      { label: 'Clean', value: clean, color: 'bg-emerald-500' },
      { label: 'Inspected', value: inspected, color: 'bg-teal-500' },
      { label: 'Occupied', value: occupied, color: 'bg-blue-500' },
      { label: 'Dirty', value: dirty, color: 'bg-amber-500' },
      { label: 'Cleaning', value: cleaning, color: 'bg-violet-500' },
      { label: 'Out of Order', value: ooo, color: 'bg-red-500' },
    ];
  }, [hkRooms]);

  // ── Property dropdown options ───────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Arrivals table columns ────────────────────────────────────
  const arrivalColumns = useMemo(
    () => [
      {
        key: 'guest',
        header: 'Guest',
        render: (row: ReservationRow) =>
          guestName(row.primaryGuestJson as Reservation['primaryGuestJson']),
      },
      {
        key: 'roomTypeName',
        header: 'Room Type',
        render: (row: ReservationRow) => (row as Reservation).roomTypeName ?? '\u2014',
      },
      {
        key: 'roomNumber',
        header: 'Room #',
        width: '80px',
        render: (row: ReservationRow) => (row as Reservation).roomNumber ?? '\u2014',
      },
      {
        key: 'status',
        header: 'Status',
        width: '110px',
        render: (row: ReservationRow) => {
          const badge = STATUS_BADGES[(row as Reservation).status] ?? {
            label: (row as Reservation).status,
            variant: 'neutral',
          };
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
      },
    ],
    [],
  );

  // ── Departures table columns (with folio balance coloring) ─────
  const departureColumns = useMemo(
    () => [
      {
        key: 'guest',
        header: 'Guest',
        render: (row: ReservationRow) =>
          guestName(row.primaryGuestJson as Reservation['primaryGuestJson']),
      },
      {
        key: 'roomNumber',
        header: 'Room #',
        width: '80px',
        render: (row: ReservationRow) => (row as Reservation).roomNumber ?? '\u2014',
      },
      {
        key: 'totalCents',
        header: 'Folio Balance',
        width: '120px',
        render: (row: ReservationRow) => {
          const cents = (row as Reservation).totalCents;
          const colorClass = cents > 0
            ? 'text-red-400'
            : cents < 0
              ? 'text-emerald-400'
              : 'text-foreground';
          return <span className={colorClass}>{formatDollars(cents)}</span>;
        },
      },
      {
        key: 'status',
        header: 'Status',
        width: '110px',
        render: (row: ReservationRow) => {
          const badge = STATUS_BADGES[(row as Reservation).status] ?? {
            label: (row as Reservation).status,
            variant: 'neutral',
          };
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
      },
    ],
    [],
  );

  // ── Stayovers table columns ────────────────────────────────────
  const stayoverColumns = useMemo(
    () => [
      {
        key: 'guest',
        header: 'Guest',
        render: (row: ReservationRow) =>
          guestName(row.primaryGuestJson as Reservation['primaryGuestJson']),
      },
      {
        key: 'roomNumber',
        header: 'Room #',
        width: '80px',
        render: (row: ReservationRow) => (row as Reservation).roomNumber ?? '\u2014',
      },
      {
        key: 'roomTypeName',
        header: 'Room Type',
        render: (row: ReservationRow) => (row as Reservation).roomTypeName ?? '\u2014',
      },
      {
        key: 'checkOutDate',
        header: 'Check-Out',
        width: '110px',
        render: (row: ReservationRow) => (row as Reservation).checkOutDate,
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (row: ReservationRow) => router.push(`/pms/reservations/${row.id}`),
    [router],
  );

  const handleManualRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Front Desk Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {isToday ? 'Today' : businessDate}&apos;s overview and activity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Business Date Picker */}
          <div className="flex items-center gap-2">
            <label htmlFor="business-date" className="text-sm font-medium text-muted-foreground">
              Business Date
            </label>
            <input
              id="business-date"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value || today)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {!isToday && (
              <button
                type="button"
                onClick={() => setBusinessDate(today)}
                className="rounded-md px-2 py-1 text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Today
              </button>
            )}
          </div>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={handleManualRefresh}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Refresh (auto-refreshes every 60s)"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Property Selector */}
          {properties.length > 1 && (
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
              className="w-full sm:w-56"
            />
          )}
        </div>
      </div>

      {/* KPI Cards — 5 across */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          icon={CalendarCheck}
          label="Arrivals"
          value={isLoading ? '\u2014' : (flash?.arrivals ?? arrivals.length)}
          color="bg-green-500/20 text-green-500"
          details={!isLoading ? (arrivalBreakdown || 'to check in today') : undefined}
        />
        <KpiCard
          icon={CalendarMinus}
          label="Departures"
          value={isLoading ? '\u2014' : (flash?.departures ?? departures.length)}
          color="bg-amber-500/20 text-amber-500"
          details={!isLoading ? (departureBreakdown || 'to check out today') : undefined}
        />
        <KpiCard
          icon={Moon}
          label="Stayovers"
          value={isLoading ? '\u2014' : (flash?.stayovers ?? stayovers.length)}
          color="bg-blue-500/20 text-blue-500"
          details={!isLoading ? (stayoverBreakdown || 'continuing guests') : undefined}
        />
        <KpiCard
          icon={Percent}
          label="Occupancy"
          value={isLoading ? '\u2014' : `${Math.round(flash?.occupancyPct ?? 0)}%`}
          color="bg-purple-500/20 text-purple-500"
          details={!isLoading ? occupancyDetails : undefined}
        />
        <KpiCard
          icon={DollarSign}
          label="Tonight's Rate"
          value={isLoading ? '\u2014' : formatDollars(flash?.adrCents ?? 0)}
          color="bg-teal-500/20 text-teal-500"
          details={!isLoading ? rateDetails : undefined}
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => router.push('/pms/reservations?action=new')}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Reservation
        </button>
        <button
          type="button"
          onClick={() => router.push('/pms/front-desk')}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <LogIn className="h-4 w-4" />
          Check In
        </button>
        <button
          type="button"
          onClick={() => router.push('/pms/reservations?status=CHECKED_IN')}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <LogOut className="h-4 w-4" />
          Check Out
        </button>
        <button
          type="button"
          onClick={() => router.push('/pms/reservations?status=CHECKED_IN')}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Users className="h-4 w-4" />
          In-House Guest List
        </button>
        <button
          type="button"
          onClick={() => router.push('/pms/housekeeping')}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <ClipboardList className="h-4 w-4" />
          Room Status Report
        </button>
      </div>

      {/* Arrivals & Departures — side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Arrivals
            {!isLoading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({arrivals.length})
              </span>
            )}
          </h2>
          <DataTable
            columns={arrivalColumns}
            data={arrivals as ReservationRow[]}
            isLoading={isLoading}
            emptyMessage="No arrivals for this date"
            onRowClick={handleRowClick}
          />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Departures
            {!isLoading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({departures.length})
              </span>
            )}
          </h2>
          <DataTable
            columns={departureColumns}
            data={departures as ReservationRow[]}
            isLoading={isLoading}
            emptyMessage="No departures for this date"
            onRowClick={handleRowClick}
          />
        </div>
      </div>

      {/* Stayovers — collapsible */}
      {!isLoading && stayovers.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setStayoversOpen((o) => !o)}
            className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground transition-colors hover:text-muted-foreground"
          >
            Stayovers
            <span className="text-sm font-normal text-muted-foreground">
              ({stayovers.length})
            </span>
            {stayoversOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {stayoversOpen && (
            <DataTable
              columns={stayoverColumns}
              data={stayovers as ReservationRow[]}
              isLoading={false}
              emptyMessage="No stayovers"
              onRowClick={handleRowClick}
            />
          )}
        </div>
      )}

      {/* Occupancy & Housekeeping Charts — side by side */}
      {!isLoading && (
        <div className="grid gap-6 lg:grid-cols-2">
          <HorizontalBar
            title={`Occupancy \u2014 ${businessDate}`}
            segments={occupancySegments}
            total={flash?.totalRooms ?? 0}
          />
          <HorizontalBar
            title={`Housekeeping \u2014 ${businessDate}`}
            segments={hkSegments}
            total={hkRooms.length}
          />
        </div>
      )}
    </div>
  );
}
