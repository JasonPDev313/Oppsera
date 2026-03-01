'use client';

import { useMemo } from 'react';
import {
  CalendarDays,
  Users,
  Clock,
  DollarSign,
  TrendingUp,
  Activity,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useSpaDashboard, useSpaAppointments } from '@/hooks/use-spa';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(dollars: number): string {
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-blue-500/10 text-blue-500',
  checked_in: 'bg-amber-500/10 text-amber-500',
  in_service: 'bg-purple-500/10 text-purple-500',
  completed: 'bg-green-500/10 text-green-500',
  canceled: 'bg-red-500/10 text-red-500',
  no_show: 'bg-gray-500/10 text-gray-500',
  draft: 'bg-gray-500/10 text-gray-500',
};

function statusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const FALLBACK_COLORS = [
  '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
  '#a78bfa', '#fb923c', '#2dd4bf',
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}

function KpiCard({ icon, label, value, accent }: KpiCardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex items-center gap-4">
      <div className={`flex-shrink-0 rounded-lg p-2.5 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-semibold text-foreground tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

interface ProviderBarProps {
  name: string;
  color: string;
  utilization: number;
  appointments: number;
}

function ProviderBar({ name, color, utilization, appointments }: ProviderBarProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 w-36 flex-shrink-0">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm text-foreground truncate">{name}</span>
      </div>
      <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
      <span className="text-sm text-muted-foreground tabular-nums w-12 text-right">
        {utilization}%
      </span>
      <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
        {appointments} appts
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Content
// ---------------------------------------------------------------------------

export default function SpaContent() {
  const todayISO = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  // Pre-aggregated CQRS dashboard metrics (rm_spa_* read models)
  const { data: dashboard, isLoading: dashboardLoading } = useSpaDashboard(
    undefined,
    todayISO,
  );

  // Only fetch 5 appointments for the upcoming list
  const { items: appointments = [], isLoading: appointmentsLoading } =
    useSpaAppointments({
      status: 'confirmed,checked_in,in_service',
      startDate: todayISO,
      endDate: todayISO,
      limit: 5,
    });

  const isLoading = dashboardLoading || appointmentsLoading;

  // --- Loading skeleton ---
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-lg p-4 h-20 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-lg p-5 h-52 animate-pulse" />
          <div className="bg-surface border border-border rounded-lg p-5 h-52 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-lg p-4 h-16 animate-pulse"
            />
          ))}
        </div>
        <div className="bg-surface border border-border rounded-lg p-5 h-64 animate-pulse" />
      </div>
    );
  }

  const today = dashboard?.today;
  const revenue = dashboard?.revenue;
  const providers = dashboard?.providerUtilization ?? [];
  const topServices = dashboard?.topServices ?? [];
  const kpis = dashboard?.kpis;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Spa Dashboard</h1>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
          <Plus className="h-4 w-4" />
          New Appointment
        </button>
      </div>

      {/* ── Primary KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<CalendarDays className="h-5 w-5 text-blue-500" />}
          label="Today's Appointments"
          value={String(today?.totalAppointments ?? 0)}
          accent="bg-blue-500/10"
        />
        <KpiCard
          icon={<Users className="h-5 w-5 text-amber-500" />}
          label="Checked In"
          value={String(today?.checkedIn ?? 0)}
          accent="bg-amber-500/10"
        />
        <KpiCard
          icon={<Activity className="h-5 w-5 text-purple-500" />}
          label="In Service"
          value={String(today?.inService ?? 0)}
          accent="bg-purple-500/10"
        />
        <KpiCard
          icon={<DollarSign className="h-5 w-5 text-green-500" />}
          label="Revenue Today"
          value={formatDollars(revenue?.totalRevenue ?? 0)}
          accent="bg-green-500/10"
        />
      </div>

      {/* ── Provider Utilization & Top Services ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provider Utilization */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">
            Provider Utilization
          </h2>
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No provider data for today.
            </p>
          ) : (
            <div className="space-y-3">
              {providers.map((p, idx) => (
                <ProviderBar
                  key={p.providerId}
                  name={p.providerName}
                  color={p.providerColor ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]!}
                  utilization={p.utilizationPct}
                  appointments={p.appointmentCount}
                />
              ))}
            </div>
          )}
        </div>

        {/* Top Services */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">
            Top Services
          </h2>
          {topServices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No services booked recently.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium text-right">Bookings</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topServices.map((s) => (
                  <tr key={s.serviceId}>
                    <td className="py-2 text-foreground">{s.serviceName}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {s.bookingCount}
                    </td>
                    <td className="py-2 text-right tabular-nums text-foreground">
                      {formatDollars(s.totalRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Quick KPIs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Avg Duration</p>
            <p className="text-sm font-medium text-foreground tabular-nums">
              {kpis?.avgAppointmentDuration ?? 0} min
            </p>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center gap-3">
          <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Utilization</p>
            <p className="text-sm font-medium text-foreground tabular-nums">
              {kpis?.utilizationPct ?? 0}%
            </p>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center gap-3">
          <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">No-Show Rate</p>
            <p className="text-sm font-medium text-foreground tabular-nums">
              {kpis?.noShowRate ?? 0}%
            </p>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-3 flex items-center gap-3">
          <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Online Bookings</p>
            <p className="text-sm font-medium text-foreground tabular-nums">
              {kpis?.onlineBookingCount ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* ── Upcoming Appointments ──────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">
            Upcoming Appointments
          </h2>
          <button className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No upcoming appointments today.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {appointments.map((appt) => {
              const status = appt.status ?? 'draft';
              return (
                <div
                  key={appt.id}
                  className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                >
                  {/* Time */}
                  <span className="text-sm font-medium text-foreground tabular-nums w-20 flex-shrink-0">
                    {appt.startTime ? formatTime(appt.startTime) : '--:--'}
                  </span>

                  {/* Customer */}
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">
                    {appt.customerName ?? 'Walk-in'}
                  </span>

                  {/* Service */}
                  <span className="text-sm text-muted-foreground truncate hidden sm:block flex-1 min-w-0">
                    {appt.serviceName ?? ''}
                  </span>

                  {/* Provider */}
                  <span className="text-sm text-muted-foreground truncate hidden md:block w-28 flex-shrink-0">
                    {appt.providerName ?? ''}
                  </span>

                  {/* Status badge */}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}
                  >
                    {statusLabel(status)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
