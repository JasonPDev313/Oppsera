'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Users,
  DollarSign,
  ShoppingCart,
  Eye,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useSpaCalendar } from '@/hooks/use-spa';
import { useQueryClient } from '@tanstack/react-query';
import { SpaPayNowDialog } from '@/components/spa/spa-pay-now-dialog';
import { CheckoutToPosDialog } from '@/components/spa/checkout-to-pos-dialog';
import type { CheckoutToPosResult } from '@/components/spa/checkout-to-pos-dialog';

// ── Types ─────────────────────────────────────────────────────────────

type ViewMode = 'day' | 'week';

type AppointmentStatus =
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show';

interface CalendarAppointment {
  id: string;
  customerName: string;
  serviceName: string;
  startTime: string; // ISO datetime
  endTime: string;   // ISO datetime
  status: AppointmentStatus;
  providerId: string | null;
  orderId: string | null;
  notes?: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  appointment: CalendarAppointment;
}

interface CalendarProviderColumn {
  id: string;
  name: string;
  color: string;
  appointments: CalendarAppointment[];
}

// ── Constants ─────────────────────────────────────────────────────────

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const SLOT_COUNT = (DAY_END_HOUR - DAY_START_HOUR) * 2; // 30-min slots
const PX_PER_HOUR = 60;
const SLOT_HEIGHT_PX = PX_PER_HOUR / 2; // 30px per 30-min slot
const TOTAL_HEIGHT_PX = (DAY_END_HOUR - DAY_START_HOUR) * PX_PER_HOUR;

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  confirmed:  { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-500' },
  checked_in: { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-500' },
  completed:  { bg: 'bg-gray-500/10',   border: 'border-gray-500/30',   text: 'text-muted-foreground' },
  cancelled:  { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-500' },
  no_show:    { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-500' },
};

// ── Helpers ───────────────────────────────────────────────────────────

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getTopPosition(time: string, dayStart: number = DAY_START_HOUR): number {
  const d = new Date(time);
  const hours = d.getHours() + d.getMinutes() / 60;
  return (hours - dayStart) * PX_PER_HOUR;
}

function getHeight(start: string, end: string): number {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const minutes = diffMs / (1000 * 60);
  return minutes; // 1px per minute
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getWeekDays(startDate: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── Time slots ────────────────────────────────────────────────────────

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const totalMinutes = DAY_START_HOUR * 60 + i * 30;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    slots.push(`${displayH}:${String(m).padStart(2, '0')} ${period}`);
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

// ── Main Component ────────────────────────────────────────────────────

export default function SpaCalendarContent() {
  const { locations } = useAuthContext();
  const locationId = locations[0]?.id ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [providerFilterOpen, setProviderFilterOpen] = useState(false);

  // Context menu + dialog state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [payNowAppointment, setPayNowAppointment] = useState<CalendarAppointment | null>(null);
  const [sendToPosAppointment, setSendToPosAppointment] = useState<CalendarAppointment | null>(null);

  // Compute date range based on view mode
  const { startDate, endDate } = useMemo(() => {
    if (viewMode === 'day') {
      const dayStr = formatISODate(currentDate);
      return { startDate: dayStr, endDate: dayStr };
    }
    const monday = getMonday(currentDate);
    const sunday = addDays(monday, 6);
    return { startDate: formatISODate(monday), endDate: formatISODate(sunday) };
  }, [viewMode, currentDate]);

  const { data: calendarData, isLoading, error } = useSpaCalendar({
    locationId,
    startDate,
    endDate,
    providerIds: selectedProviderIds.length > 0 ? selectedProviderIds : undefined,
  });

  const PROVIDER_COLORS = [
    '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
    '#a78bfa', '#fb923c', '#2dd4bf',
  ];

  // Map hook data to local CalendarProviderColumn shape
  const providers: CalendarProviderColumn[] = useMemo(() => {
    return (calendarData?.providers ?? []).map((p, idx) => ({
      id: p.providerId,
      name: p.providerName,
      color: PROVIDER_COLORS[idx % PROVIDER_COLORS.length]!,
      appointments: (p.appointments ?? []) as unknown as CalendarAppointment[],
    }));
  }, [calendarData]);

  const unassigned: CalendarAppointment[] = [];

  // Filter providers based on selection
  const visibleProviders = useMemo(() => {
    if (selectedProviderIds.length === 0) return providers;
    return providers.filter((p) => selectedProviderIds.includes(p.id));
  }, [providers, selectedProviderIds]);

  // All unique provider names for filter dropdown
  const allProviders = useMemo(() => {
    return providers.map((p) => ({ id: p.id, name: p.name, color: p.color }));
  }, [providers]);

  // ── Navigation ────────────────────────────────────────────────────

  const goToPrev = useCallback(() => {
    setCurrentDate((prev) => addDays(prev, viewMode === 'day' ? -1 : -7));
  }, [viewMode]);

  const goToNext = useCallback(() => {
    setCurrentDate((prev) => addDays(prev, viewMode === 'day' ? 1 : 7));
  }, [viewMode]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const toggleProvider = useCallback((providerId: string) => {
    setSelectedProviderIds((prev) =>
      prev.includes(providerId)
        ? prev.filter((id) => id !== providerId)
        : [...prev, providerId],
    );
  }, []);

  // Week days for week view
  const weekDays = useMemo(() => {
    const monday = getMonday(currentDate);
    return getWeekDays(monday);
  }, [currentDate]);

  // ── Appointment click / context menu handlers ───────────────────

  const handleAppointmentClick = useCallback((appt: CalendarAppointment) => {
    router.push(`/spa/appointments/${appt.id}`);
  }, [router]);

  const handleContextMenu = useCallback((e: React.MouseEvent, appt: CalendarAppointment) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, appointment: appt });
  }, []);

  // Click-away dismiss
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const handlePayNowClick = useCallback(() => {
    if (!contextMenu) return;
    setPayNowAppointment(contextMenu.appointment);
    setContextMenu(null);
  }, [contextMenu]);

  const handleSendToPosClick = useCallback(() => {
    if (!contextMenu) return;
    setSendToPosAppointment(contextMenu.appointment);
    setContextMenu(null);
  }, [contextMenu]);

  const handleViewDetailsClick = useCallback(() => {
    if (!contextMenu) return;
    router.push(`/spa/appointments/${contextMenu.appointment.id}`);
    setContextMenu(null);
  }, [contextMenu, router]);

  const handleCheckoutSuccess = useCallback((result: CheckoutToPosResult) => {
    setSendToPosAppointment(null);
    router.push(`/pos/retail?orderId=${result.orderId}`);
  }, [router]);

  const handlePaymentComplete = useCallback(() => {
    setPayNowAppointment(null);
    queryClient.invalidateQueries({ queryKey: ['spa-calendar'] });
  }, [queryClient]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Spa Calendar</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date navigation */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
            <button
              onClick={goToPrev}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToToday}
              className="rounded px-3 py-1 text-sm font-medium text-foreground hover:bg-accent"
            >
              Today
            </button>
            <button
              onClick={goToNext}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day / Week toggle */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setViewMode('day')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                viewMode === 'day'
                  ? 'bg-indigo-600 text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                viewMode === 'week'
                  ? 'bg-indigo-600 text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              Week
            </button>
          </div>

          {/* Provider filter */}
          <div className="relative">
            <button
              onClick={() => setProviderFilterOpen(!providerFilterOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>
                {selectedProviderIds.length === 0
                  ? 'All Providers'
                  : `${selectedProviderIds.length} Selected`}
              </span>
            </button>
            {providerFilterOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setProviderFilterOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-border bg-surface p-2 shadow-lg">
                  <button
                    onClick={() => {
                      setSelectedProviderIds([]);
                      setProviderFilterOpen(false);
                    }}
                    className="mb-1 w-full rounded px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Show All
                  </button>
                  <div className="border-t border-border pt-1">
                    {allProviders.map((provider) => (
                      <label
                        key={provider.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={selectedProviderIds.includes(provider.id)}
                          onChange={() => toggleProvider(provider.id)}
                          className="rounded border-border"
                        />
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: provider.color }}
                        />
                        {provider.name}
                      </label>
                    ))}
                  </div>
                  {allProviders.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No providers found</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Date display */}
      <div className="text-sm text-muted-foreground">
        {viewMode === 'day'
          ? formatDateDisplay(currentDate)
          : `${formatDateShort(weekDays[0]!)} - ${formatDateShort(weekDays[6]!)}`}
      </div>

      {/* Loading state */}
      {isLoading && <CalendarSkeleton />}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error?.message ?? 'An error occurred'}
        </div>
      )}

      {/* Day view */}
      {!isLoading && !error && viewMode === 'day' && (
        <DayView
          providers={visibleProviders}
          unassigned={unassigned}
          onAppointmentClick={handleAppointmentClick}
          onAppointmentContextMenu={handleContextMenu}
        />
      )}

      {/* Week view */}
      {!isLoading && !error && viewMode === 'week' && (
        <WeekView
          providers={visibleProviders}
          unassigned={unassigned}
          weekDays={weekDays}
          onAppointmentClick={handleAppointmentClick}
          onAppointmentContextMenu={handleContextMenu}
        />
      )}

      {/* Empty state */}
      {!isLoading && !error && visibleProviders.length === 0 && unassigned.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CalendarDays className="mb-3 h-10 w-10" />
          <p className="text-sm">No appointments scheduled for this period.</p>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <AppointmentContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          appointment={contextMenu.appointment}
          onPayNow={handlePayNowClick}
          onSendToPos={handleSendToPosClick}
          onViewDetails={handleViewDetailsClick}
        />
      )}

      {/* Pay Now dialog */}
      {payNowAppointment && (
        <SpaPayNowDialog
          open
          onClose={() => setPayNowAppointment(null)}
          appointmentId={payNowAppointment.id}
          appointmentStatus={payNowAppointment.status}
          serviceName={payNowAppointment.serviceName}
          existingOrderId={payNowAppointment.orderId}
          onPaymentComplete={handlePaymentComplete}
        />
      )}

      {/* Send to POS dialog */}
      {sendToPosAppointment && (
        <CheckoutToPosDialog
          open
          onClose={() => setSendToPosAppointment(null)}
          appointmentId={sendToPosAppointment.id}
          serviceName={sendToPosAppointment.serviceName}
          totalCents={0}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </div>
  );
}

// ── Day View Component ────────────────────────────────────────────────

function DayView({
  providers,
  unassigned,
  onAppointmentClick,
  onAppointmentContextMenu,
}: {
  providers: CalendarProviderColumn[];
  unassigned: CalendarAppointment[];
  onAppointmentClick: (appt: CalendarAppointment) => void;
  onAppointmentContextMenu: (e: React.MouseEvent, appt: CalendarAppointment) => void;
}) {
  const columns = useMemo(() => {
    const cols: CalendarProviderColumn[] = [...providers];
    if (unassigned.length > 0) {
      cols.push({
        id: '__unassigned__',
        name: 'Unassigned',
        color: '#6b7280',
        appointments: unassigned,
      });
    }
    return cols;
  }, [providers, unassigned]);

  if (columns.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="flex min-w-[600px]">
        {/* Time column */}
        <div className="w-20 shrink-0 border-r border-border">
          {/* Header spacer */}
          <div className="h-12 border-b border-border" />
          {/* Time labels */}
          <div className="relative" style={{ height: `${TOTAL_HEIGHT_PX}px` }}>
            {TIME_SLOTS.map((label, i) => (
              <div
                key={i}
                className="absolute right-2 flex items-start text-xs text-muted-foreground"
                style={{ top: `${i * SLOT_HEIGHT_PX}px`, height: `${SLOT_HEIGHT_PX}px` }}
              >
                {i % 2 === 0 ? label : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Provider columns */}
        {columns.map((col) => (
          <div key={col.id} className="min-w-[180px] flex-1 border-r border-border last:border-r-0">
            {/* Provider header */}
            <div className="flex h-12 items-center gap-2 border-b border-border px-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <span className="truncate text-sm font-medium text-foreground">{col.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {col.appointments.length}
              </span>
            </div>

            {/* Time grid + appointments */}
            <div className="relative" style={{ height: `${TOTAL_HEIGHT_PX}px` }}>
              {/* Grid lines */}
              {TIME_SLOTS.map((_, i) => (
                <div
                  key={i}
                  className={`absolute left-0 right-0 border-t ${
                    i % 2 === 0 ? 'border-border' : 'border-border/30'
                  }`}
                  style={{ top: `${i * SLOT_HEIGHT_PX}px` }}
                />
              ))}

              {/* Appointment blocks */}
              {col.appointments.map((appt) => {
                const top = getTopPosition(appt.startTime);
                const height = Math.max(getHeight(appt.startTime, appt.endTime), 20);
                const colors = STATUS_COLORS[appt.status] ?? STATUS_COLORS.confirmed;

                // Skip appointments outside visible range
                if (top + height < 0 || top > TOTAL_HEIGHT_PX) return null;

                return (
                  <button
                    key={appt.id}
                    onClick={() => onAppointmentClick(appt)}
                    onContextMenu={(e) => onAppointmentContextMenu(e, appt)}
                    className={`absolute left-1 right-1 overflow-hidden rounded border ${colors.bg} ${colors.border} px-2 py-1 text-left transition-opacity hover:opacity-80`}
                    style={{
                      top: `${Math.max(top, 0)}px`,
                      height: `${height}px`,
                      zIndex: 10,
                    }}
                  >
                    <div className={`truncate text-xs font-medium ${colors.text}`}>
                      {appt.customerName}
                    </div>
                    {height >= 36 && (
                      <div className="truncate text-xs text-muted-foreground">
                        {appt.serviceName}
                      </div>
                    )}
                    {height >= 52 && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTime(appt.startTime)} - {formatTime(appt.endTime)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Week View Component ───────────────────────────────────────────────

function WeekView({
  providers,
  unassigned,
  weekDays,
  onAppointmentClick,
  onAppointmentContextMenu,
}: {
  providers: CalendarProviderColumn[];
  unassigned: CalendarAppointment[];
  weekDays: Date[];
  onAppointmentClick: (appt: CalendarAppointment) => void;
  onAppointmentContextMenu: (e: React.MouseEvent, appt: CalendarAppointment) => void;
}) {
  // Collect all appointments across providers + unassigned
  const allAppointments = useMemo(() => {
    const list: CalendarAppointment[] = [];
    for (const provider of providers) {
      list.push(...provider.appointments);
    }
    list.push(...unassigned);
    return list;
  }, [providers, unassigned]);

  // Group by day
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const day of weekDays) {
      map.set(formatISODate(day), []);
    }
    for (const appt of allAppointments) {
      const dayStr = formatISODate(new Date(appt.startTime));
      const existing = map.get(dayStr);
      if (existing) {
        existing.push(appt);
      }
    }
    // Sort each day's appointments by start time
    for (const [, appts] of map) {
      appts.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
    }
    return map;
  }, [allAppointments, weekDays]);

  // Lookup provider color by ID
  const providerColorMap = useMemo(() => {
    const map = new Map<string | null, string>();
    for (const p of providers) {
      map.set(p.id, p.color);
    }
    return map;
  }, [providers]);

  const today = new Date();

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="grid min-w-[700px] grid-cols-7">
        {weekDays.map((day) => {
          const dayStr = formatISODate(day);
          const isToday = isSameDay(day, today);
          const appts = appointmentsByDay.get(dayStr) ?? [];

          return (
            <div
              key={dayStr}
              className={`border-r border-border last:border-r-0 ${
                isToday ? 'bg-indigo-500/5' : ''
              }`}
            >
              {/* Day header */}
              <div className="border-b border-border px-2 py-2 text-center">
                <div className="text-xs text-muted-foreground">
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div
                  className={`mt-0.5 text-sm font-medium ${
                    isToday ? 'text-indigo-500' : 'text-foreground'
                  }`}
                >
                  {day.getDate()}
                </div>
              </div>

              {/* Appointments */}
              <div className="min-h-[200px] space-y-1 p-1">
                {appts.map((appt) => {
                  const colors = STATUS_COLORS[appt.status] ?? STATUS_COLORS.confirmed;
                  const providerColor = appt.providerId
                    ? providerColorMap.get(appt.providerId)
                    : undefined;

                  return (
                    <button
                      key={appt.id}
                      onClick={() => onAppointmentClick(appt)}
                      onContextMenu={(e) => onAppointmentContextMenu(e, appt)}
                      className={`w-full rounded border ${colors.bg} ${colors.border} px-1.5 py-1 text-left transition-opacity hover:opacity-80`}
                    >
                      <div className="flex items-center gap-1">
                        {providerColor && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: providerColor }}
                          />
                        )}
                        <span className={`truncate text-xs font-medium ${colors.text}`}>
                          {formatTime(appt.startTime)}
                        </span>
                      </div>
                      <div className="truncate text-xs text-foreground">
                        {appt.customerName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {appt.serviceName}
                      </div>
                    </button>
                  );
                })}

                {appts.length === 0 && (
                  <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                    No appts
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Context Menu ─────────────────────────────────────────────────────

function AppointmentContextMenu({
  x,
  y,
  appointment,
  onPayNow,
  onSendToPos,
  onViewDetails,
}: {
  x: number;
  y: number;
  appointment: CalendarAppointment;
  onPayNow: () => void;
  onSendToPos: () => void;
  onViewDetails: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const canPayNow = appointment.status === 'completed' && !appointment.orderId;
  const canSendToPos = appointment.status === 'completed' && !appointment.orderId;
  const alreadyCheckedOut = !!appointment.orderId;

  // Clamp menu position so it doesn't overflow the viewport
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const newLeft = rect.right > window.innerWidth ? x - rect.width : x;
    const newTop = rect.bottom > window.innerHeight ? y - rect.height : y;
    setPos({ left: Math.max(4, newLeft), top: Math.max(4, newTop) });
  }, [x, y]);

  const items: Array<{
    label: string;
    icon: typeof DollarSign;
    onClick: () => void;
    disabled: boolean;
    disabledReason?: string;
    accent?: string;
  }> = [
    {
      label: 'Pay Now',
      icon: DollarSign,
      onClick: onPayNow,
      disabled: !canPayNow,
      disabledReason: alreadyCheckedOut
        ? 'Already checked out'
        : appointment.status !== 'completed'
          ? 'Appointment not completed'
          : undefined,
      accent: 'text-green-500',
    },
    {
      label: 'Send to POS',
      icon: ShoppingCart,
      onClick: onSendToPos,
      disabled: !canSendToPos,
      disabledReason: alreadyCheckedOut
        ? 'Already checked out'
        : appointment.status !== 'completed'
          ? 'Appointment not completed'
          : undefined,
      accent: 'text-indigo-500',
    },
    {
      label: 'View Details',
      icon: Eye,
      onClick: onViewDetails,
      disabled: false,
    },
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-surface py-1 shadow-xl"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={item.disabled}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            title={item.disabledReason}
          >
            <Icon className={`h-4 w-4 ${item.disabled ? 'text-muted-foreground' : (item.accent ?? 'text-muted-foreground')}`} />
            <span className={item.disabled ? 'text-muted-foreground' : 'text-foreground'}>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex">
        {/* Time column skeleton */}
        <div className="w-20 shrink-0 border-r border-border">
          <div className="h-12 border-b border-border" />
          <div className="space-y-6 p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-3 w-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>

        {/* Provider column skeletons */}
        {Array.from({ length: 3 }).map((_, colIdx) => (
          <div key={colIdx} className="min-w-[180px] flex-1 border-r border-border last:border-r-0">
            <div className="flex h-12 items-center gap-2 border-b border-border px-3">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="space-y-3 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded border border-border bg-muted/30 p-2"
                  style={{ height: `${40 + Math.random() * 40}px` }}
                >
                  <div className="h-3 w-20 rounded bg-muted" />
                  <div className="mt-1.5 h-3 w-28 rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
