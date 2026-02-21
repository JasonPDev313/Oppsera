'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';

// ── Types ────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
}

interface Reservation {
  id: string;
  primaryGuestJson: { firstName: string; lastName: string } | null;
  roomTypeId: string;
  roomTypeName: string | null;
  roomId: string | null;
  roomNumber: string | null;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  nightlyRateCents: number;
  totalCents: number;
  status: string;
  adults: number;
  children: number;
  sourceType: string | null;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'HOLD', label: 'Hold' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'CHECKED_IN', label: 'Checked In' },
  { value: 'CHECKED_OUT', label: 'Checked Out' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No Show' },
];

const STATUS_BADGES: Record<string, { label: string; variant: string }> = {
  HOLD: { label: 'Hold', variant: 'warning' },
  CONFIRMED: { label: 'Confirmed', variant: 'success' },
  CHECKED_IN: { label: 'Checked In', variant: 'info' },
  CHECKED_OUT: { label: 'Checked Out', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'error' },
  NO_SHOW: { label: 'No Show', variant: 'orange' },
};

// ── Helpers ──────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function guestName(g: { firstName: string; lastName: string } | null): string {
  if (!g) return '\u2014';
  return `${g.firstName} ${g.lastName}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}

// ── Page Component ───────────────────────────────────────────────

type ReservationRow = Reservation & Record<string, unknown>;

export default function ReservationsContent() {
  const router = useRouter();

  // ── State ────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
        // silently handle
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load reservations ───────────────────────────────────────────
  const fetchReservations = useCallback(
    async (cursorVal?: string) => {
      if (!selectedPropertyId) return;
      const isAppend = !!cursorVal;
      if (isAppend) setIsLoadingMore(true);
      else setIsLoading(true);

      try {
        const qs = buildQueryString({
          propertyId: selectedPropertyId,
          status: statusFilter || undefined,
          startDate: dateFrom || undefined,
          endDate: dateTo || undefined,
          cursor: cursorVal || undefined,
          limit: 50,
        });
        const res = await apiFetch<{
          data: Reservation[];
          meta: { cursor: string | null; hasMore: boolean };
        }>(`/api/v1/pms/reservations${qs}`);

        const items = res.data ?? [];
        const meta = res.meta ?? { cursor: null, hasMore: false };

        if (isAppend) {
          setReservations((prev) => [...prev, ...items]);
        } else {
          setReservations(items);
        }
        setCursor(meta.cursor);
        setHasMore(meta.hasMore);
      } catch {
        // silently handle
      } finally {
        if (isAppend) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    },
    [selectedPropertyId, statusFilter, dateFrom, dateTo],
  );

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const handleLoadMore = useCallback(() => {
    if (cursor && !isLoadingMore) {
      fetchReservations(cursor);
    }
  }, [cursor, isLoadingMore, fetchReservations]);

  // ── Filter state ────────────────────────────────────────────────
  const hasFilters = !!search || !!statusFilter || !!dateFrom || !!dateTo;

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
  }, []);

  // Client-side search filter (guest name) — API doesn't support text search
  const filteredReservations = useMemo(() => {
    if (!search) return reservations;
    const q = search.toLowerCase();
    return reservations.filter((r) => {
      const name = guestName(r.primaryGuestJson).toLowerCase();
      const roomNum = (r.roomNumber ?? '').toLowerCase();
      const idShort = shortId(r.id).toLowerCase();
      return name.includes(q) || roomNum.includes(q) || idShort.includes(q);
    });
  }, [reservations, search]);

  // ── Property dropdown options ───────────────────────────────────
  const propertyOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Table columns ───────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'confirmation',
        header: 'Confirmation #',
        width: '130px',
        render: (row: ReservationRow) => (
          <span className="font-mono text-xs font-semibold text-gray-900">
            {shortId(row.id as string)}
          </span>
        ),
      },
      {
        key: 'guest',
        header: 'Guest Name',
        render: (row: ReservationRow) => (
          <span className="text-sm text-gray-900">
            {guestName((row as Reservation).primaryGuestJson)}
          </span>
        ),
      },
      {
        key: 'roomTypeName',
        header: 'Room Type',
        render: (row: ReservationRow) => (
          <span className="text-sm text-gray-700">
            {(row as Reservation).roomTypeName ?? '\u2014'}
          </span>
        ),
      },
      {
        key: 'roomNumber',
        header: 'Room #',
        width: '80px',
        render: (row: ReservationRow) => (
          <span className="text-sm text-gray-700">
            {(row as Reservation).roomNumber ?? '\u2014'}
          </span>
        ),
      },
      {
        key: 'checkInDate',
        header: 'Check-In',
        width: '110px',
        render: (row: ReservationRow) => (
          <span className="text-sm text-gray-700">{(row as Reservation).checkInDate}</span>
        ),
      },
      {
        key: 'checkOutDate',
        header: 'Check-Out',
        width: '110px',
        render: (row: ReservationRow) => (
          <span className="text-sm text-gray-700">{(row as Reservation).checkOutDate}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '120px',
        render: (row: ReservationRow) => {
          const s = (row as Reservation).status;
          const badge = STATUS_BADGES[s] ?? { label: s, variant: 'neutral' };
          return <Badge variant={badge.variant}>{badge.label}</Badge>;
        },
      },
      {
        key: 'nightlyRate',
        header: 'Nightly Rate',
        width: '110px',
        render: (row: ReservationRow) => (
          <span className="text-sm text-gray-700">
            {formatMoney((row as Reservation).nightlyRateCents)}
          </span>
        ),
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (row: ReservationRow) => router.push(`/pms/reservations/${row.id}`),
    [router],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <CalendarRange className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reservations</h1>
        </div>
        <div className="flex items-center gap-3">
          {properties.length > 1 && (
            <Select
              options={propertyOptions}
              value={selectedPropertyId}
              onChange={(v) => setSelectedPropertyId(v as string)}
              placeholder="Select property"
              className="w-full sm:w-48"
            />
          )}
          <button
            type="button"
            onClick={() => router.push('/pms/reservations?action=new')}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Reservation
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search guest, room, confirmation #..."
          className="w-full md:w-64"
        />
        <Select
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          placeholder="All Statuses"
          className="w-full md:w-44"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            placeholder="From"
          />
          <span className="text-gray-400">&ndash;</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            placeholder="To"
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {!isLoading && filteredReservations.length === 0 && !hasFilters ? (
        <EmptyState
          icon={CalendarRange}
          title="No reservations yet"
          description="Reservations will appear here once they are created"
          action={{
            label: 'New Reservation',
            onClick: () => router.push('/pms/reservations?action=new'),
          }}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={filteredReservations as ReservationRow[]}
            isLoading={isLoading}
            emptyMessage="No reservations match your filters"
            onRowClick={handleRowClick}
          />
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
