'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Calendar,
  CalendarCheck,
  Eye,
  XCircle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { ActionMenu } from '@/components/ui/action-menu';
import type { ActionMenuItem } from '@/components/ui/action-menu';
import { useSpaAppointments, useSpaProviders } from '@/hooks/use-spa';

// ── Types ───────────────────────────────────────────────────────

interface AppointmentService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

interface SpaAppointment {
  id: string;
  appointmentNumber: string;
  scheduledAt: string;
  endAt: string;
  customerName: string | null;
  customerId: string | null;
  guestName: string | null;
  services: AppointmentService[];
  providerName: string | null;
  providerId: string | null;
  status: string;
  totalCents: number;
  notes: string | null;
  createdAt: string;
}

type AppointmentRow = SpaAppointment & Record<string, unknown>;

// ── Constants ───────────────────────────────────────────────────

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'in_service', label: 'In Service' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
] as const;

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

// ── Status Badge ────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-500/10 text-gray-500',
    reserved: 'bg-blue-500/10 text-blue-500',
    confirmed: 'bg-blue-500/10 text-blue-500',
    checked_in: 'bg-amber-500/10 text-amber-500',
    in_service: 'bg-purple-500/10 text-purple-500',
    completed: 'bg-green-500/10 text-green-500',
    checked_out: 'bg-green-500/10 text-green-500',
    canceled: 'bg-red-500/10 text-red-500',
    no_show: 'bg-red-500/10 text-red-500',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-gray-500/10 text-gray-500'}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Filter Bar ──────────────────────────────────────────────────

function FilterBar({
  statusFilter,
  onStatusChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  provider,
  onProviderChange,
  providerOptions,
  search,
  onSearchChange,
}: {
  statusFilter: string;
  onStatusChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  provider: string;
  onProviderChange: (v: string) => void;
  providerOptions: Array<{ value: string; label: string }>;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onStatusChange(tab.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-indigo-600 text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Secondary filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search customer, appointment #..."
          className="w-full md:w-72"
        />

        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            aria-label="Date from"
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <span className="text-muted-foreground">&ndash;</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            aria-label="Date to"
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <Select
          options={providerOptions}
          value={provider}
          onChange={(v) => onProviderChange(v as string)}
          placeholder="All Providers"
          className="w-full md:w-48"
        />
      </div>
    </div>
  );
}

// ── Main Content ────────────────────────────────────────────────

export default function AppointmentsContent() {
  const router = useRouter();

  // ── Filter state ────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [provider, setProvider] = useState('');
  const [search, setSearch] = useState('');

  // ── Data ────────────────────────────────────────────────────
  const {
    items,
    meta,
    isLoading,
  } = useSpaAppointments({
    status: statusFilter || undefined,
    startDate: dateFrom || undefined,
    endDate: dateTo || undefined,
    providerId: provider || undefined,
    search: search || undefined,
  });
  const { items: providersList } = useSpaProviders();

  // ── Provider options (memoized) ─────────────────────────────
  const providerOptions = useMemo(
    () => [
      { value: '', label: 'All Providers' },
      ...providersList.map((p) => ({
        value: p.id,
        label: p.displayName,
      })),
    ],
    [providersList],
  );

  // ── Filter helpers ──────────────────────────────────────────
  const hasFilters = !!search || !!statusFilter || !!dateFrom || !!dateTo || !!provider;

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setProvider('');
  }, []);

  // ── Row actions ─────────────────────────────────────────────
  const buildActions = useCallback(
    (row: SpaAppointment): ActionMenuItem[] => {
      const actions: ActionMenuItem[] = [
        {
          key: 'view',
          label: 'View Details',
          icon: Eye,
          onClick: () => router.push(`/spa/appointments/${row.id}`),
        },
      ];

      if (row.status === 'confirmed' || row.status === 'reserved') {
        actions.push({
          key: 'check-in',
          label: 'Check In',
          icon: CheckCircle,
          onClick: () => router.push(`/spa/appointments/${row.id}?action=checkin`),
        });
      }

      if (row.status === 'checked_in') {
        actions.push({
          key: 'start-service',
          label: 'Start Service',
          icon: Clock,
          onClick: () => router.push(`/spa/appointments/${row.id}?action=start`),
        });
      }

      if (
        row.status !== 'completed' &&
        row.status !== 'canceled' &&
        row.status !== 'no_show' &&
        row.status !== 'checked_out'
      ) {
        actions.push({
          key: 'cancel',
          label: 'Cancel',
          icon: XCircle,
          destructive: true,
          dividerBefore: true,
          onClick: () => router.push(`/spa/appointments/${row.id}?action=cancel`),
        });
      }

      return actions;
    },
    [router],
  );

  // ── Columns ─────────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        key: 'appointmentNumber',
        header: 'Appointment #',
        width: '140px',
        render: (row: AppointmentRow) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/spa/appointments/${row.id}`);
            }}
            className="text-sm font-medium text-indigo-500 hover:text-indigo-400 hover:underline"
          >
            {row.appointmentNumber}
          </button>
        ),
      },
      {
        key: 'scheduledAt',
        header: 'Date & Time',
        width: '180px',
        render: (row: AppointmentRow) => (
          <div className="flex flex-col">
            <span className="text-sm text-foreground">{formatDate(row.scheduledAt)}</span>
            <span className="text-xs text-muted-foreground">
              {formatTime(row.scheduledAt)}
              {row.endAt ? ` \u2013 ${formatTime(row.endAt)}` : ''}
            </span>
          </div>
        ),
      },
      {
        key: 'customerName',
        header: 'Customer',
        render: (row: AppointmentRow) => (
          <span className="text-sm text-foreground">
            {row.customerName || row.guestName || '\u2014'}
          </span>
        ),
      },
      {
        key: 'services',
        header: 'Service(s)',
        render: (row: AppointmentRow) => {
          const names = row.services?.map((s: AppointmentService) => s.name) ?? [];
          if (names.length === 0) return <span className="text-sm text-muted-foreground">{'\u2014'}</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {names.length <= 2 ? (
                <span className="text-sm text-foreground">{names.join(', ')}</span>
              ) : (
                <>
                  <span className="text-sm text-foreground">{names[0]}</span>
                  <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-xs font-medium text-indigo-500">
                    +{names.length - 1}
                  </span>
                </>
              )}
            </div>
          );
        },
      },
      {
        key: 'providerName',
        header: 'Provider',
        width: '140px',
        render: (row: AppointmentRow) => (
          <span className="text-sm text-foreground">
            {row.providerName || '\u2014'}
          </span>
        ),
      },
      {
        key: 'totalCents',
        header: 'Total',
        width: '100px',
        render: (row: AppointmentRow) => (
          <span className="text-sm font-medium tabular-nums text-foreground">
            {row.totalCents > 0 ? formatMoney(row.totalCents) : '\u2014'}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '120px',
        render: (row: AppointmentRow) => <StatusBadge status={row.status} />,
      },
      {
        key: 'actions',
        header: '',
        width: '48px',
        render: (row: AppointmentRow) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ActionMenu items={buildActions(row)} />
          </div>
        ),
      },
    ],
    [router, buildActions],
  );

  // ── Row click ───────────────────────────────────────────────
  const handleRowClick = useCallback(
    (row: AppointmentRow) => {
      router.push(`/spa/appointments/${row.id}`);
    },
    [router],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Appointments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage spa and wellness appointments
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/spa/appointments/new')}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Appointment
        </button>
      </div>

      {/* Filter bar */}
      <FilterBar
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        provider={provider}
        onProviderChange={setProvider}
        providerOptions={providerOptions}
        search={search}
        onSearchChange={setSearch}
      />

      {/* Table / Empty state */}
      {!isLoading && items.length === 0 && !hasFilters ? (
        <EmptyState
          icon={CalendarCheck}
          title="No appointments found"
          description="Spa appointments will appear here once they are scheduled."
          action={{
            label: 'Schedule Appointment',
            onClick: () => router.push('/spa/appointments/new'),
          }}
        />
      ) : !isLoading && items.length === 0 && hasFilters ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-12">
          <Search className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">No appointments match your filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={items as unknown as AppointmentRow[]}
            isLoading={isLoading}
            emptyMessage="No appointments found"
            onRowClick={handleRowClick}
          />

          {/* Pagination hint */}
          {meta.hasMore && (
            <div className="flex justify-center">
              <p className="text-sm text-muted-foreground">
                Showing first page of results. Refine filters to narrow down.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
