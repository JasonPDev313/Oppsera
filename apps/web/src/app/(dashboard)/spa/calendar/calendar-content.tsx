'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  List,
  Users,
  DollarSign,
  ShoppingCart,
  Eye,
  Zap,
} from 'lucide-react';
import { useSpaCalendar, useSpaAvailabilitySummary } from '@/hooks/use-spa';
import { useAuthContext } from '@/components/auth-provider';
import { useQueryClient } from '@tanstack/react-query';
import { SpaPayNowDialog } from '@/components/spa/spa-pay-now-dialog';
import { CheckoutToPosDialog } from '@/components/spa/checkout-to-pos-dialog';
import type { CheckoutToPosResult } from '@/components/spa/checkout-to-pos-dialog';
import SpaCondensedView from '@/components/spa/calendar/SpaCondensedView';
import SpaQuickBookDialog from '@/components/spa/calendar/SpaQuickBookDialog';
import SpaAppointmentListView from '@/components/spa/SpaAppointmentListView';

// ── Types ─────────────────────────────────────────────────────────────

type PageView = 'quick' | 'calendar' | 'list';
type ViewMode = 'day' | 'week';
type ViewRange = 7 | 14 | 30;

type AppointmentStatus =
  | 'draft'
  | 'reserved'
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_service'
  | 'completed'
  | 'checked_out'
  | 'canceled'
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
  totalCents: number;
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
  draft:       { bg: 'bg-gray-500/10',    border: 'border-gray-500/30',    text: 'text-muted-foreground' },
  reserved:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    text: 'text-cyan-500' },
  scheduled:   { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30',  text: 'text-indigo-500' },
  confirmed:   { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-500' },
  checked_in:  { bg: 'bg-green-500/10',   border: 'border-green-500/30',   text: 'text-green-500' },
  in_service:  { bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  text: 'text-purple-500' },
  completed:   { bg: 'bg-gray-500/10',    border: 'border-gray-500/30',    text: 'text-muted-foreground' },
  checked_out: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-500' },
  canceled:    { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-500' },
  no_show:     { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-500' },
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

// ── Overlap layout ───────────────────────────────────────────────────

interface LayoutSlot {
  appointment: CalendarAppointment;
  column: number;
  totalColumns: number;
}

/**
 * Classic calendar overlap algorithm: groups overlapping appointments
 * and assigns each a sub-column so they render side-by-side.
 */
function layoutOverlappingAppointments(appointments: CalendarAppointment[]): LayoutSlot[] {
  if (appointments.length === 0) return [];

  // Filter out appointments with invalid dates
  const valid = appointments.filter(a => {
    const s = new Date(a.startTime).getTime();
    const e = new Date(a.endTime).getTime();
    return Number.isFinite(s) && Number.isFinite(e) && e > s;
  });

  if (valid.length === 0) return [];

  // Sort by start time, then by longer duration first (so wider blocks appear left)
  const sorted = [...valid].sort((a, b) => {
    const diff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (diff !== 0) return diff;
    return new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
  });

  const results: LayoutSlot[] = [];
  let group: Array<{ appt: CalendarAppointment; column: number; endMs: number }> = [];

  function flushGroup() {
    if (group.length === 0) return;
    const totalColumns = Math.max(...group.map(g => g.column)) + 1;
    for (const item of group) {
      results.push({
        appointment: item.appt,
        column: item.column,
        totalColumns,
      });
    }
    group = [];
  }

  for (const appt of sorted) {
    const startMs = new Date(appt.startTime).getTime();
    const endMs = new Date(appt.endTime).getTime();

    // Check if this appointment overlaps with any in the current group
    const overlapsGroup = group.some(g => startMs < g.endMs);

    if (!overlapsGroup && group.length > 0) {
      flushGroup();
    }

    // Find the first available column (not occupied by an overlapping appointment)
    const occupiedColumns = new Set(
      group.filter(g => startMs < g.endMs).map(g => g.column),
    );
    let col = 0;
    while (occupiedColumns.has(col) && col < sorted.length) col++;

    group.push({ appt, column: col, endMs });
  }

  flushGroup();

  return results;
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locations } = useAuthContext();
  const locationId = (locations.find(l => l.locationType === 'venue') ?? locations[0])?.id;

  // ── Page view state (persisted to localStorage, URL param override) ──
  const searchParams = useSearchParams();
  const [pageView, setPageView] = useState<PageView>('quick');

  // Read URL param or localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'list' || urlView === 'calendar') {
      setPageView(urlView);
      return;
    }
    const stored = localStorage.getItem('spa_view_mode') as PageView | null;
    if (stored === 'quick' || stored === 'calendar' || stored === 'list') setPageView(stored);
  }, [searchParams]);

  const handlePageViewChange = useCallback((view: PageView) => {
    setPageView(view);
    localStorage.setItem('spa_view_mode', view);
    // Keep URL in sync — add ?view= for non-default views, remove for 'quick'
    const url = new URL(window.location.href);
    if (view === 'quick') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', view);
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Calendar view state
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [providerFilterOpen, setProviderFilterOpen] = useState(false);

  // Quick Reserve view state
  const [viewRange, setViewRange] = useState<ViewRange>(14);

  // Quick Book dialog state
  const [quickBookDate, setQuickBookDate] = useState('');
  const [quickBookCategoryId, setQuickBookCategoryId] = useState('');
  const [showQuickBookDialog, setShowQuickBookDialog] = useState(false);

  // Context menu + dialog state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [payNowAppointment, setPayNowAppointment] = useState<CalendarAppointment | null>(null);
  const [sendToPosAppointment, setSendToPosAppointment] = useState<CalendarAppointment | null>(null);

  // ── Quick Reserve date range ────────────────────────────────────
  const quickStartDate = useMemo(() => formatISODate(currentDate), [currentDate]);
  const quickEndDate = useMemo(() => formatISODate(addDays(currentDate, viewRange - 1)), [currentDate, viewRange]);

  // ── Calendar date range ─────────────────────────────────────────
  const { startDate: calStartDate, endDate: calEndDate } = useMemo(() => {
    if (viewMode === 'day') {
      const dayStr = formatISODate(currentDate);
      return { startDate: dayStr, endDate: dayStr };
    }
    const monday = getMonday(currentDate);
    const sunday = addDays(monday, 6);
    return { startDate: formatISODate(monday), endDate: formatISODate(sunday) };
  }, [viewMode, currentDate]);

  // ── Data hooks ──────────────────────────────────────────────────
  // Calendar data (only when in calendar view)
  const { data: calendarData, isLoading: calLoading, error: calError } = useSpaCalendar(
    pageView === 'calendar' ? { locationId, startDate: calStartDate, endDate: calEndDate } : null,
  );

  // Availability summary (only when in quick reserve view)
  const { data: availabilityData, isLoading: availLoading } = useSpaAvailabilitySummary(
    pageView === 'quick' ? { locationId, startDate: quickStartDate, endDate: quickEndDate } : null,
  );

  const PROVIDER_COLORS = [
    '#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa',
    '#a78bfa', '#fb923c', '#2dd4bf',
  ];

  // Map hook data to local CalendarProviderColumn shape
  const providers: CalendarProviderColumn[] = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- backend response shape differs from typed interface
    return (Array.isArray(calendarData?.providers) ? calendarData.providers : []).map((p: any, idx: number) => ({
      id: p.providerId as string,
      name: p.providerName as string,
      color: (p.providerColor as string) || PROVIDER_COLORS[idx % PROVIDER_COLORS.length]!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- backend fields differ from frontend type
      appointments: (p.appointments ?? []).map((a: any) => ({
        id: a.id as string,
        customerName: (a.guestName as string) ?? 'Walk-in',
        serviceName: Array.isArray(a.services) && a.services.length > 0
          ? (a.services[0] as Record<string, unknown>).serviceName as string
          : '',
        startTime: a.startAt as string,
        endTime: a.endAt as string,
        status: a.status as AppointmentStatus,
        providerId: (a.providerId as string) ?? null,
        orderId: (a.orderId as string) ?? null,
        totalCents: Array.isArray(a.services)
          ? (a.services as Array<Record<string, unknown>>).reduce((sum: number, s) => sum + (Number(s.finalPriceCents) || 0), 0)
          : 0,
      })),
    }));
  }, [calendarData]);

  const unassigned: CalendarAppointment[] = useMemo(() => {
    const raw = calendarData?.unassigned;
    if (!Array.isArray(raw)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- backend fields differ from frontend type
    return raw.map((a: any) => ({
      id: a.id as string,
      customerName: (a.guestName as string) ?? 'Walk-in',
      serviceName: Array.isArray(a.services) && a.services.length > 0
        ? (a.services[0] as Record<string, unknown>).serviceName as string
        : '',
      startTime: a.startAt as string,
      endTime: a.endAt as string,
      status: a.status as AppointmentStatus,
      providerId: (a.providerId as string) ?? null,
      orderId: (a.orderId as string) ?? null,
      totalCents: Array.isArray(a.services)
        ? (a.services as Array<Record<string, unknown>>).reduce((sum: number, s) => sum + (Number(s.finalPriceCents) || 0), 0)
        : 0,
    }));
  }, [calendarData]);

  const visibleProviders = useMemo(() => {
    if (selectedProviderIds.length === 0) return providers;
    return providers.filter((p) => selectedProviderIds.includes(p.id));
  }, [providers, selectedProviderIds]);

  const allProviders = useMemo(() => {
    return providers.map((p) => ({ id: p.id, name: p.name, color: p.color }));
  }, [providers]);

  // ── Navigation ──────────────────────────────────────────────────

  const goToPrev = useCallback(() => {
    if (pageView === 'quick') {
      setCurrentDate((prev) => addDays(prev, -viewRange));
    } else {
      setCurrentDate((prev) => addDays(prev, viewMode === 'day' ? -1 : -7));
    }
  }, [pageView, viewMode, viewRange]);

  const goToNext = useCallback(() => {
    if (pageView === 'quick') {
      setCurrentDate((prev) => addDays(prev, viewRange));
    } else {
      setCurrentDate((prev) => addDays(prev, viewMode === 'day' ? 1 : 7));
    }
  }, [pageView, viewMode, viewRange]);

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

  const weekDays = useMemo(() => {
    const monday = getMonday(currentDate);
    return getWeekDays(monday);
  }, [currentDate]);

  // ── Quick Reserve handlers ──────────────────────────────────────

  const handleQuickSelect = useCallback((date: string, categoryId: string) => {
    setQuickBookDate(date);
    setQuickBookCategoryId(categoryId);
    setShowQuickBookDialog(true);
  }, []);

  const handleQuickBookClose = useCallback(() => {
    setShowQuickBookDialog(false);
  }, []);

  // ── Appointment click / context menu handlers ───────────────────

  const handleAppointmentClick = useCallback((appt: CalendarAppointment) => {
    router.push(`/spa/appointments/${appt.id}`);
  }, [router]);

  const handleContextMenu = useCallback((e: React.MouseEvent, appt: CalendarAppointment) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, appointment: appt });
  }, []);

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

  const handlePaymentComplete = useCallback((_result: { isFullyPaid: boolean; orderId: string }) => {
    setPayNowAppointment(null);
    queryClient.invalidateQueries({ queryKey: ['spa-calendar'] });
  }, [queryClient]);

  // ── Date display helpers ────────────────────────────────────────

  const quickRangeLabel = useMemo(() => {
    const s = formatDateShort(currentDate);
    const e = formatDateShort(addDays(currentDate, viewRange - 1));
    return `${s} \u2013 ${e}`;
  }, [currentDate, viewRange]);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Spa Reservations</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Page view toggle (Quick Reserve / Calendar / List) */}
          <div className="flex rounded-lg border border-border bg-surface">
            {([
              { view: 'quick' as const, label: 'Quick Reserve', Icon: Zap },
              { view: 'calendar' as const, label: 'Calendar', Icon: CalendarDays },
              { view: 'list' as const, label: 'List', Icon: List },
            ]).map(({ view, label, Icon }, i, arr) => (
              <button
                key={view}
                onClick={() => handlePageViewChange(view)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === 0 ? 'rounded-l-lg' : ''
                }${i === arr.length - 1 ? 'rounded-r-lg' : ''} ${
                  pageView === view ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent/50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Quick Reserve: range selector (hidden in list view) */}
          {pageView === 'quick' && (
            <div className="flex rounded-lg border border-border bg-surface">
              {([7, 14, 30] as ViewRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setViewRange(r)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    viewRange === r ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  {r}d
                </button>
              ))}
            </div>
          )}

          {/* Date navigation (hidden in list view — list has own filters) */}
          {pageView !== 'list' && (
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
          )}

          {/* Calendar view: Day / Week toggle */}
          {pageView === 'calendar' && (
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
          )}

          {/* Calendar view: Provider filter */}
          {pageView === 'calendar' && (
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
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
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
          )}
        </div>
      </div>

      {/* Date display (hidden in list view) */}
      {pageView !== 'list' && (
        <div className="text-sm text-muted-foreground">
          {pageView === 'quick'
            ? quickRangeLabel
            : viewMode === 'day'
              ? formatDateDisplay(currentDate)
              : `${formatDateShort(weekDays[0]!)} - ${formatDateShort(weekDays[6]!)}`}
        </div>
      )}

      {/* ── Quick Reserve View ─────────────────────────────────────── */}
      {pageView === 'quick' && (
        <>
          {availLoading && <CondensedSkeleton />}
          {!availLoading && availabilityData && Array.isArray(availabilityData.days) && (
            <SpaCondensedView
              days={availabilityData.days}
              categories={availabilityData.categories ?? []}
              onSelectDate={handleQuickSelect}
            />
          )}
          {!availLoading && !availabilityData && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Zap className="mb-3 h-10 w-10" />
              <p className="text-sm">No availability data. Configure providers and services first.</p>
            </div>
          )}
        </>
      )}

      {/* ── Calendar View ──────────────────────────────────────────── */}
      {pageView === 'calendar' && (
        <>
          {/* Loading state */}
          {calLoading && <CalendarSkeleton />}

          {/* Error state */}
          {calError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {calError?.message ?? 'An error occurred'}
            </div>
          )}

          {/* Day view */}
          {!calLoading && !calError && viewMode === 'day' && (
            <DayView
              providers={visibleProviders}
              unassigned={unassigned}
              onAppointmentClick={handleAppointmentClick}
              onAppointmentContextMenu={handleContextMenu}
            />
          )}

          {/* Week view */}
          {!calLoading && !calError && viewMode === 'week' && (
            <WeekView
              providers={visibleProviders}
              unassigned={unassigned}
              weekDays={weekDays}
              onAppointmentClick={handleAppointmentClick}
              onAppointmentContextMenu={handleContextMenu}
            />
          )}

          {/* Empty state */}
          {!calLoading && !calError && visibleProviders.length === 0 && unassigned.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CalendarDays className="mb-3 h-10 w-10" />
              <p className="text-sm">No appointments scheduled for this period.</p>
            </div>
          )}
        </>
      )}

      {/* ── List View ───────────────────────────────────────────── */}
      {pageView === 'list' && (
        <SpaAppointmentListView
          onNewAppointment={() => router.push('/spa/appointments/new')}
        />
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
          totalCents={payNowAppointment.totalCents}
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
          totalCents={sendToPosAppointment.totalCents}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      {/* Quick Book dialog */}
      {showQuickBookDialog && locationId && (
        <SpaQuickBookDialog
          open={showQuickBookDialog}
          onClose={handleQuickBookClose}
          locationId={locationId}
          prefillDate={quickBookDate}
          prefillCategoryId={quickBookCategoryId}
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

              {/* Appointment blocks — side-by-side when overlapping */}
              {layoutOverlappingAppointments(col.appointments).map(({ appointment: appt, column: subCol, totalColumns }) => {
                const top = getTopPosition(appt.startTime);
                const height = Math.max(getHeight(appt.startTime, appt.endTime), 20);
                const colors = STATUS_COLORS[appt.status] ?? STATUS_COLORS.confirmed;

                if (top + height < 0 || top > TOTAL_HEIGHT_PX) return null;

                // Calculate horizontal position within the column
                const GAP = 2; // px gap between sub-columns
                const PADDING = 4; // px padding on each side of the provider column
                const leftPct = (subCol / totalColumns) * 100;
                const widthPct = (1 / totalColumns) * 100;

                return (
                  <button
                    key={appt.id}
                    onClick={() => onAppointmentClick(appt)}
                    onContextMenu={(e) => onAppointmentContextMenu(e, appt)}
                    className={`absolute overflow-hidden rounded border ${colors.bg} ${colors.border} px-1.5 py-1 text-left transition-opacity hover:opacity-80`}
                    style={{
                      top: `${Math.max(top, 0)}px`,
                      height: `${height}px`,
                      left: `calc(${leftPct}% + ${PADDING}px)`,
                      width: `calc(${widthPct}% - ${PADDING * 2 / totalColumns}px - ${GAP}px)`,
                      zIndex: 10 + subCol,
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
  const allAppointments = useMemo(() => {
    const list: CalendarAppointment[] = [];
    for (const provider of providers) {
      list.push(...provider.appointments);
    }
    list.push(...unassigned);
    return list;
  }, [providers, unassigned]);

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
    for (const [, appts] of map) {
      appts.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
    }
    return map;
  }, [allAppointments, weekDays]);

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
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
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

// ── Loading Skeletons ─────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex">
        <div className="w-20 shrink-0 border-r border-border">
          <div className="h-12 border-b border-border" />
          <div className="space-y-6 p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-3 w-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
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

function CondensedSkeleton() {
  return (
    <div className="flex min-h-[400px] gap-0 rounded-lg border border-border bg-surface">
      <div className="w-64 shrink-0 border-r border-border p-4 space-y-3">
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/30" />
        ))}
      </div>
      <div className="flex-1 p-5 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted/30" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted/20" />
          ))}
        </div>
      </div>
    </div>
  );
}
