'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CalendarCheck,
  CalendarMinus,
  BedDouble,
  Percent,
  Plus,
  LogIn,
  LogOut,
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
}

interface OccupancyDay {
  businessDate: string;
  totalRooms: number;
  roomsOccupied: number;
  roomsAvailable: number;
  arrivals: number;
  departures: number;
  occupancyPct: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function guestName(g: { firstName: string; lastName: string } | null): string {
  if (!g) return '\u2014';
  return `${g.firstName} ${g.lastName}`;
}

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  HOLD: { label: 'Hold', variant: 'warning' },
  CONFIRMED: { label: 'Confirmed', variant: 'success' },
  CHECKED_IN: { label: 'Checked In', variant: 'info' },
  CHECKED_OUT: { label: 'Checked Out', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'error' },
  NO_SHOW: { label: 'No Show', variant: 'orange' },
};

// ── KPI Card ─────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-surface px-4 py-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-500">{label}</p>
          <p className="mt-0.5 text-xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Page Component ───────────────────────────────────────────────

type ActivityRow = Reservation & Record<string, unknown>;

export default function PmsContent() {
  const router = useRouter();
  const today = useMemo(() => todayISO(), []);

  // ── State ───────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [arrivals, setArrivals] = useState<Reservation[]>([]);
  const [occupiedReservations, setOccupiedReservations] = useState<Reservation[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyDay | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Load properties ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: Property[] }>('/api/v1/pms/properties');
        if (cancelled) return;
        const items = res.data ?? [];
        setProperties(items);
        if (items.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(items[0]!.id);
        }
      } catch {
        // silently handle — properties will be empty
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load dashboard data when property selected ──────────────────
  useEffect(() => {
    if (!selectedPropertyId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const [arrivalsRes, occupiedRes, occupancyRes] = await Promise.all([
          apiFetch<{ data: Reservation[] }>(
            `/api/v1/pms/reservations${buildQueryString({
              propertyId: selectedPropertyId,
              status: 'CONFIRMED',
              startDate: today,
              endDate: today,
            })}`,
          ),
          apiFetch<{ data: Reservation[] }>(
            `/api/v1/pms/reservations${buildQueryString({
              propertyId: selectedPropertyId,
              status: 'CHECKED_IN',
            })}`,
          ),
          apiFetch<{ data: OccupancyDay[] }>(
            `/api/v1/pms/occupancy${buildQueryString({
              propertyId: selectedPropertyId,
              startDate: today,
              endDate: today,
            })}`,
          ),
        ]);

        if (cancelled) return;
        setArrivals(arrivalsRes.data ?? []);
        setOccupiedReservations(occupiedRes.data ?? []);
        const days = occupancyRes.data ?? [];
        setOccupancy(days.length > 0 ? days[0]! : null);
      } catch {
        // silently handle
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedPropertyId, today]);

  // ── Derived KPIs ────────────────────────────────────────────────
  const todayArrivals = arrivals.length;
  const todayDepartures = occupancy?.departures ?? 0;
  const roomsOccupied = occupancy?.roomsOccupied ?? occupiedReservations.length;
  const occupancyRate = occupancy ? `${Math.round(occupancy.occupancyPct)}%` : '\u2014';

  // ── Activity table: combine arrivals + checked-in for today's view
  const activityItems = useMemo(() => {
    const combined = [...arrivals, ...occupiedReservations];
    // Deduplicate by id
    const seen = new Set<string>();
    return combined.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, [arrivals, occupiedReservations]);

  // ── Property dropdown options ───────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Activity table columns ──────────────────────────────────────
  const activityColumns = useMemo(
    () => [
      {
        key: 'guest',
        header: 'Guest',
        render: (row: ActivityRow) =>
          guestName(row.primaryGuestJson as Reservation['primaryGuestJson']),
      },
      {
        key: 'roomTypeName',
        header: 'Room Type',
        render: (row: ActivityRow) => (row as Reservation).roomTypeName ?? '\u2014',
      },
      {
        key: 'roomNumber',
        header: 'Room #',
        width: '90px',
        render: (row: ActivityRow) => (row as Reservation).roomNumber ?? '\u2014',
      },
      {
        key: 'checkInDate',
        header: 'Check-In',
        width: '110px',
        render: (row: ActivityRow) => (row as Reservation).checkInDate,
      },
      {
        key: 'checkOutDate',
        header: 'Check-Out',
        width: '110px',
        render: (row: ActivityRow) => (row as Reservation).checkOutDate,
      },
      {
        key: 'status',
        header: 'Status',
        width: '120px',
        render: (row: ActivityRow) => {
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

  const handleRowClick = useCallback(
    (row: ActivityRow) => router.push(`/pms/reservations/${row.id}`),
    [router],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Property Management</h1>
            <p className="text-sm text-gray-500">Today&apos;s overview and activity</p>
          </div>
        </div>

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={CalendarCheck}
          label="Today's Arrivals"
          value={isLoading ? '\u2014' : todayArrivals}
          color="bg-green-100 text-green-600"
        />
        <KpiCard
          icon={CalendarMinus}
          label="Today's Departures"
          value={isLoading ? '\u2014' : todayDepartures}
          color="bg-amber-100 text-amber-600"
        />
        <KpiCard
          icon={BedDouble}
          label="Rooms Occupied"
          value={isLoading ? '\u2014' : roomsOccupied}
          color="bg-blue-100 text-blue-600"
        />
        <KpiCard
          icon={Percent}
          label="Occupancy Rate"
          value={isLoading ? '\u2014' : occupancyRate}
          color="bg-purple-100 text-purple-600"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => router.push('/pms/reservations?action=new')}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New Reservation
        </button>
        <button
          type="button"
          onClick={() => router.push('/pms/reservations?status=CONFIRMED')}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <LogIn className="h-4 w-4" />
          Check In
        </button>
        <button
          type="button"
          onClick={() => router.push('/pms/reservations?status=CHECKED_IN')}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4" />
          Check Out
        </button>
      </div>

      {/* Today's Activity Table */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Today&apos;s Activity</h2>
        <DataTable
          columns={activityColumns}
          data={activityItems as ActivityRow[]}
          isLoading={isLoading}
          emptyMessage="No arrivals or check-ins for today"
          onRowClick={handleRowClick}
        />
      </div>
    </div>
  );
}
