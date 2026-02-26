'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, Plus, X, Loader2, Search, UserPlus, UserCheck } from 'lucide-react';
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

interface RoomType {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  maxOccupancy: number;
}

interface RatePlan {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  isDefault: boolean;
}

interface Room {
  id: string;
  roomNumber: string;
  floor: string | null;
  status: string;
  isOutOfOrder: boolean;
  roomTypeId: string;
}

interface CustomerResult {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  type: string;
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

const SOURCE_TYPE_OPTIONS = [
  { value: 'DIRECT', label: 'Direct' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'WALKIN', label: 'Walk-In' },
  { value: 'BOOKING_ENGINE', label: 'Booking Engine' },
  { value: 'OTA', label: 'OTA' },
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
  const searchParams = useSearchParams();

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

  // Create reservation dialog
  const isDialogOpen = searchParams.get('action') === 'new';
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [ratePlans, setRatePlans] = useState<RatePlan[]>([]);
  const [dialogDataLoading, setDialogDataLoading] = useState(false);

  // Rooms for selected room type
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [formRoomId, setFormRoomId] = useState('');

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [formGuestId, setFormGuestId] = useState<string | null>(null);
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guest fields
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCheckIn, setFormCheckIn] = useState('');
  const [formCheckOut, setFormCheckOut] = useState('');
  const [formRoomTypeId, setFormRoomTypeId] = useState('');
  const [formRatePlanId, setFormRatePlanId] = useState('');
  const [formNightlyRate, setFormNightlyRate] = useState('');
  const [formAdults, setFormAdults] = useState(1);
  const [formChildren, setFormChildren] = useState(0);
  const [formSourceType, setFormSourceType] = useState('DIRECT');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // ── Load room types + rate plans when dialog opens ─────────────
  useEffect(() => {
    if (!isDialogOpen || !selectedPropertyId) return;
    let cancelled = false;
    setDialogDataLoading(true);
    (async () => {
      try {
        const rtQs = buildQueryString({ propertyId: selectedPropertyId, limit: 100 });
        const rpQs = buildQueryString({ propertyId: selectedPropertyId, limit: 100 });
        const [rtRes, rpRes] = await Promise.all([
          apiFetch<{ data: RoomType[] }>(`/api/v1/pms/room-types${rtQs}`),
          apiFetch<{ data: RatePlan[] }>(`/api/v1/pms/rate-plans${rpQs}`),
        ]);
        if (cancelled) return;
        setRoomTypes(rtRes.data ?? []);
        const plans = rpRes.data ?? [];
        setRatePlans(plans);
        // Auto-select default rate plan
        const defaultPlan = plans.find((p) => p.isDefault);
        if (defaultPlan) setFormRatePlanId(defaultPlan.id);
      } catch (err) {
        console.error('[PMS Reservations] Failed to load dialog data:', err);
      } finally {
        if (!cancelled) setDialogDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isDialogOpen, selectedPropertyId]);

  // Rate plan base rate tracking
  const [ratePlanBaseRate, setRatePlanBaseRate] = useState<number | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isDialogOpen) {
      setCustomerSearch('');
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      setSelectedCustomer(null);
      setFormGuestId(null);
      setFormFirstName('');
      setFormLastName('');
      setFormEmail('');
      setFormPhone('');
      setFormCheckIn('');
      setFormCheckOut('');
      setFormRoomTypeId('');
      setFormRoomId('');
      setRooms([]);
      setFormRatePlanId('');
      setFormNightlyRate('');
      setFormAdults(1);
      setFormChildren(0);
      setFormSourceType('DIRECT');
      setFormNotes('');
      setFormError(null);
      setRatePlanBaseRate(null);
    }
  }, [isDialogOpen]);

  // Load available rooms when room type changes
  useEffect(() => {
    if (!formRoomTypeId || !selectedPropertyId) {
      setRooms([]);
      setFormRoomId('');
      return;
    }
    let cancelled = false;
    setRoomsLoading(true);
    (async () => {
      try {
        const qs = buildQueryString({ propertyId: selectedPropertyId, roomTypeId: formRoomTypeId, limit: 100 });
        const res = await apiFetch<{ data: Room[] }>(`/api/v1/pms/rooms${qs}`);
        if (cancelled) return;
        // Filter to available rooms (not out of order)
        const available = (res.data ?? []).filter((r) => !r.isOutOfOrder);
        setRooms(available);
        setFormRoomId(''); // Reset room selection when type changes
      } catch {
        setRooms([]);
      } finally {
        if (!cancelled) setRoomsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [formRoomTypeId, selectedPropertyId]);

  // Auto-populate nightly rate from rate plan when rate plan + room type + check-in date change
  useEffect(() => {
    if (!formRatePlanId || !formRoomTypeId || !formCheckIn) {
      setRatePlanBaseRate(null);
      return;
    }
    let cancelled = false;
    setIsLoadingRate(true);
    (async () => {
      try {
        const qs = buildQueryString({ ratePlanId: formRatePlanId, roomTypeId: formRoomTypeId, date: formCheckIn });
        const res = await apiFetch<{ data: { nightlyBaseCents: number } | null }>(`/api/v1/pms/rate-plans/nightly-rate${qs}`);
        if (cancelled) return;
        if (res.data) {
          const dollars = (res.data.nightlyBaseCents / 100).toFixed(2);
          setRatePlanBaseRate(res.data.nightlyBaseCents);
          // Only auto-fill if user hasn't manually entered a rate
          if (!formNightlyRate) {
            setFormNightlyRate(dollars);
          }
        } else {
          setRatePlanBaseRate(null);
        }
      } catch {
        setRatePlanBaseRate(null);
      } finally {
        if (!cancelled) setIsLoadingRate(false);
      }
    })();
    return () => { cancelled = true; };
  }, [formRatePlanId, formRoomTypeId, formCheckIn]);

  // Customer search with debounce
  useEffect(() => {
    if (!customerSearch || customerSearch.length < 2) {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const qs = buildQueryString({ search: customerSearch, limit: 8 });
        const res = await apiFetch<{ data: CustomerResult[] }>(`/api/v1/customers/search${qs}`);
        setCustomerResults(res.data ?? []);
        setShowCustomerDropdown(true);
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerSearchLoading(false);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [customerSearch]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCustomer = useCallback((customer: CustomerResult) => {
    setSelectedCustomer(customer);
    setFormGuestId(customer.id);
    // Parse displayName into first/last
    const parts = customer.displayName.trim().split(/\s+/);
    setFormFirstName(parts[0] ?? '');
    setFormLastName(parts.slice(1).join(' ') || '');
    setFormEmail(customer.email ?? '');
    setFormPhone(customer.phone ?? '');
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  }, []);

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setFormGuestId(null);
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormPhone('');
    setCustomerSearch('');
  }, []);

  const closeDialog = useCallback(() => {
    router.push('/pms/reservations', { scroll: false });
  }, [router]);

  // Compute nights for display
  const computedNights = useMemo(() => {
    if (!formCheckIn || !formCheckOut) return 0;
    const diff = new Date(formCheckOut).getTime() - new Date(formCheckIn).getTime();
    return diff > 0 ? Math.round(diff / (1000 * 60 * 60 * 24)) : 0;
  }, [formCheckIn, formCheckOut]);

  const handleCreateReservation = useCallback(async () => {
    setFormError(null);
    if (!formFirstName.trim()) { setFormError('First name is required'); return; }
    if (!formLastName.trim()) { setFormError('Last name is required'); return; }
    if (!formCheckIn) { setFormError('Check-in date is required'); return; }
    if (!formCheckOut) { setFormError('Check-out date is required'); return; }
    if (formCheckOut <= formCheckIn) { setFormError('Check-out must be after check-in'); return; }
    if (!formRoomTypeId) { setFormError('Room type is required'); return; }
    // Nightly rate is required only if no rate plan is selected (rate plan resolves server-side)
    if (!formRatePlanId && (!formNightlyRate || parseFloat(formNightlyRate) <= 0)) {
      setFormError('Nightly rate is required when no rate plan is selected');
      return;
    }
    if (!selectedPropertyId) { setFormError('No property selected'); return; }

    setIsSubmitting(true);
    const payload: Record<string, unknown> = {
      propertyId: selectedPropertyId,
      primaryGuestJson: {
        firstName: formFirstName.trim(),
        lastName: formLastName.trim(),
        ...(formEmail.trim() ? { email: formEmail.trim() } : {}),
        ...(formPhone.trim() ? { phone: formPhone.trim() } : {}),
      },
      checkInDate: formCheckIn,
      checkOutDate: formCheckOut,
      roomTypeId: formRoomTypeId,
      adults: formAdults,
      children: formChildren,
      sourceType: formSourceType,
    };
    // Include nightlyRateCents if user entered a rate (override), otherwise let server resolve from rate plan
    if (formNightlyRate && parseFloat(formNightlyRate) > 0) {
      payload.nightlyRateCents = Math.round(parseFloat(formNightlyRate) * 100);
    }
    if (formRatePlanId) payload.ratePlanId = formRatePlanId;
    if (formRoomId) payload.roomId = formRoomId;
    if (formGuestId) payload.guestId = formGuestId;
    if (formNotes.trim()) payload.internalNotes = formNotes.trim();

    try {
      await apiFetch('/api/v1/pms/reservations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeDialog();
      fetchReservations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create reservation';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    formFirstName, formLastName, formEmail, formPhone,
    formCheckIn, formCheckOut, formRoomTypeId, formRoomId, formRatePlanId,
    formNightlyRate, formAdults, formChildren, formSourceType,
    formNotes, formGuestId, selectedPropertyId, closeDialog, fetchReservations,
    ratePlanBaseRate,
  ]);

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
          <span className="font-mono text-xs font-semibold text-foreground">
            {shortId(row.id as string)}
          </span>
        ),
      },
      {
        key: 'guest',
        header: 'Guest Name',
        render: (row: ReservationRow) => (
          <span className="text-sm text-foreground">
            {guestName((row as Reservation).primaryGuestJson)}
          </span>
        ),
      },
      {
        key: 'roomTypeName',
        header: 'Room Type',
        render: (row: ReservationRow) => (
          <span className="text-sm text-foreground">
            {(row as Reservation).roomTypeName ?? '\u2014'}
          </span>
        ),
      },
      {
        key: 'roomNumber',
        header: 'Room #',
        width: '80px',
        render: (row: ReservationRow) => (
          <span className="text-sm text-foreground">
            {(row as Reservation).roomNumber ?? '\u2014'}
          </span>
        ),
      },
      {
        key: 'checkInDate',
        header: 'Check-In',
        width: '110px',
        render: (row: ReservationRow) => (
          <span className="text-sm text-foreground">{(row as Reservation).checkInDate}</span>
        ),
      },
      {
        key: 'checkOutDate',
        header: 'Check-Out',
        width: '110px',
        render: (row: ReservationRow) => (
          <span className="text-sm text-foreground">{(row as Reservation).checkOutDate}</span>
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
          <span className="text-sm text-foreground">
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <CalendarRange className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Reservations</h1>
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
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
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
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            placeholder="From"
          />
          <span className="text-muted-foreground">&ndash;</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            placeholder="To"
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-muted-foreground hover:text-foreground"
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
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Reservation Dialog */}
      {isDialogOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={closeDialog}
            />
            {/* Panel */}
            <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">New Reservation</h2>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  {formError}
                </div>
              )}

              {dialogDataLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Customer Search */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Guest</label>
                    {selectedCustomer ? (
                      <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                        <UserCheck className="h-4 w-4 text-indigo-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {selectedCustomer.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[selectedCustomer.email, selectedCustomer.phone].filter(Boolean).join(' \u00B7 ') || 'No contact info'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearCustomer}
                          className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div ref={customerSearchRef} className="relative">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input
                            type="text"
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder="Search existing customer or enter new guest below..."
                            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            autoFocus
                          />
                          {customerSearchLoading && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        {showCustomerDropdown && customerResults.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg max-h-48 overflow-y-auto">
                            {customerResults.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleSelectCustomer(c)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 first:rounded-t-lg last:rounded-b-lg"
                              >
                                <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{c.displayName}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {[c.email, c.phone].filter(Boolean).join(' \u00B7 ') || c.type}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {showCustomerDropdown && customerResults.length === 0 && customerSearch.length >= 2 && !customerSearchLoading && (
                          <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg px-3 py-3 text-center">
                            <p className="text-sm text-muted-foreground">No customers found</p>
                            <p className="text-xs text-muted-foreground mt-1">Fill in guest details below to create a new guest</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Guest Name */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formFirstName}
                        onChange={(e) => setFormFirstName(e.target.value)}
                        placeholder="John"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formLastName}
                        onChange={(e) => setFormLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Guest Contact */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Phone</label>
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        placeholder="+1 555-0100"
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Check-In <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formCheckIn}
                        onChange={(e) => setFormCheckIn(e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Check-Out <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={formCheckOut}
                        onChange={(e) => setFormCheckOut(e.target.value)}
                        min={formCheckIn || undefined}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  {computedNights > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {computedNights} night{computedNights !== 1 ? 's' : ''}
                    </p>
                  )}

                  {/* Room Type */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      Room Type <span className="text-red-500">*</span>
                    </label>
                    {roomTypes.length === 0 ? (
                      <p className="py-2 text-sm text-muted-foreground">
                        No room types found. Create a room type first.
                      </p>
                    ) : (
                      <Select
                        options={roomTypes.map((rt) => ({
                          value: rt.id,
                          label: `${rt.name} (${rt.code})`,
                        }))}
                        value={formRoomTypeId}
                        onChange={(v) => setFormRoomTypeId(v as string)}
                        placeholder="Select room type"
                      />
                    )}
                  </div>

                  {/* Room Assignment (optional) */}
                  {formRoomTypeId && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Room (optional)
                      </label>
                      {roomsLoading ? (
                        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading rooms...
                        </div>
                      ) : rooms.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">
                          No rooms available for this type
                        </p>
                      ) : (
                        <Select
                          options={[
                            { value: '', label: 'Unassigned (assign later)' },
                            ...rooms.map((r) => ({
                              value: r.id,
                              label: `Room ${r.roomNumber}${r.floor ? ` (Floor ${r.floor})` : ''} — ${r.status.replace(/_/g, ' ').toLowerCase()}`,
                            })),
                          ]}
                          value={formRoomId}
                          onChange={(v) => setFormRoomId(v as string)}
                          placeholder="Select room (optional)"
                        />
                      )}
                    </div>
                  )}

                  {/* Rate Plan + Nightly Rate */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Rate Plan
                      </label>
                      {ratePlans.length === 0 ? (
                        <p className="py-2 text-xs text-muted-foreground">
                          None available
                        </p>
                      ) : (
                        <Select
                          options={ratePlans.map((rp) => ({
                            value: rp.id,
                            label: `${rp.name} (${rp.code})`,
                          }))}
                          value={formRatePlanId}
                          onChange={(v) => {
                            setFormRatePlanId(v as string);
                            // Reset rate to allow auto-populate from new rate plan
                            setFormNightlyRate('');
                            setRatePlanBaseRate(null);
                          }}
                          placeholder="Select rate plan"
                        />
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Nightly Rate ($) {!formRatePlanId && <span className="text-red-500">*</span>}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formNightlyRate}
                          onChange={(e) => setFormNightlyRate(e.target.value)}
                          placeholder={ratePlanBaseRate != null ? `${(ratePlanBaseRate / 100).toFixed(2)} (from plan)` : '125.00'}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        {isLoadingRate && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                  {ratePlanBaseRate != null && formNightlyRate && parseFloat(formNightlyRate) > 0 && Math.round(parseFloat(formNightlyRate) * 100) !== ratePlanBaseRate && (
                    <p className="text-xs text-amber-500">
                      Rate plan base: ${(ratePlanBaseRate / 100).toFixed(2)}/night &mdash; overriding to ${parseFloat(formNightlyRate).toFixed(2)}/night
                    </p>
                  )}
                  {ratePlanBaseRate != null && !formNightlyRate && (
                    <p className="text-xs text-muted-foreground">
                      Using rate plan price: ${(ratePlanBaseRate / 100).toFixed(2)}/night
                    </p>
                  )}
                  {computedNights > 0 && (formNightlyRate ? parseFloat(formNightlyRate) > 0 : ratePlanBaseRate != null) && (
                    <p className="text-xs text-muted-foreground">
                      Subtotal: ${(computedNights * (formNightlyRate ? parseFloat(formNightlyRate) : (ratePlanBaseRate ?? 0) / 100)).toFixed(2)} ({computedNights} night{computedNights !== 1 ? 's' : ''} &times; ${(formNightlyRate ? parseFloat(formNightlyRate) : (ratePlanBaseRate ?? 0) / 100).toFixed(2)})
                    </p>
                  )}

                  {/* Occupancy */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Adults</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={formAdults}
                        onChange={(e) => setFormAdults(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Children</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={formChildren}
                        onChange={(e) => setFormChildren(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Source Type */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Source</label>
                    <Select
                      options={SOURCE_TYPE_OPTIONS}
                      value={formSourceType}
                      onChange={(v) => setFormSourceType(v as string)}
                      placeholder="Select source"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Internal Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Optional notes..."
                      rows={2}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateReservation}
                  disabled={isSubmitting || roomTypes.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSubmitting ? 'Creating...' : 'Create Reservation'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
